from __future__ import annotations

import json
from typing import Iterator

from backend.app.schemas.chat import ChatRequest
from backend.app.services.embeddings import ModelProviderService
from backend.app.services.retrieval_service import retrieve_relevant_chunks


SYSTEM_PROMPT = (
    "You are InfoGraph, a local RAG assistant. Answer using only the supplied document context. "
    "If the answer is not grounded in the context, say that the uploaded documents do not provide it."
)


def stream_chat_response(
    db,
    payload: ChatRequest,
    user_id: str,
    workspace_settings,
    provider_service: ModelProviderService,
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
        yield "data: " + json.dumps({"content": "I could not find any indexed document content for that selection yet."}) + "\n\n"
        yield "data: " + json.dumps({"sources": []}) + "\n\n"
        return

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
    for text_chunk in provider_service.stream_chat_completion(messages, workspace_settings):
        yield "data: " + json.dumps({"content": text_chunk}) + "\n\n"

    sources = [
        {"documentName": chunk.document.original_name, "chunkIndex": chunk.chunk_index}
        for chunk in chunks
    ]
    yield "data: " + json.dumps({"sources": sources}) + "\n\n"
