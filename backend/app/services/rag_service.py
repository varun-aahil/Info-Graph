from __future__ import annotations

import logging
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from backend.app.models.entities import Document, DocumentChunk, DocumentGraphPoint, WorkspaceSettings
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

    import re

    for cluster_id in cluster_ids:
        # Check if cluster already has a custom name (not "Cluster X")
        current_label = db.scalar(
            select(DocumentGraphPoint.cluster_label)
            .where(
                DocumentGraphPoint.user_id == user_id,
                DocumentGraphPoint.cluster_id == cluster_id
            )
            .limit(1)
        )
        if current_label and not re.match(r"^Cluster \d+$", current_label):
            continue

        documents = db.scalars(
            select(Document)
            .join(DocumentGraphPoint, Document.id == DocumentGraphPoint.document_id)
            .where(
                DocumentGraphPoint.user_id == user_id,
                DocumentGraphPoint.cluster_id == cluster_id,
            )
        ).all()

        if not documents:
            continue

        doc_names = [doc.original_name for doc in documents]
        
        has_api_key = bool((workspace_settings.cloud_api_key or "").strip())
        is_local = workspace_settings.model_provider == "local"
        
        generated_label = ""
        
        if has_api_key or is_local:
            context = "\n".join(f"- {name}" for name in doc_names)
            prompt = (
                "Provide a concise, 3-word category title for a folder containing these documents. "
                "Return ONLY the title without any quotes, preambles, or extra text."
            )
            messages = [
                {"role": "system", "content": prompt},
                {"role": "user", "content": context},
            ]
            try:
                generated_label = provider_service.chat_completion(messages, workspace_settings).strip().strip('"').strip("'")
            except Exception as e:
                # Rate-limit (429), auth errors, etc — do NOT crash, just use a clean default
                logger.warning("Auto-title cluster %d failed: %s", cluster_id, e)
                generated_label = f"Cluster {cluster_id + 1}"

        if not generated_label:
            if len(doc_names) == 1:
                generated_label = doc_names[0][:50]
            elif len(doc_names) == 2:
                generated_label = f"{doc_names[0][:20]} & {doc_names[1][:20]}"
            else:
                generated_label = f"{doc_names[0][:20]}, {doc_names[1][:20]} & {len(doc_names) - 2} others"

        # Truncate to 120 chars — the DB column is VARCHAR(128)
        safe_label = str(generated_label)[:120]

        db.execute(
            update(DocumentGraphPoint)
            .where(
                DocumentGraphPoint.user_id == user_id,
                DocumentGraphPoint.cluster_id == cluster_id,
            )
            .values(cluster_label=safe_label)
        )

    db.flush()
