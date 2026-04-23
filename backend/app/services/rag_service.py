from __future__ import annotations

import logging
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from backend.app.models.entities import DocumentChunk, DocumentGraphPoint, WorkspaceSettings
from backend.app.services.embeddings import ModelProviderService

logger = logging.getLogger(__name__)

def auto_title_clusters(
    db: Session,
    workspace_settings: WorkspaceSettings,
    user_id: str,
    provider_service: ModelProviderService | None = None,
) -> None:
    if provider_service is None:
        provider_service = ModelProviderService()

    # Find unique clusters excluding anomaly cluster (-1)
    cluster_ids = db.scalars(
        select(DocumentGraphPoint.cluster_id)
        .where(
            DocumentGraphPoint.user_id == user_id,
            DocumentGraphPoint.cluster_id >= 0,
        )
        .distinct()
    ).all()

    for cluster_id in cluster_ids:
        # Retrieve the top 3 chunks for this cluster
        chunks = db.scalars(
            select(DocumentChunk)
            .join(DocumentGraphPoint, DocumentChunk.document_id == DocumentGraphPoint.document_id)
            .where(
                DocumentGraphPoint.user_id == user_id,
                DocumentGraphPoint.cluster_id == cluster_id,
            )
            .limit(3)
        ).all()

        if not chunks:
            continue

        context = "\n\n".join(f"Snippet:\n{chunk.content}" for chunk in chunks)
        prompt = (
            "Read these document snippets. Generate a concise, 2-to-3 word topic label "
            "that describes their shared theme. Return ONLY the label without any quotes or extra text."
        )

        messages = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": context},
        ]

        try:
            generated_label = provider_service.chat_completion(messages, workspace_settings).strip().strip('"').strip("'")
            if not generated_label:
                continue

            db.execute(
                update(DocumentGraphPoint)
                .where(
                    DocumentGraphPoint.user_id == user_id,
                    DocumentGraphPoint.cluster_id == cluster_id,
                )
                .values(cluster_label=generated_label)
            )
        except Exception as e:
            logger.error(f"Failed to auto-title cluster {cluster_id}: {e}")

    db.flush()
