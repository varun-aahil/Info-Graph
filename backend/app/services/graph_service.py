from __future__ import annotations

import math
import logging
from collections import Counter

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from sklearn.manifold import TSNE
from sklearn.decomposition import PCA

from backend.app.models.entities import Document, DocumentGraphPoint, WorkspaceSettings
from backend.app.services.rag_service import auto_title_clusters

logger = logging.getLogger(__name__)


def _estimate_cluster_count(document_count: int) -> int:
    return max(1, min(document_count, round(math.sqrt(document_count)) or 1))


def _cluster_embeddings(vectors: np.ndarray, workspace_settings: WorkspaceSettings) -> np.ndarray:
    count = len(vectors)
    if count < 2:
        return np.zeros(count, dtype=int)

    method = workspace_settings.clustering_method.lower()

    if method == "kmeans":
        n_clusters = max(2, min(count // 2, 5))
        model = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
        labels = model.fit_predict(vectors)

    elif method == "dbscan":
        # DBSCAN: density-based — outliers get label -1 (noise)
        min_samples = max(2, workspace_settings.min_cluster_size)
        # Increased eps to 0.7 to be more inclusive for semantic clusters
        from sklearn.preprocessing import normalize
        normed = normalize(vectors, norm="l2")
        model = DBSCAN(eps=0.7, min_samples=min_samples, metric="cosine")
        labels = model.fit_predict(normed)
        # We removed the KMeans fallback to ensure users can see DBSCAN's specific behavior (Grey noise points)

    elif method == "hierarchical":
        # Agglomerative clustering: hierarchical approach
        # Instead of a threshold, we'll use a cluster count similar to KMeans 
        # but using Ward linkage to see a different grouping logic.
        n_clusters = max(2, min(count // 2, 5))
        model = AgglomerativeClustering(n_clusters=n_clusters, metric="euclidean", linkage="ward")
        labels = model.fit_predict(vectors)

    else:
        # Unknown method — default to kmeans
        logger.warning("Unknown clustering method '%s', falling back to kmeans", method)
        n_clusters = max(2, min(count // 2, 5))
        labels = KMeans(n_clusters=n_clusters, n_init=10, random_state=42).fit_predict(vectors)

    # Post-process to enforce min_cluster_size
    min_size = workspace_settings.min_cluster_size
    if min_size > 1:
        counts = Counter(labels)
        for i in range(len(labels)):
            if labels[i] >= 0 and counts[labels[i]] < min_size:
                labels[i] = -1

    return labels


def _project_embeddings(vectors: np.ndarray) -> np.ndarray:
    """Project high-dimensional embeddings to 2D for visualization.
    
    Uses UMAP to preserve both local and global structure.
    """
    if len(vectors) == 0:
        return np.zeros((0, 2))
    if len(vectors) == 1:
        return np.array([[0.0, 0.0]])

    # Add a tiny bit of noise to prevent perfect overlaps
    rng = np.random.RandomState(42)
    vectors = vectors + rng.normal(0, 1e-5, vectors.shape)

    if vectors.shape[1] == 1:
        return np.column_stack((vectors[:, 0], np.zeros(len(vectors))))

    n_samples = len(vectors)

    if n_samples < 4:
        # PCA for very small datasets where UMAP neighborhoods don't make sense
        pca = PCA(n_components=2, random_state=42)
        coords = pca.fit_transform(vectors)
        coords += rng.normal(0, 0.05, coords.shape)
        return coords

    n_neighbors = min(15, n_samples - 1)
    
    try:
        import umap
        reducer = umap.UMAP(n_neighbors=n_neighbors, n_components=2, metric="cosine", random_state=42)
        coords = reducer.fit_transform(vectors)
    except Exception as exc:
        logger.warning("UMAP failed (%s), falling back to PCA", exc)
        n_components = min(2, vectors.shape[1])
        pca = PCA(n_components=n_components, random_state=42)
        coords = pca.fit_transform(vectors)
        if coords.shape[1] == 1:
            coords = np.column_stack((coords, np.zeros(len(coords))))

    return coords


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

    # Cache existing custom cluster labels based on their exact document composition
    existing_points = db.scalars(
        select(DocumentGraphPoint).where(DocumentGraphPoint.user_id == user_id)
    ).all()
    
    import re
    existing_clusters_docs = {}
    existing_clusters_labels = {}
    for p in existing_points:
        if p.cluster_id >= 0 and p.cluster_label and not re.match(r"^Cluster \d+$", p.cluster_label):
            existing_clusters_docs.setdefault(p.cluster_id, set()).add(p.document_id)
            existing_clusters_labels[p.cluster_id] = p.cluster_label

    old_signatures = {
        frozenset(docs): existing_clusters_labels[cid]
        for cid, docs in existing_clusters_docs.items()
    }

    # Rebuild the user's graph points from scratch each refresh. This avoids
    # stale relationship state and duplicate-key inserts when large ingestions
    # trigger repeated graph rebuilds in the same session.
    db.execute(delete(DocumentGraphPoint).where(DocumentGraphPoint.user_id == user_id))
    db.flush()

    if len(documents) == 1:
        doc = documents[0]
        snippet = (doc.chunks[0].content[:280] if doc.chunks else doc.original_name).strip()
        point = DocumentGraphPoint(
            document_id=doc.id,
            user_id=user_id,
            x=0.0,
            y=0.0,
            cluster_id=0,
            cluster_label="Cluster 1",
            is_anomaly=False,
            representative_snippet=snippet,
        )
        db.add(point)
        db.flush()
        return

    vectors = np.array([document.document_embedding for document in documents], dtype=float)
    labels = _cluster_embeddings(vectors, workspace_settings)
    coordinates = _project_embeddings(vectors)

    # Identify new cluster signatures to restore cached labels
    new_cluster_docs = {}
    for index, document in enumerate(documents):
        cid = int(labels[index])
        if cid >= 0:
            new_cluster_docs.setdefault(cid, set()).add(document.id)

    new_cluster_labels = {}
    for cid, docs in new_cluster_docs.items():
        sig = frozenset(docs)
        if sig in old_signatures:
            new_cluster_labels[cid] = old_signatures[sig]

    for index, document in enumerate(documents):
        cluster_id = int(labels[index])
        is_anomaly = cluster_id < 0
        snippet = (document.chunks[0].content[:280] if document.chunks else document.original_name).strip()
        
        if is_anomaly:
            cluster_label = "Anomaly"
        elif cluster_id in new_cluster_labels:
            cluster_label = new_cluster_labels[cluster_id]
        else:
            cluster_label = f"Cluster {cluster_id + 1}"

        point = DocumentGraphPoint(
            document_id=document.id,
            user_id=user_id,
            x=float(coordinates[index][0]),
            y=float(coordinates[index][1]),
            cluster_id=cluster_id,
            cluster_label=cluster_label,
            is_anomaly=is_anomaly,
            representative_snippet=snippet,
        )
        db.add(point)

    db.flush()
    auto_title_clusters(db, workspace_settings, user_id)


def build_cluster_summaries(points: list[DocumentGraphPoint]) -> list[dict[str, int | str]]:
    counts = Counter(point.cluster_id for point in points)
    
    # Get a mapping of cluster_id to label
    labels: dict[int, str] = {}
    for point in points:
        if point.cluster_id not in labels:
            labels[point.cluster_id] = point.cluster_label
            
    summaries: list[dict[str, int | str]] = []
    for cluster_id, document_count in sorted(counts.items(), key=lambda item: item[0]):
        summaries.append(
            {
                "id": cluster_id,
                "label": labels.get(cluster_id, "Anomaly" if cluster_id < 0 else f"Cluster {cluster_id + 1}"),
                "documentCount": document_count,
            }
        )
    return summaries
