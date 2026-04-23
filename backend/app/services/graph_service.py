from __future__ import annotations

import math
from collections import Counter

import numpy as np
from sklearn.cluster import AgglomerativeClustering, DBSCAN, KMeans
from sklearn.decomposition import PCA
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from backend.app.models.entities import Document, DocumentGraphPoint, WorkspaceSettings
from backend.app.services.rag_service import auto_title_clusters


def _estimate_cluster_count(document_count: int) -> int:
    return max(1, min(document_count, round(math.sqrt(document_count)) or 1))


def _cluster_embeddings(vectors: np.ndarray, workspace_settings: WorkspaceSettings) -> np.ndarray:
    count = len(vectors)
    if count == 1:
        return np.array([0])

    method = workspace_settings.clustering_method
    if method == "dbscan":
        model = DBSCAN(metric="cosine", eps=0.35, min_samples=max(2, workspace_settings.min_cluster_size))
        return model.fit_predict(vectors)

    n_clusters = _estimate_cluster_count(count)
    if method == "hierarchical":
        model = AgglomerativeClustering(n_clusters=n_clusters)
        return model.fit_predict(vectors)

    model = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
    return model.fit_predict(vectors)


import umap
from sklearn.decomposition import PCA


def _project_embeddings(vectors: np.ndarray) -> np.ndarray:
    if len(vectors) == 0:
        return np.zeros((0, 2))
    if len(vectors) == 1:
        return np.array([[0.0, 0.0]])
    if vectors.shape[1] == 1:
        return np.column_stack((vectors[:, 0], np.zeros(len(vectors))))

    if len(vectors) < 4:
        # Fallback to PCA for very small datasets where UMAP neighborhoods don't make sense
        pca = PCA(n_components=2, random_state=42)
        return pca.fit_transform(vectors)

    n_neighbors = min(15, len(vectors) - 1)
    reducer = umap.UMAP(n_neighbors=n_neighbors, n_components=2, metric="cosine", random_state=42)
    return reducer.fit_transform(vectors)


def refresh_graph(db: Session, workspace_settings: WorkspaceSettings, user_id: str) -> None:
    documents = db.scalars(
        select(Document)
        .where(
            Document.user_id == user_id,
            Document.status == "ready",
            Document.document_embedding.is_not(None),
        )
        .options(selectinload(Document.chunks), selectinload(Document.graph_point))
        .order_by(Document.uploaded_at.asc())
    ).all()

    if not documents:
        db.execute(delete(DocumentGraphPoint).where(DocumentGraphPoint.user_id == user_id))
        db.flush()
        return

    ready_ids = {document.id for document in documents}
    db.execute(
        delete(DocumentGraphPoint).where(
            DocumentGraphPoint.user_id == user_id,
            DocumentGraphPoint.document_id.not_in(ready_ids),
        )
    )

    vectors = np.array([document.document_embedding for document in documents], dtype=float)
    labels = _cluster_embeddings(vectors, workspace_settings)
    coordinates = _project_embeddings(vectors)

    for index, document in enumerate(documents):
        cluster_id = int(labels[index])
        is_anomaly = cluster_id < 0
        snippet = (document.chunks[0].content[:280] if document.chunks else document.original_name).strip()
        cluster_label = "Anomaly" if is_anomaly else f"Cluster {cluster_id + 1}"

        point = document.graph_point or DocumentGraphPoint(document_id=document.id, user_id=user_id)
        point.user_id = user_id
        point.x = float(coordinates[index][0])
        point.y = float(coordinates[index][1])
        point.cluster_id = cluster_id
        point.cluster_label = cluster_label
        point.is_anomaly = is_anomaly
        point.representative_snippet = snippet
        if document.graph_point is None:
            db.add(point)

    db.flush()
    auto_title_clusters(db, workspace_settings, user_id)


def build_cluster_summaries(points: list[DocumentGraphPoint]) -> list[dict[str, int | str]]:
    counts = Counter(point.cluster_id for point in points)
    summaries: list[dict[str, int | str]] = []
    for cluster_id, document_count in sorted(counts.items(), key=lambda item: item[0]):
        summaries.append(
            {
                "id": cluster_id,
                "label": "Anomaly" if cluster_id < 0 else f"Cluster {cluster_id + 1}",
                "documentCount": document_count,
            }
        )
    return summaries
