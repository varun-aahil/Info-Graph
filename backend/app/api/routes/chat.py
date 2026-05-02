from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_active_user
from backend.app.core.database import get_db
from backend.app.models.entities import User, ChatSession, ChatMessage
from backend.app.schemas.chat import ChatRequest, ChatSessionResponse, ChatMessageResponse
from backend.app.services.chat_service import stream_chat_response
from backend.app.services.embeddings import ModelProviderService
from backend.app.services.settings_service import get_or_create_workspace_settings

router = APIRouter()


@router.get("/sessions", response_model=list[ChatSessionResponse])
def get_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    from sqlalchemy import select
    sessions = db.scalars(
        select(ChatSession)
        .where(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
    ).all()
    return sessions

@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageResponse])
def get_session_messages(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    from sqlalchemy import select
    session = db.scalar(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id))
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    messages = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    ).all()
    return messages

@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    from sqlalchemy import select, delete
    session = db.scalar(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id))
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    db.delete(session)
    db.commit()

@router.post("")
def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> StreamingResponse:
    workspace_settings = get_or_create_workspace_settings(db, current_user.id)
    provider_service = ModelProviderService()

    session_id = payload.session_id
    if not session_id:
        from sqlalchemy import select
        session_type = "document" if payload.selection.document_id else "cluster"
        target_id = str(payload.selection.document_id or payload.selection.cluster_id)
        
        existing_session = db.scalar(
            select(ChatSession)
            .where(ChatSession.user_id == current_user.id, ChatSession.target_id == target_id)
            .order_by(ChatSession.updated_at.desc())
        )
        
        if existing_session:
            session_id = existing_session.id
        else:
            # Create a new session
            title = payload.message[:50] + "..." if len(payload.message) > 50 else payload.message
            new_session = ChatSession(
                user_id=current_user.id,
                session_type=session_type,
                target_id=target_id,
                title=title
            )
            db.add(new_session)
            db.commit()
            db.refresh(new_session)
            session_id = new_session.id

    try:
        generator = stream_chat_response(
            db=db,
            payload=payload,
            user_id=current_user.id,
            workspace_settings=workspace_settings,
            provider_service=provider_service,
            session_id=session_id,
        )
        return StreamingResponse(generator, media_type="text/event-stream")
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
