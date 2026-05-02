from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ChatHistoryMessage(BaseModel):
    role: str
    content: str


class ChatSelection(BaseModel):
    document_id: str | None = None
    cluster_id: int | None = None

    @model_validator(mode="after")
    def validate_single_selection(self) -> "ChatSelection":
        if bool(self.document_id) == bool(self.cluster_id is not None):
            raise ValueError("Provide either document_id or cluster_id.")
        return self


class ChatRequest(BaseModel):
    message: str
    selection: ChatSelection
    history: list[ChatHistoryMessage] = Field(default_factory=list)
    session_id: str | None = None


class ChatSource(BaseModel):
    documentName: str
    chunkIndex: int


class ChatResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    role: str = "assistant"
    content: str
    timestamp: datetime
    session_id: str | None = None
    sources: list[ChatSource] = Field(default_factory=list)


class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime


class ChatSessionResponse(BaseModel):
    id: str
    session_type: str
    target_id: str
    title: str | None
    created_at: datetime
    updated_at: datetime
