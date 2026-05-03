import smtplib
from email.message import EmailMessage
import logging
import random
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.app.core.config import get_settings
from backend.app.models.entities import EmailOTP

logger = logging.getLogger(__name__)

def generate_otp_code() -> str:
    return f"{random.randint(0, 999999):06d}"

def send_otp_email(db: Session, user_id: str, email: str, purpose: str = "verify_email") -> bool:
    settings = get_settings()
    
    # Generate OTP and store in DB
    code = generate_otp_code()
    expires = datetime.utcnow() + timedelta(minutes=15)
    
    otp_record = EmailOTP(
        user_id=user_id,
        otp_code=code,
        purpose=purpose,
        expires_at=expires
    )
    db.add(otp_record)
    db.commit()
    
    # Always log OTP in development/testing (you can see this in Render logs)
    logger.info(f"Generated OTP for {email}: {code}")
    
    # Send Email via Resend API (bypasses Render SMTP port blocking)
    if hasattr(settings, 'resend_api_key') and settings.resend_api_key:
        import httpx
        try:
            response = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": settings.smtp_from or "onboarding@resend.dev",
                    "to": email,
                    "subject": "Your InfoGraph Verification Code",
                    "html": f"<p>Your verification code is: <strong>{code}</strong></p><p>This code will expire in 15 minutes.</p>"
                }
            )
            response.raise_for_status()
            logger.info(f"OTP sent to {email} via Resend")
            return True
        except Exception as e:
            logger.error(f"Failed to send OTP via Resend API: {e}")
            return False

    # Fallback to SMTP
    if not settings.smtp_host or not settings.smtp_user or not settings.smtp_pass:
        logger.warning(f"SMTP/Resend not configured. Skipping email dispatch.")
        return True
        
    try:
        msg = EmailMessage()
        msg.set_content(f"Your Infograph verification code is: {code}\n\nThis code will expire in 15 minutes.")
        msg['Subject'] = "Your Infograph Verification Code"
        msg['From'] = settings.smtp_from
        msg['To'] = email

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_pass)
            server.send_message(msg)
            
        logger.info(f"OTP sent to {email} via SMTP")
        return True
    except Exception as e:
        logger.error(f"Failed to send OTP email via SMTP: {e}")
        return False
