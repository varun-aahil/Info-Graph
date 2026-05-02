import urllib.parse

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

import httpx

from backend.app.core.config import get_settings
from backend.app.core.database import get_db
from backend.app.core.security import create_access_token, get_password_hash, verify_password
from backend.app.models.entities import User, EmailOTP
from backend.app.schemas.auth import AuthResponse, UserCreate, UserLogin, VerifyOTP, ResendOTP
from backend.app.services.settings_service import get_or_create_workspace_settings
from backend.app.services.email_service import send_otp_email
from datetime import datetime

router = APIRouter()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _auth_response(user: User) -> AuthResponse:
    return AuthResponse(access_token=create_access_token(user.id), user=user)  # type: ignore[arg-type]


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
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
        is_verified=False,
    )
    db.add(user)
    db.flush()
    get_or_create_workspace_settings(db, user.id)
    
    # Send OTP
    send_otp_email(db, user.id, user.email, purpose="verify_email")
    db.commit()
    
    return {"message": "User registered. Please verify your email with the OTP sent.", "email": email}


@router.post("/login", response_model=AuthResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> AuthResponse:
    email = _normalize_email(str(payload.email))
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive.")
    if not user.is_verified:
        # User not verified, automatically resend a new OTP
        send_otp_email(db, user.id, user.email, purpose="verify_email")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified. A new OTP has been sent.")

    get_or_create_workspace_settings(db, user.id)
    db.commit()
    db.refresh(user)
    return _auth_response(user)

@router.post("/verify-otp", response_model=AuthResponse)
def verify_otp(payload: VerifyOTP, db: Session = Depends(get_db)) -> AuthResponse:
    email = _normalize_email(str(payload.email))
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        
    otp_record = db.scalar(
        select(EmailOTP).where(
            EmailOTP.user_id == user.id,
            EmailOTP.otp_code == payload.otp_code,
            EmailOTP.purpose == "verify_email"
        ).order_by(EmailOTP.created_at.desc())
    )
    
    if not otp_record:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP code.")
    
    if otp_record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP code has expired. Please request a new one.")
        
    user.is_verified = True
    db.delete(otp_record)
    db.commit()
    db.refresh(user)
    return _auth_response(user)

@router.post("/resend-otp")
def resend_otp(payload: ResendOTP, db: Session = Depends(get_db)):
    email = _normalize_email(str(payload.email))
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    
    if user.is_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already verified.")
        
    send_otp_email(db, user.id, user.email, purpose="verify_email")
    return {"message": "A new OTP has been sent."}


_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


@router.get("/google")
def google_login() -> RedirectResponse:
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Google OAuth is not configured.")
    params = urllib.parse.urlencode({
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
    })
    return RedirectResponse(url=f"{_GOOGLE_AUTH_URL}?{params}")


@router.get("/google/callback")
def google_callback(code: str | None = None, error: str | None = None, db: Session = Depends(get_db)) -> RedirectResponse:
    settings = get_settings()
    if error or not code:
        return RedirectResponse(url=f"{settings.frontend_url}?oauth_error=access_denied")

    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Google OAuth is not configured.")

    # Exchange code for tokens
    with httpx.Client() as client:
        token_response = client.post(_GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
        })
        token_data = token_response.json()
        access_token = token_data.get("access_token")
        if not access_token:
            return RedirectResponse(url=f"{settings.frontend_url}?oauth_error=token_exchange_failed")

        userinfo_response = client.get(_GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
        userinfo = userinfo_response.json()

    google_id = userinfo.get("sub")
    email = userinfo.get("email", "").strip().lower()
    name = userinfo.get("name") or email.split("@")[0]
    avatar_url = userinfo.get("picture")

    if not google_id or not email:
        return RedirectResponse(url=f"{settings.frontend_url}?oauth_error=missing_profile")

    # Find or create user
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            email=email,
            name=name,
            hashed_password=get_password_hash(google_id),  # Use google_id as a non-usable password
            provider="google",
            avatar_url=avatar_url,
            is_active=True,
        )
        db.add(user)
        db.flush()
        get_or_create_workspace_settings(db, user.id)
    else:
        # Update avatar if changed
        if avatar_url and user.avatar_url != avatar_url:
            user.avatar_url = avatar_url  # type: ignore[assignment]

    db.commit()
    db.refresh(user)

    jwt = create_access_token(user.id)
    redirect_url = f"{settings.frontend_url}/auth/callback?token={urllib.parse.quote(jwt)}"
    return RedirectResponse(url=redirect_url)
