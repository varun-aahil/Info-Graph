from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.core.security import create_access_token, get_password_hash, verify_password
from backend.app.models.entities import User
from backend.app.schemas.auth import AuthResponse, UserCreate, UserLogin
from backend.app.services.settings_service import get_or_create_workspace_settings

router = APIRouter()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _auth_response(user: User) -> AuthResponse:
    return AuthResponse(access_token=create_access_token(user.id), user=user)  # type: ignore[arg-type]


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> AuthResponse:
    email = _normalize_email(str(payload.email))
    existing_user = db.scalar(select(User).where(User.email == email))
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered.")

    user = User(
        email=email,
        name=payload.name.strip(),
        hashed_password=get_password_hash(payload.password),
        provider="email",
        is_active=True,
    )
    db.add(user)
    db.flush()
    get_or_create_workspace_settings(db, user.id)
    db.commit()
    db.refresh(user)
    return _auth_response(user)


@router.post("/login", response_model=AuthResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> AuthResponse:
    email = _normalize_email(str(payload.email))
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive.")

    get_or_create_workspace_settings(db, user.id)
    db.commit()
    db.refresh(user)
    return _auth_response(user)
