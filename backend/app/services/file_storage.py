from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import httpx

from backend.app.core.config import Settings


@dataclass
class StoredFile:
    original_name: str
    stored_path: str
    file_size: int
    mime_type: str


def _safe_filename(filename: str | None, document_id: str) -> str:
    name = Path(filename or f"{document_id}.pdf").name
    suffix = Path(name).suffix.lower()
    if suffix != ".pdf":
        name = f"{Path(name).stem or document_id}.pdf"
    return f"{document_id}_{name}"


def store_pdf_bytes(
    *,
    document_id: str,
    filename: str | None,
    content: bytes,
    settings: Settings,
) -> StoredFile:
    safe_name = _safe_filename(filename, document_id)
    destination = settings.storage_dir / safe_name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)
    return StoredFile(
        original_name=Path(filename or safe_name).name,
        stored_path=str(destination),
        file_size=len(content),
        mime_type="application/pdf",
    )


def download_pdf_from_url(url: str, settings: Settings, document_id: str) -> StoredFile:
    response = httpx.get(url, follow_redirects=True, timeout=60.0)
    response.raise_for_status()
    content_type = response.headers.get("content-type", "")
    parsed = urlparse(url)
    filename = Path(parsed.path).name or f"{document_id}.pdf"

    if "pdf" not in content_type.lower() and not filename.lower().endswith(".pdf"):
        raise ValueError("Only direct PDF URLs are supported.")

    return store_pdf_bytes(
        document_id=document_id,
        filename=filename,
        content=response.content,
        settings=settings,
    )


def delete_file(stored_path: str) -> None:
    path = Path(stored_path)
    if path.exists():
        path.unlink()
