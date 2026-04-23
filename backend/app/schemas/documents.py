from datetime import datetime

from pydantic import BaseModel, ConfigDict, HttpUrl


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_type: str
    source_value: str | None
    original_name: str
    stored_path: str
    file_size: int
    mime_type: str
    status: str
    progress: int
    error_message: str | None
    uploaded_at: datetime
    processed_at: datetime | None
    job_id: str | None = None


class UploadDocumentsResponse(BaseModel):
    documents: list[DocumentResponse]


class ImportUrlRequest(BaseModel):
    url: HttpUrl
