from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_active_user
from backend.app.core.config import get_settings
from backend.app.core.database import get_db
from backend.app.models.entities import User
from backend.app.schemas.settings import WorkspaceSettingsResponse, WorkspaceSettingsUpdate
from backend.app.services.graph_service import refresh_graph
from backend.app.services.settings_service import get_or_create_workspace_settings

router = APIRouter()

ALLOWED_PROVIDERS = {"cloud", "local"}
ALLOWED_CLUSTERING_METHODS = {"kmeans", "dbscan", "hierarchical"}


def _serialize_settings(settings_row) -> WorkspaceSettingsResponse:
    app_settings = get_settings()
    resolved_api_key = settings_row.cloud_api_key or app_settings.openai_api_key or ""
    return WorkspaceSettingsResponse(
        model_provider=settings_row.model_provider,
        cloud_api_key=settings_row.cloud_api_key or "",
        cloud_base_url=settings_row.cloud_base_url,
        cloud_chat_model=settings_row.cloud_chat_model,
        cloud_embedding_model=settings_row.cloud_embedding_model,
        local_base_url=settings_row.local_base_url,
        clustering_method=settings_row.clustering_method,
        min_cluster_size=settings_row.min_cluster_size,
        cloud_api_key_configured=bool(resolved_api_key),
        updated_at=settings_row.updated_at,
    )


@router.get("", response_model=WorkspaceSettingsResponse)
def get_workspace_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> WorkspaceSettingsResponse:
    settings_row = get_or_create_workspace_settings(db, current_user.id)
    return _serialize_settings(settings_row)


@router.put("", response_model=WorkspaceSettingsResponse)
def update_workspace_settings(
    payload: WorkspaceSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> WorkspaceSettingsResponse:
    if payload.model_provider not in ALLOWED_PROVIDERS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported model provider.")
    if payload.clustering_method not in ALLOWED_CLUSTERING_METHODS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported clustering method.")
    if payload.min_cluster_size < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="min_cluster_size must be at least 1.")
    if not payload.cloud_base_url.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cloud_base_url is required.")
    if not payload.cloud_chat_model.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cloud_chat_model is required.")
    if not payload.cloud_embedding_model.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cloud_embedding_model is required.")
    if not payload.local_base_url.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="local_base_url is required.")

    settings_row = get_or_create_workspace_settings(db, current_user.id)
    settings_row.model_provider = payload.model_provider
    settings_row.cloud_api_key = payload.cloud_api_key.strip() or None
    settings_row.cloud_base_url = payload.cloud_base_url.strip()
    settings_row.cloud_chat_model = payload.cloud_chat_model.strip()
    settings_row.cloud_embedding_model = payload.cloud_embedding_model.strip()
    settings_row.local_base_url = payload.local_base_url.strip()
    settings_row.clustering_method = payload.clustering_method
    settings_row.min_cluster_size = payload.min_cluster_size
    refresh_graph(db, settings_row, current_user.id)
    db.commit()
    db.refresh(settings_row)
    return _serialize_settings(settings_row)
