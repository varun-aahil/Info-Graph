from pathlib import Path

from pypdf import PdfReader


def extract_pdf_text(stored_path: str) -> str:
    reader = PdfReader(Path(stored_path))
    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n".join(part.strip() for part in pages if part.strip()).strip()
    if not text:
        raise ValueError("The PDF did not contain extractable text.")
    return text
