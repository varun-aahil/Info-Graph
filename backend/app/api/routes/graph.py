from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from backend.app.api.deps import get_current_active_user
from backend.app.core.database import get_db
from backend.app.models.entities import DocumentGraphPoint, User
from backend.app.schemas.graph import GraphResponse, GraphPointResponse
from backend.app.services.graph_service import build_cluster_summaries

router = APIRouter()


@router.get("", response_model=GraphResponse)
def get_graph(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> GraphResponse:
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
