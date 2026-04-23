from dataclasses import dataclass


@dataclass
class ChunkPayload:
    content: str
    token_count: int


def chunk_text(text: str, chunk_size: int = 1200, overlap: int = 200) -> list[ChunkPayload]:
    normalized = " ".join(text.split())
    if not normalized:
        return []

    chunks: list[ChunkPayload] = []
    start = 0
    while start < len(normalized):
        end = min(len(normalized), start + chunk_size)
        content = normalized[start:end].strip()
        if content:
            chunks.append(ChunkPayload(content=content, token_count=len(content.split())))
        if end >= len(normalized):
            break
        start = max(0, end - overlap)

    return chunks
