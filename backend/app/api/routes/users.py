from fastapi import APIRouter, Depends

from backend.app.api.deps import get_current_active_user
from backend.app.models.entities import User
from backend.app.schemas.auth import UserResponse

router = APIRouter()


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_active_user)) -> UserResponse:
    return current_user  # type: ignore[return-value]
