import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_active_user
from backend.app.core.config import get_settings
from backend.app.core.database import get_db
from backend.app.models.entities import User
from backend.app.schemas.settings import WorkspaceSettingsResponse, WorkspaceSettingsUpdate
from backend.app.services.graph_service import refresh_graph
from backend.app.services.settings_service import get_or_create_workspace_settings

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_PROVIDERS = {"cloud", "local", "openai", "anthropic", "gemini", "xai"}
ALLOWED_CLUSTERING_METHODS = {"kmeans", "dbscan", "hierarchical"}


def _serialize_settings(settings_row) -> WorkspaceSettingsResponse:
    app_settings = get_settings()
    resolved_api_key = settings_row.cloud_api_key or app_settings.openai_api_key or ""
    return WorkspaceSettingsResponse(
        model_provider=settings_row.model_provider,
        cloud_api_key=settings_row.cloud_api_key or "",
        cloud_base_url=settings_row.cloud_base_url,
        cloud_chat_model=settings_row.cloud_chat_model,
        cloud_embedding_model=settings_row.cloud_embedding_model,
        local_base_url=settings_row.local_base_url,
        clustering_method=settings_row.clustering_method,
        min_cluster_size=settings_row.min_cluster_size,
        cloud_api_key_configured=bool(resolved_api_key),
        updated_at=settings_row.updated_at,
    )


def _verify_api_key(provider: str, api_key: str, base_url: str | None, model: str) -> None:
    """Quick smoke-test the API key by making a tiny completion call."""
    if not api_key:
        return  # nothing to verify

    import litellm

    # Resolve the model name the same way embeddings.py does
    resolved_model = model
    if provider == "gemini" and not model.startswith("gemini/"):
        resolved_model = f"gemini/{model}"
    elif provider == "xai" and not model.startswith("xai/"):
        resolved_model = f"xai/{model}"

    resolved_base = base_url if (base_url and "generativelanguage" not in base_url) else None

    try:
        litellm.completion(
            model=resolved_model,
            api_key=api_key,
            api_base=resolved_base,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=1,
        )
        logger.info("API key verification succeeded for provider=%s model=%s", provider, resolved_model)
    except litellm.RateLimitError:
        # 429 means the key IS valid — the API recognized the account but throttled it
        logger.info("API key valid (rate-limited) for provider=%s model=%s", provider, resolved_model)
    except litellm.AuthenticationError:
        logger.warning("API key auth failed for provider=%s", provider)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid API Key. Please check your key and try again.",
        )
    except litellm.NotFoundError:
        logger.warning("Model not found for provider=%s model=%s", provider, resolved_model)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Model '{model}' not found. Please select a valid model for this provider.",
        )
    except litellm.APIError as exc:
        raw = str(exc)
        exc_status = getattr(exc, "status_code", None)
        logger.warning("API verification error for provider=%s (status=%s): %s", provider, exc_status, raw)

        # 403 = key is valid but account has billing/permission issues
        if exc_status == 403 or "403" in raw:
            # Check for common billing/credit messages
            if "credit" in raw.lower() or "license" in raw.lower() or "permission" in raw.lower() or "billing" in raw.lower():
                detail = "API key is valid, but your account lacks credits or permissions. Please add credits at your provider's console."
            else:
                detail = "API key is valid, but access was denied (403). Check your account permissions."
            raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=detail)

        # 401 = truly invalid key (sometimes wrapped in APIError instead of AuthenticationError)
        if exc_status == 401 or "401" in raw or "Authentication" in raw:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid API Key. Please check your key and try again.",
            )

        # 404 = model not found (sometimes wrapped in APIError)
        if exc_status == 404 or "not found" in raw.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Model '{model}' not found. Please select a valid model for this provider.",
            )

        # 429 wrapped in APIError instead of RateLimitError
        if exc_status == 429 or "rate" in raw.lower():
            logger.info("API key valid (rate-limited via APIError) for provider=%s", provider)
            return  # Key is valid, just throttled

        # Unknown API error — give a clean message
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API verification failed. Please check your key and provider settings.",
        )
    except Exception as exc:
        raw = str(exc)
        logger.warning("API key verification failed for provider=%s: %s", provider, raw)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API Key verification failed. Please check your key and provider settings.",
        )


@router.get("", response_model=WorkspaceSettingsResponse)
def get_workspace_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> WorkspaceSettingsResponse:
    settings_row = get_or_create_workspace_settings(db, current_user.id)
    return _serialize_settings(settings_row)


@router.put("", response_model=WorkspaceSettingsResponse)
def update_workspace_settings(
    payload: WorkspaceSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> WorkspaceSettingsResponse:
    provider = payload.model_provider.lower()
    if provider not in ALLOWED_PROVIDERS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported model provider.")
    if payload.clustering_method not in ALLOWED_CLUSTERING_METHODS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported clustering method.")
    if payload.min_cluster_size < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="min_cluster_size must be at least 1.")

    # cloud_base_url is not needed for standard providers — LiteLLM routes via model prefix
    cloud_base_url = payload.cloud_base_url.strip()

    if not payload.cloud_chat_model.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cloud_chat_model is required.")
    if not payload.local_base_url.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="local_base_url is required.")

    # Verify API key if one was provided (non-empty, non-local)
    new_api_key = payload.cloud_api_key.strip()
    if new_api_key and provider != "local":
        _verify_api_key(provider, new_api_key, cloud_base_url or None, payload.cloud_chat_model.strip())

    settings_row = get_or_create_workspace_settings(db, current_user.id)
    settings_row.model_provider = provider
    settings_row.cloud_api_key = new_api_key or None
    settings_row.cloud_base_url = cloud_base_url
    settings_row.cloud_chat_model = payload.cloud_chat_model.strip()
    settings_row.cloud_embedding_model = payload.cloud_embedding_model.strip()
    settings_row.local_base_url = payload.local_base_url.strip()
    settings_row.clustering_method = payload.clustering_method
    settings_row.min_cluster_size = payload.min_cluster_size

    # Graph rebuild should never block settings save
    try:
        refresh_graph(db, settings_row, current_user.id)
    except Exception as exc:
        logger.warning("Graph rebuild failed (non-fatal): %s", exc)

    db.commit()
    db.refresh(settings_row)
    return _serialize_settings(settings_row)
