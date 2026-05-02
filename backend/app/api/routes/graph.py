from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from backend.app.api.deps import get_current_active_user
from backend.app.core.database import get_db
from backend.app.models.entities import Document, DocumentGraphPoint, User
from backend.app.schemas.graph import GraphResponse, GraphPointResponse
from backend.app.services.graph_service import build_cluster_summaries

router = APIRouter()


@router.get("", response_model=GraphResponse)
def get_graph(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> GraphResponse:
    # Catch-up: if any ready documents lack graph points, trigger a refresh
    ready_doc_count = db.scalar(
        select(func.count(Document.id)).where(
            Document.user_id == current_user.id,
            Document.status == "ready",
            Document.document_embedding.is_not(None),
        )
    ) or 0
    point_count = db.scalar(
        select(func.count(DocumentGraphPoint.document_id)).where(
            DocumentGraphPoint.user_id == current_user.id,
        )
    ) or 0

    if ready_doc_count > 0 and point_count < ready_doc_count:
        from backend.app.services.graph_service import refresh_graph
        from backend.app.services.settings_service import get_or_create_workspace_settings
        ws = get_or_create_workspace_settings(db, current_user.id)
        try:
            refresh_graph(db, ws, current_user.id)
            db.commit()
        except Exception:
            db.rollback()

    points = db.scalars(
        select(DocumentGraphPoint)
        .where(DocumentGraphPoint.user_id == current_user.id)
        .options(joinedload(DocumentGraphPoint.document))
        .order_by(DocumentGraphPoint.document_id.asc())
    ).all()

    return GraphResponse(
        points=[
            GraphPointResponse(
                id=point.document_id,
                x=point.x,
                y=point.y,
                documentName=point.document.original_name,
                snippet=point.representative_snippet,
                cluster=point.cluster_id,
                clusterLabel=point.cluster_label,
                isAnomaly=point.is_anomaly,
            )
            for point in points
        ],
        clusters=build_cluster_summaries(list(points)),  # type: ignore[arg-type]
    )
