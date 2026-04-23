from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_active_user
from backend.app.core.database import get_db
from backend.app.models.entities import User
from backend.app.schemas.chat import ChatRequest
from backend.app.services.chat_service import stream_chat_response
from backend.app.services.embeddings import ModelProviderService
from backend.app.services.settings_service import get_or_create_workspace_settings

router = APIRouter()


@router.post("")
def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> StreamingResponse:
    workspace_settings = get_or_create_workspace_settings(db, current_user.id)
    provider_service = ModelProviderService()

    try:
        generator = stream_chat_response(
            db=db,
            payload=payload,
            user_id=current_user.id,
            workspace_settings=workspace_settings,
            provider_service=provider_service,
        )
        return StreamingResponse(generator, media_type="text/event-stream")
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
