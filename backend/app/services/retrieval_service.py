from __future__ import annotations

import logging
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from backend.app.models.entities import Document, DocumentChunk, DocumentGraphPoint
from backend.app.schemas.chat import ChatSelection
from backend.app.services.embeddings import ModelProviderService

logger = logging.getLogger(__name__)


def resolve_selection(db: Session, selection: ChatSelection, user_id: str) -> tuple[list[str], str]:
    if selection.document_id:
        document = db.scalar(
            select(Document).where(Document.id == selection.document_id, Document.user_id == user_id)
        )
        if document is None:
            raise LookupError("Document not found.")
        return [str(document.id)], f"Document: {document.original_name}"

    # Cluster path: look up all graph points that belong to the selected cluster
    points = db.scalars(
        select(DocumentGraphPoint).where(
            DocumentGraphPoint.user_id == user_id,
            DocumentGraphPoint.cluster_id == selection.cluster_id,
        )
    ).all()
    logger.info("Cluster %s resolved to %d graph points", selection.cluster_id, len(points))
    if not points:
        raise LookupError("Cluster not found.")

    cluster_label = points[0].cluster_label
    doc_ids = [str(point.document_id) for point in points]
    logger.info("Cluster '%s' doc_ids: %s", cluster_label, doc_ids)
    return doc_ids, f"Cluster: {cluster_label}"


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

    if not document_ids:
        logger.warning("resolve_selection returned empty doc_ids for selection %s", selection)
        return [], selection_label

    query_input = ["search_query: " + query]
    query_embedding = provider_service.embed_texts(query_input, workspace_settings)[0]

    ranked_chunks = db.scalars(
        select(DocumentChunk)
        .where(
            DocumentChunk.user_id == user_id,
            DocumentChunk.document_id.in_(document_ids),
        )
        .options(selectinload(DocumentChunk.document))
        .order_by(DocumentChunk.embedding.cosine_distance(query_embedding))
        .limit(limit)
    ).all()

    logger.info(
        "Retrieved %d chunks for %d documents (user=%s, query='%s...')",
        len(ranked_chunks), len(document_ids), user_id, query[:40],
    )
    return list(ranked_chunks), selection_label
