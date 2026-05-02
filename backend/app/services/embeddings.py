from __future__ import annotations

from typing import Any, Iterator

import httpx

from backend.app.core.config import get_settings
from backend.app.models.entities import WorkspaceSettings


class ModelProviderService:
    def __init__(self) -> None:
        self.app_settings = get_settings()

    def _resolve_cloud_api_key(self, workspace_settings: WorkspaceSettings) -> str:
        api_key = (workspace_settings.cloud_api_key or self.app_settings.openai_api_key or "").strip()
        if not api_key:
            raise RuntimeError("Cloud API key is not configured.")
        return api_key

    def _resolve_cloud_base_url(self, workspace_settings: WorkspaceSettings) -> str | None:
        """Return None for standard cloud providers — LiteLLM handles routing.
        Only return a custom base URL if it's explicitly set and isn't a known
        provider URL that would conflict with LiteLLM's native routing."""
        # Standard providers: let LiteLLM route natively via model prefix
        if workspace_settings.model_provider in ("gemini", "openai", "anthropic", "xai"):
            return None
        url = (workspace_settings.cloud_base_url or self.app_settings.openai_base_url or "").strip()
        if not url or "generativelanguage" in url:
            return None
        return url

    def _resolve_cloud_chat_model(self, workspace_settings: WorkspaceSettings) -> str:
        model = (workspace_settings.cloud_chat_model or self.app_settings.openai_chat_model).strip()
        if workspace_settings.model_provider == "gemini" and not model.startswith("gemini/"):
            return f"gemini/{model}"
        if workspace_settings.model_provider == "xai" and not model.startswith("xai/"):
            return f"xai/{model}"
        return model

    def _resolve_cloud_embedding_model(self, workspace_settings: WorkspaceSettings) -> str:
        return (workspace_settings.cloud_embedding_model or self.app_settings.openai_embedding_model).strip()

    def embed_texts(self, texts: list[str], workspace_settings: WorkspaceSettings) -> list[list[float]]:
        if not texts:
            return []

        if workspace_settings.model_provider == "local":
            if self.app_settings.app_mode == "web":
                raise ValueError("Local models are not supported in the cloud deployment.")
            return self._embed_with_ollama(texts, workspace_settings)
        return self._embed_with_litellm(texts, workspace_settings)

    def chat_completion(
        self,
        messages: list[dict[str, str]],
        workspace_settings: WorkspaceSettings,
    ) -> str:
        if workspace_settings.model_provider == "local":
            if self.app_settings.app_mode == "web":
                raise ValueError("Local models are not supported in the cloud deployment.")
            return self._chat_with_ollama(messages, workspace_settings)
        return self._chat_with_litellm(messages, workspace_settings)

    def stream_chat_completion(
        self,
        messages: list[dict[str, str]],
        workspace_settings: WorkspaceSettings,
    ) -> Iterator[str]:
        if workspace_settings.model_provider == "local":
            if self.app_settings.app_mode == "web":
                raise ValueError("Local models are not supported in the cloud deployment.")
            return self._stream_chat_with_ollama(messages, workspace_settings)
        return self._stream_chat_with_litellm(messages, workspace_settings)

    def _embed_with_litellm(
        self,
        texts: list[str],
        workspace_settings: WorkspaceSettings,
    ) -> list[list[float]]:
        import litellm
        
        response = litellm.embedding(
            model=self._resolve_cloud_embedding_model(workspace_settings),
            api_key=self._resolve_cloud_api_key(workspace_settings),
            api_base=self._resolve_cloud_base_url(workspace_settings),
            input=texts,
        )
        return [item["embedding"] for item in response.data]

    def _chat_with_litellm(
        self,
        messages: list[dict[str, str]],
        workspace_settings: WorkspaceSettings,
    ) -> str:
        import litellm
        
        response = litellm.completion(
            model=self._resolve_cloud_chat_model(workspace_settings),
            api_key=self._resolve_cloud_api_key(workspace_settings),
            api_base=self._resolve_cloud_base_url(workspace_settings),
            messages=messages,
        )
        return response.choices[0].message.content or ""

    def _stream_chat_with_litellm(
        self,
        messages: list[dict[str, str]],
        workspace_settings: WorkspaceSettings,
    ) -> Iterator[str]:
        import litellm

        response = litellm.completion(
            model=self._resolve_cloud_chat_model(workspace_settings),
            api_key=self._resolve_cloud_api_key(workspace_settings),
            api_base=self._resolve_cloud_base_url(workspace_settings),
            messages=messages,
            stream=True,
        )
        for chunk in response:
            content = chunk.choices[0].delta.content
            if content:
                yield content

    def _embed_with_ollama(
        self,
        texts: list[str],
        workspace_settings: WorkspaceSettings,
    ) -> list[list[float]]:
        response = httpx.post(
            f"{workspace_settings.local_base_url.rstrip('/')}/api/embed",
            json={
                "model": self.app_settings.ollama_embedding_model,
                "input": texts,
            },
            timeout=120.0,
        )
        response.raise_for_status()
        payload = response.json()
        embeddings = payload.get("embeddings")
        if not embeddings and payload.get("embedding"):
            embeddings = [payload["embedding"]]
        if not embeddings:
            raise RuntimeError("Ollama did not return embeddings.")
        return embeddings

    def _chat_with_ollama(
        self,
        messages: list[dict[str, str]],
        workspace_settings: WorkspaceSettings,
    ) -> str:
        response = httpx.post(
            f"{workspace_settings.local_base_url.rstrip('/')}/api/chat",
            json={
                "model": self.app_settings.ollama_chat_model,
                "messages": messages,
                "stream": False,
            },
            timeout=120.0,
        )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        message = payload.get("message") or {}
        content = message.get("content")
        if not content:
            raise RuntimeError("Ollama did not return a chat response.")
        return content

    def _stream_chat_with_ollama(
        self,
        messages: list[dict[str, str]],
        workspace_settings: WorkspaceSettings,
    ) -> Iterator[str]:
        import json

        with httpx.stream(
            "POST",
            f"{workspace_settings.local_base_url.rstrip('/')}/api/chat",
            json={
                "model": self.app_settings.ollama_chat_model,
                "messages": messages,
                "stream": True,
            },
            timeout=120.0,
        ) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if line:
                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
