from sqlalchemy.orm import Session

from backend.app.core.config import get_settings
from backend.app.models.entities import WorkspaceSettings


def get_or_create_workspace_settings(db: Session, user_id: str) -> WorkspaceSettings:
    settings_row = (
        db.query(WorkspaceSettings)
        .filter(WorkspaceSettings.user_id == user_id)
        .one_or_none()
    )
    if settings_row:
        return settings_row

    app_settings = get_settings()

    if app_settings.openai_api_key:
        default_provider = "cloud"
        default_embedding = app_settings.openai_embedding_model
        default_chat = app_settings.openai_chat_model
    else:
        default_provider = "local"
        default_embedding = app_settings.ollama_embedding_model
        default_chat = app_settings.ollama_chat_model

    settings_row = WorkspaceSettings(
        user_id=user_id,
        model_provider=default_provider,
        cloud_api_key=app_settings.openai_api_key,
        cloud_base_url=app_settings.openai_base_url,
        cloud_chat_model=default_chat,
        cloud_embedding_model=default_embedding,
        local_base_url=app_settings.ollama_base_url,
        clustering_method="kmeans",
        min_cluster_size=5,
    )
    db.add(settings_row)
    db.commit()
    db.refresh(settings_row)
    return settings_row
