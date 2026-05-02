from pathlib import Path

from pypdf import PdfReader


def extract_pdf_text(stored_path: str) -> str:
    try:
        text = ""
        try:
            reader = PdfReader(Path(stored_path))
            pages = [page.extract_text() or "" for page in reader.pages]
            text = "\n".join(part.strip() for part in pages if part.strip()).strip()
        except Exception as read_err:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"PyPDF2 failed to read document, falling back to OCR: {str(read_err)}")
        
        if not text:
            # Fallback to OCR for scanned PDFs
            try:
                import pytesseract
                from pdf2image import convert_from_path
                
                images = convert_from_path(stored_path)
                ocr_text = []
                for img in images:
                    page_text = pytesseract.image_to_string(img)
                    ocr_text.append(page_text)
                
                text = "\n".join(ocr_text).strip()
            except ImportError:
                raise ValueError("The PDF did not contain extractable text and OCR dependencies are missing.")
            
        if not text:
            raise ValueError("The PDF did not contain extractable text even after OCR.")
            
        return text
    except Exception as e:
        raise ValueError(f"Failed to parse PDF: {str(e)}")
