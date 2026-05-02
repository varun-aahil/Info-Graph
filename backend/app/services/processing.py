from __future__ import annotations

from datetime import datetime

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker


from backend.app.models.entities import Document, DocumentChunk, IngestionJob
from backend.app.services.chunking import chunk_text
from backend.app.services.embeddings import ModelProviderService
from backend.app.services.graph_service import refresh_graph
from backend.app.services.pdf_processing import extract_pdf_text
from backend.app.services.settings_service import get_or_create_workspace_settings


def _latest_job(document: Document) -> IngestionJob:
    if not document.jobs:
        raise RuntimeError("Document does not have an ingestion job.")
    return document.jobs[-1]


def _update_stage(
    document: Document,
    job: IngestionJob,
    *,
    status: str,
    stage: str,
    progress: int,
    error_message: str | None = None,
) -> None:
    document.status = status
    document.progress = progress
    document.error_message = error_message
    job.status = status
    job.stage = stage
    job.progress = progress
    job.error_message = error_message
    if status == "processing" and job.started_at is None:
        job.started_at = datetime.utcnow()
    if status in {"ready", "error"}:
        job.finished_at = datetime.utcnow()


def process_document(session_factory: sessionmaker, document_id: str) -> None:
    provider_service = ModelProviderService()
    with session_factory() as db:
        document = db.scalar(select(Document).where(Document.id == document_id))
        if document is None:
            return

        job = _latest_job(document)

        try:
            _update_stage(document, job, status="processing", stage="validating", progress=10)
            db.commit()

            raw_text = extract_pdf_text(document.stored_path)
            _update_stage(document, job, status="processing", stage="parsed", progress=30)
            db.commit()

            chunks = chunk_text(raw_text)
            if not chunks:
                raise ValueError("The PDF did not yield any text chunks.")

            _update_stage(document, job, status="processing", stage="chunked", progress=60)
            db.query(DocumentChunk).filter(
                DocumentChunk.document_id == document.id,
                DocumentChunk.user_id == document.user_id,
            ).delete()
            db.commit()

            workspace_settings = get_or_create_workspace_settings(db, document.user_id)
            
            chunk_texts = [chunk.content for chunk in chunks]
            chunk_embeddings = []
            
            # Batch process embeddings to update progress smoothly (from 60 to 85)
            batch_size = 10 if workspace_settings.model_provider != "local" else 5
            total_chunks = len(chunk_texts)
            for i in range(0, total_chunks, batch_size):
                batch_texts = chunk_texts[i:i + batch_size]
                
                # Nomic local models use search_document prefix
                if workspace_settings.model_provider == "local":
                    embed_input = ["search_document: " + t for t in batch_texts]
                else:
                    embed_input = batch_texts
                
                batch_embeddings = provider_service.embed_texts(embed_input, workspace_settings)
                chunk_embeddings.extend(batch_embeddings)
                
                # Calculate progress: 60 to 85
                progress_step = 60 + int((len(chunk_embeddings) / total_chunks) * 25)
                _update_stage(document, job, status="processing", stage="embedding", progress=progress_step)
                db.commit()
            
            for index, chunk in enumerate(chunks):
                db.add(
                    DocumentChunk(
                        user_id=document.user_id,
                        document_id=document.id,
                        chunk_index=index,
                        content=chunk.content,
                        token_count=chunk.token_count,
                        embedding=chunk_embeddings[index],
                    )
                )

            if workspace_settings.model_provider == "local":
                doc_embed_input = ["search_document: " + raw_text]
            else:
                doc_embed_input = [raw_text]
                
            document.document_embedding = provider_service.embed_texts(doc_embed_input, workspace_settings)[0]
            _update_stage(document, job, status="processing", stage="embedded", progress=85)
            db.commit()

            document.processed_at = datetime.utcnow()
            _update_stage(document, job, status="ready", stage="completed", progress=100)
            db.commit()

            # Graph refresh is done separately so a deadlock here
            # does NOT roll back the document's "ready" status.
            import time as _time
            for attempt in range(3):
                try:
                    refresh_graph(db, workspace_settings, document.user_id)
                    db.commit()
                    break
                except Exception as graph_exc:
                    db.rollback()
                    import logging
                    logging.getLogger(__name__).warning(
                        "refresh_graph attempt %d failed: %s", attempt + 1, graph_exc
                    )
                    if attempt < 2:
                        _time.sleep(1)
        except Exception as exc:
            db.rollback()
            document = db.get(Document, document_id)
            if document is None:
                return
            job = _latest_job(document)
            _update_stage(
                document,
                job,
                status="error",
                stage="failed",
                progress=document.progress,
                error_message=str(exc),
            )
            db.commit()
