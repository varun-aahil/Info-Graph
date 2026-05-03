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
    model_provider: str  # validated in the route handler after normalization
    cloud_api_key: str
    cloud_base_url: str
    cloud_chat_model: str
    cloud_embedding_model: str
    local_base_url: str
    clustering_method: str
    min_cluster_size: int


class LocalModelInfo(BaseModel):
    name: str
    size_bytes: int
    modified_at: datetime | None = None
    family: str = ""
    parameter_size: str = ""
    is_embedding: bool
    is_chat: bool


class LocalModelRecommendation(BaseModel):
    name: str
    description: str


class LocalModelsResponse(BaseModel):
    installed_models: list[LocalModelInfo]
    recommended_embedding_models: list[LocalModelRecommendation]
    ollama_library_url: str
    ollama_download_url: str


class PullLocalModelRequest(BaseModel):
    model_name: str
    local_base_url: str


class PullLocalModelResponse(BaseModel):
    status: str
    model_name: str
