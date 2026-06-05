"""Config endpoint — exposes the NRT polling interval to the frontend (US-NRT-01)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.api.deps import get_current_user, get_settings_dep
from backend.core.config import Settings
from backend.models.user import UserOut

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/refresh-interval")
def refresh_interval(
    settings: Settings = Depends(get_settings_dep),
    _user: UserOut = Depends(get_current_user),
) -> dict:
    return {"refresh_interval_seconds": settings.refresh_interval_seconds}
