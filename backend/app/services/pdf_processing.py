import logging
from pathlib import Path
from pypdf import PdfReader

logger = logging.getLogger(__name__)

def extract_pdf_text(stored_path: str) -> str:
    """
    Extracts text from a PDF file using a memory-efficient page-by-page approach.
    Falls back to OCR only if no text is found in the entire document.
    """
    try:
        text_parts = []
        try:
            reader = PdfReader(Path(stored_path))
            # Process page by page to keep memory footprint low
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text.strip())
        except Exception as read_err:
            logger.warning(f"PyPDF failed to read document: {str(read_err)}")
        
        full_text = "\n".join(text_parts).strip()
        
        # If no text was extracted, attempt OCR page-by-page
        if not full_text:
            logger.info("No text extracted via PyPDF, attempting page-by-page OCR...")
            try:
                import pytesseract
                from pdf2image import convert_from_path
                
                # We process pages individually to avoid loading all images into RAM
                # Render Free (512MB) will crash if we load more than a few images at once.
                ocr_text = []
                
                # Get total pages without rendering
                import pypdf
                pdf_info = pypdf.PdfReader(stored_path)
                total_pages = len(pdf_info.pages)
                
                # Limit OCR to first 30 pages in cloud deployment to prevent OOM
                max_pages = min(total_pages, 30)
                
                for i in range(max_pages):
                    # Convert only ONE page at a time
                    images = convert_from_path(
                        stored_path, 
                        first_page=i+1, 
                        last_page=i+1,
                        dpi=150 # Lower DPI to save memory
                    )
                    if images:
                        page_text = pytesseract.image_to_string(images[0])
                        if page_text.strip():
                            ocr_text.append(page_text.strip())
                        # Explicitly close image to free memory
                        images[0].close()
                
                full_text = "\n".join(ocr_text).strip()
            except ImportError:
                logger.error("OCR dependencies (pytesseract/pdf2image) are missing.")
                raise ValueError("The PDF is a scan and OCR tools are not installed.")
            except Exception as ocr_err:
                logger.error(f"OCR failed: {str(ocr_err)}")
                raise ValueError("The PDF is a scan and OCR processing failed due to memory limits.")
            
        if not full_text:
            raise ValueError("The PDF appears to be empty or unreadable.")
            
        return full_text
    except Exception as e:
        logger.error(f"Failed to parse PDF: {str(e)}")
        raise ValueError(f"Failed to parse PDF: {str(e)}")
