from __future__ import annotations

import json
from typing import Iterator

from backend.app.schemas.chat import ChatRequest
from backend.app.services.embeddings import ModelProviderService
from backend.app.services.retrieval_service import retrieve_relevant_chunks


SYSTEM_PROMPT = (
    "You are InfoGraph, a precise local RAG assistant. Answer using only the supplied document context. "
    "If the answer is not grounded in the context, say that the uploaded documents do not provide it. "
    "Provide detailed information in a concise manner. Use bullet points and short sentences rather than long paragraphs."
)


def _scrub_llm_error(exc: Exception) -> str:
    """Convert raw LiteLLM exceptions into clean, human-readable messages."""
    raw = str(exc)
    if "429" in raw or "Quota" in raw or "RateLimitError" in raw or "rate_limit" in raw:
        return "Google API quota exceeded. Please try again later or upgrade your API tier."
    if "400" in raw or "AuthenticationError" in raw or "Invalid API Key" in raw:
        return "Invalid API Key. Please update your key in Settings."
    if "404" in raw or "NotFoundError" in raw:
        return "The selected model was not found. Please check your model in Settings."
    return "LLM Error: Could not generate a response. Please check your Settings."


def stream_chat_response(
    db,
    payload: ChatRequest,
    user_id: str,
    workspace_settings,
    provider_service: ModelProviderService,
    session_id: str,
) -> Iterator[str]:
    chunks, selection_label = retrieve_relevant_chunks(
        db=db,
        selection=payload.selection,
        query=payload.message,
        user_id=user_id,
        provider_service=provider_service,
        workspace_settings=workspace_settings,
    )

    if not chunks:
        context_block = "(No document content was found for this selection. The documents may still be processing.)"
    else:
        context_block = "\n\n".join(
            f"[Chunk {index + 1}]\n{chunk.content}" for index, chunk in enumerate(chunks)
        )
    history = [
        {"role": message.role, "content": message.content}
        for message in payload.history[-6:]
        if message.role in {"user", "assistant"}
    ]
    messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}, *history]
    messages.append(
        {
            "role": "user",
            "content": (
                f"{selection_label}\n\n"
                f"Document context:\n{context_block}\n\n"
                f"Question: {payload.message}"
            ),
        }
    )
    from backend.app.models.entities import ChatMessage, ChatSession
    from datetime import datetime

    # Save user message
    user_msg = ChatMessage(
        session_id=session_id,
        role="user",
        content=payload.message
    )
    db.add(user_msg)
    
    # Update session updated_at
    db.query(ChatSession).filter(ChatSession.id == session_id).update({"updated_at": datetime.utcnow()})
    db.commit()

    if not workspace_settings.cloud_base_url or not workspace_settings.cloud_base_url.strip():
        workspace_settings.cloud_base_url = None

    # Yield session id immediately
    yield "data: " + json.dumps({"session_id": session_id}) + "\n\n"

    full_assistant_response = ""

    try:
        stream = provider_service.stream_chat_completion(messages, workspace_settings)
        first_chunk = next(stream, None)
    except Exception as exc:
        msg = _scrub_llm_error(exc)
        yield "data: " + json.dumps({"content": msg}) + "\n\n"
        yield "data: " + json.dumps({"sources": []}) + "\n\n"
        return

    if first_chunk:
        full_assistant_response += first_chunk
        yield "data: " + json.dumps({"content": first_chunk}) + "\n\n"
        
    try:
        for text_chunk in stream:
            full_assistant_response += text_chunk
            yield "data: " + json.dumps({"content": text_chunk}) + "\n\n"
    except Exception as exc:
        msg = _scrub_llm_error(exc)
        full_assistant_response += f"\n\n{msg}"
        yield "data: " + json.dumps({"content": f"\n\n{msg}"}) + "\n\n"

    # Save assistant message
    if full_assistant_response:
        assistant_msg = ChatMessage(
            session_id=session_id,
            role="assistant",
            content=full_assistant_response
        )
        db.add(assistant_msg)
        db.query(ChatSession).filter(ChatSession.id == session_id).update({"updated_at": datetime.utcnow()})
        db.commit()

    sources = [
        {"documentName": chunk.document.original_name, "chunkIndex": chunk.chunk_index}
        for chunk in chunks
    ]
    yield "data: " + json.dumps({"sources": sources}) + "\n\n"

