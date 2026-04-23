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
    # Default to local (Ollama) if no cloud API key is configured
    default_provider = "cloud" if app_settings.openai_api_key else "local"
    settings_row = WorkspaceSettings(
        user_id=user_id,
        model_provider=default_provider,
        cloud_api_key=app_settings.openai_api_key,
        cloud_base_url=app_settings.openai_base_url,
        cloud_chat_model=app_settings.openai_chat_model,
        cloud_embedding_model=app_settings.openai_embedding_model,
        local_base_url=app_settings.ollama_base_url,
        clustering_method="kmeans",
        min_cluster_size=5,
    )
    db.add(settings_row)
    db.commit()
    db.refresh(settings_row)
    return settings_row
