from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.api.deps import get_current_active_user
from backend.app.core.config import get_settings
from backend.app.core.database import get_db
from backend.app.models.entities import ChatSession, Document, IngestionJob, User, generate_uuid
from backend.app.schemas.documents import DocumentResponse, ImportUrlRequest, UploadDocumentsResponse
from backend.app.services.file_storage import delete_file, download_pdf_from_url, store_pdf_bytes
from backend.app.services.graph_service import refresh_graph
from backend.app.services.settings_service import get_or_create_workspace_settings

router = APIRouter()


def _new_document_id() -> str:
    return generate_uuid()


def _serialize_document(document: Document) -> DocumentResponse:
    latest_job = document.jobs[-1] if document.jobs else None
    return DocumentResponse(
        id=document.id,
        source_type=document.source_type,
        source_value=document.source_value,
        original_name=document.original_name,
        stored_path=document.stored_path,
        file_size=document.file_size,
        mime_type=document.mime_type,
        status=document.status,
        progress=document.progress,
        error_message=document.error_message,
        uploaded_at=document.uploaded_at,
        processed_at=document.processed_at,
        job_id=latest_job.id if latest_job else None,
    )


@router.post("/upload", response_model=UploadDocumentsResponse)
async def upload_documents(
    request: Request,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> UploadDocumentsResponse:
    app_settings = get_settings()
    created_documents: list[DocumentResponse] = []

    for upload in files:
        filename = upload.filename or "document.pdf"
        if not filename.lower().endswith(".pdf") and upload.content_type != "application/pdf":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF uploads are supported.")

        document_id = _new_document_id()
        stored_file = store_pdf_bytes(
            document_id=document_id,
            filename=filename,
            content=await upload.read(),
            settings=app_settings,
        )
        document = Document(
            id=document_id,
            user_id=current_user.id,
            source_type="upload",
            source_value=None,
            original_name=stored_file.original_name,
            stored_path=stored_file.stored_path,
            file_size=stored_file.file_size,
            mime_type=stored_file.mime_type,
            status="queued",
            progress=0,
        )
        job = IngestionJob(
            user_id=current_user.id,
            document_id=document_id,
            status="queued",
            stage="queued",
            progress=0,
        )
        document.jobs.append(job)
        db.add(document)
        db.commit()
        db.refresh(document)
        created_documents.append(_serialize_document(document))
        await request.app.state.ingestion_queue.enqueue(document.id)

    return UploadDocumentsResponse(documents=created_documents)


@router.post("/import-url", response_model=DocumentResponse)
async def import_document_from_url(
    payload: ImportUrlRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> DocumentResponse:
    app_settings = get_settings()
    document_id = _new_document_id()
    try:
        stored_file = download_pdf_from_url(str(payload.url), app_settings, document_id)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    document = Document(
        id=document_id,
        user_id=current_user.id,
        source_type="url",
        source_value=str(payload.url),
        original_name=stored_file.original_name,
        stored_path=stored_file.stored_path,
        file_size=stored_file.file_size,
        mime_type=stored_file.mime_type,
        status="queued",
        progress=0,
    )
    job = IngestionJob(
        user_id=current_user.id,
        document_id=document_id,
        status="queued",
        stage="queued",
        progress=0,
    )
    document.jobs.append(job)
    db.add(document)
    db.commit()
    db.refresh(document)
    await request.app.state.ingestion_queue.enqueue(document.id)
    return _serialize_document(document)


@router.get("", response_model=list[DocumentResponse])
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[DocumentResponse]:
    documents = db.scalars(
        select(Document)
        .where(Document.user_id == current_user.id)
        .options(selectinload(Document.jobs))
        .order_by(Document.uploaded_at.desc())
    ).all()
    return [_serialize_document(document) for document in documents]


@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> DocumentResponse:
    document = db.scalar(
        select(Document)
        .where(Document.id == document_id, Document.user_id == current_user.id)
        .options(selectinload(Document.jobs))
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return _serialize_document(document)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Response:
    document = db.scalar(
        select(Document)
        .where(Document.id == document_id, Document.user_id == current_user.id)
        .options(selectinload(Document.jobs), selectinload(Document.chunks), selectinload(Document.graph_point))
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    # Delete any chat sessions associated with this document
    linked_sessions = db.scalars(
        select(ChatSession).where(
            ChatSession.user_id == current_user.id,
            ChatSession.session_type == "document",
            ChatSession.target_id == document_id,
        )
    ).all()
    for session in linked_sessions:
        db.delete(session)

    stored_path = document.stored_path
    db.delete(document)
    db.commit()
    delete_file(stored_path)

    workspace_settings = get_or_create_workspace_settings(db, current_user.id)
    refresh_graph(db, workspace_settings, current_user.id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
