from __future__ import annotations

from sqlalchemy import select, text
from sqlalchemy.orm import Session, selectinload

from backend.app.models.entities import Document, DocumentChunk, DocumentGraphPoint
from backend.app.schemas.chat import ChatSelection
from backend.app.services.embeddings import ModelProviderService


def resolve_selection(db: Session, selection: ChatSelection, user_id: str) -> tuple[list[str], str]:
    if selection.document_id:
        document = db.scalar(
            select(Document).where(Document.id == selection.document_id, Document.user_id == user_id)
        )
        if document is None:
            raise LookupError("Document not found.")
        return [document.id], f"Document: {document.original_name}"

    points = db.scalars(
        select(DocumentGraphPoint).where(
            DocumentGraphPoint.user_id == user_id,
            DocumentGraphPoint.cluster_id == selection.cluster_id,
        )
    ).all()
    if not points:
        raise LookupError("Cluster not found.")

    cluster_label = points[0].cluster_label
    return [point.document_id for point in points], f"Cluster: {cluster_label}"


def retrieve_relevant_chunks(
    db: Session,
    selection: ChatSelection,
    query: str,
    user_id: str,
    provider_service: ModelProviderService,
    workspace_settings,
    limit: int = 6,
) -> tuple[list[DocumentChunk], str]:
    document_ids, selection_label = resolve_selection(db, selection, user_id)
    query_embedding = provider_service.embed_texts([query], workspace_settings)[0]

    query_vector_str = f"[{','.join(map(str, query_embedding))}]"

    ranked_chunks = db.scalars(
        select(DocumentChunk)
        .where(
            DocumentChunk.user_id == user_id,
            DocumentChunk.document_id.in_(document_ids),
        )
        .options(selectinload(DocumentChunk.document))
        .order_by(text("embedding::text::vector <-> :query_vector::vector"))
        .limit(limit)
        .params(query_vector=query_vector_str)
    ).all()

    return list(ranked_chunks), selection_label
