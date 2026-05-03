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

    # Default embedding models per provider — used when user hasn't
    # explicitly configured one or the stored default is wrong.
    _PROVIDER_EMBEDDING_DEFAULTS: dict[str, str] = {
        "gemini":    "gemini/gemini-embedding-001",   # free, 768-dim
        "openai":    "text-embedding-3-small",       # 1536-dim
        "anthropic":  "gemini/gemini-embedding-001",   # Anthropic has no native embedding; use Gemini as fallback
        "xai":       "gemini/gemini-embedding-001",    # xAI has no native embedding; use Gemini as fallback
        "cloud":     "text-embedding-3-small",       # legacy fallback
    }

    def _resolve_cloud_embedding_model(self, workspace_settings: WorkspaceSettings) -> str:
        provider = workspace_settings.model_provider or "cloud"
        stored = (workspace_settings.cloud_embedding_model or "").strip()

        default = self._PROVIDER_EMBEDDING_DEFAULTS.get(provider, "text-embedding-3-small")

        if not stored or (provider == "gemini" and not stored.startswith("gemini/")):
            return default
            
        # Force override deprecated Gemini models
        if stored in ("gemini/text-embedding-004", "gemini/embedding-001"):
            return "gemini/gemini-embedding-001"
            
        return stored

    def _resolve_local_chat_model(self, workspace_settings: WorkspaceSettings) -> str:
        model = (workspace_settings.cloud_chat_model or self.app_settings.ollama_chat_model).strip()
        return model or self.app_settings.ollama_chat_model

    def _resolve_local_embedding_model(self, workspace_settings: WorkspaceSettings) -> str:
        model = (workspace_settings.cloud_embedding_model or self.app_settings.ollama_embedding_model).strip()
        return model or self.app_settings.ollama_embedding_model

    def embed_texts(self, texts: list[str], workspace_settings: WorkspaceSettings) -> list[list[float]]:
        if not texts:
            return []

        if workspace_settings.model_provider == "local":
            return self._embed_with_ollama(texts, workspace_settings)
        return self._embed_with_litellm(texts, workspace_settings)

    def chat_completion(
        self,
        messages: list[dict[str, str]],
        workspace_settings: WorkspaceSettings,
    ) -> str:
        if workspace_settings.model_provider == "local":
            return self._chat_with_ollama(messages, workspace_settings)
        return self._chat_with_litellm(messages, workspace_settings)

    def stream_chat_completion(
        self,
        messages: list[dict[str, str]],
        workspace_settings: WorkspaceSettings,
    ) -> Iterator[str]:
        if workspace_settings.model_provider == "local":
            return self._stream_chat_with_ollama(messages, workspace_settings)
        return self._stream_chat_with_litellm(messages, workspace_settings)

    def _embed_with_litellm(
        self,
        texts: list[str],
        workspace_settings: WorkspaceSettings,
    ) -> list[list[float]]:
        import litellm

        model = self._resolve_cloud_embedding_model(workspace_settings)
        provider = workspace_settings.model_provider or "cloud"

        # For Gemini embedding, we need to use the Gemini API key
        # even if the user's "cloud" provider is something else.
        if model.startswith("gemini/"):
            # Use the workspace key — it should be a Gemini key if provider is gemini,
            # otherwise fall back to the app-level key.
            api_key = self._resolve_cloud_api_key(workspace_settings)
            api_base = None  # Let LiteLLM handle Gemini routing natively
            custom_provider = "gemini"
        else:
            api_key = self._resolve_cloud_api_key(workspace_settings)
            api_base = self._resolve_cloud_base_url(workspace_settings)
            custom_provider = None

        response = litellm.embedding(
            model=model,
            api_key=api_key,
            api_base=api_base,
            custom_llm_provider=custom_provider,
            input=texts,
        )
        return [item["embedding"] for item in response.data]

    def _chat_with_litellm(
        self,
        messages: list[dict[str, str]],
        workspace_settings: WorkspaceSettings,
    ) -> str:
        import litellm
        
        model = self._resolve_cloud_chat_model(workspace_settings)
        custom_provider = "gemini" if model.startswith("gemini/") else None
        
        response = litellm.completion(
            model=model,
            api_key=self._resolve_cloud_api_key(workspace_settings),
            api_base=self._resolve_cloud_base_url(workspace_settings),
            custom_llm_provider=custom_provider,
            messages=messages,
        )
        return response.choices[0].message.content or ""

    def _stream_chat_with_litellm(
        self,
        messages: list[dict[str, str]],
        workspace_settings: WorkspaceSettings,
    ) -> Iterator[str]:
        import litellm

        model = self._resolve_cloud_chat_model(workspace_settings)
        custom_provider = "gemini" if model.startswith("gemini/") else None

        response = litellm.completion(
            model=model,
            api_key=self._resolve_cloud_api_key(workspace_settings),
            api_base=self._resolve_cloud_base_url(workspace_settings),
            custom_llm_provider=custom_provider,
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
                "model": self._resolve_local_embedding_model(workspace_settings),
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
                "model": self._resolve_local_chat_model(workspace_settings),
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
                "model": self._resolve_local_chat_model(workspace_settings),
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
