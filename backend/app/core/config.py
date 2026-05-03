import json
from functools import lru_cache
from pathlib import Path
import os
import sys

from pydantic_settings import BaseSettings, SettingsConfigDict

def get_env_file():
    # If frozen, it's at _MEIPASS/backend/.env
    # If not frozen, it's at ../../.env relative to this file
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS) / "backend" / ".env"
    return Path(__file__).resolve().parents[2] / ".env"

ENV_FILE = get_env_file()
_DEFAULT_CORS = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra='ignore'
    )

    app_name: str = "InfoGraph API"
    api_prefix: str = "/api/v1"
    database_url: str = "" 
    storage_dir: Path = Path("backend/data/uploads")
    secret_key: str = "" 
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_embedding_model: str = "text-embedding-3-small"
    openai_chat_model: str = "gpt-4.1-mini"
    ollama_base_url: str = "http://localhost:11434"
    ollama_embedding_model: str = "nomic-embed-text"
    ollama_chat_model: str = "llama3.1:8b"
    cors_origins: str = _DEFAULT_CORS
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"
    frontend_url: str = "http://localhost:8080"
    
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_pass: str | None = None
    smtp_from: str = "noreply@infograph.local"
    resend_api_key: str | None = None

    @property
    def cors_origins_list(self) -> list[str]:
        s = (self.cors_origins or "").strip()
        if not s:
            return _DEFAULT_CORS.split(",")
        if s.startswith("["):
            try:
                return json.loads(s)
            except json.JSONDecodeError:
                pass
        return [u.strip() for u in s.split(",") if u.strip()]

@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    try:
        settings.storage_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    return settings
