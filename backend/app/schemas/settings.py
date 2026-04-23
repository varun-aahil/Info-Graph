from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WorkspaceSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    model_provider: str
    cloud_api_key: str
    cloud_base_url: str
    cloud_chat_model: str
    cloud_embedding_model: str
    local_base_url: str
    clustering_method: str
    min_cluster_size: int
    cloud_api_key_configured: bool
    updated_at: datetime


class WorkspaceSettingsUpdate(BaseModel):
    model_provider: str
    cloud_api_key: str
    cloud_base_url: str
    cloud_chat_model: str
    cloud_embedding_model: str
    local_base_url: str
    clustering_method: str
    min_cluster_size: int
