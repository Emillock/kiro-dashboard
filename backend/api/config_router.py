"""Config endpoint — exposes the NRT polling interval to the frontend (US-NRT-01)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.api.deps import get_current_user, get_settings_dep
from backend.core.config import Settings
from backend.models.user import UserOut

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/auth")
def auth_config(settings: Settings = Depends(get_settings_dep)) -> dict:
    """Public endpoint: tells the frontend whether login is required.

    No auth required (the frontend must read this before it can know whether to log in).
    """
    return {"auth_disabled": settings.auth_disabled}


@router.get("/refresh-interval")
def refresh_interval(
    settings: Settings = Depends(get_settings_dep),
    _user: UserOut = Depends(get_current_user),
) -> dict:
    return {"refresh_interval_seconds": settings.refresh_interval_seconds}


@router.get("/adoption-weights")
def adoption_weights(
    settings: Settings = Depends(get_settings_dep),
    _user: UserOut = Depends(get_current_user),
) -> dict:
    """Expose the configured AI Adoption score weights so the UI can explain the formula.

    The score is an absolute weighted sum of per-user metrics (FR-3.3.1); a missing
    metric contributes 0 (FR-3.3.2).
    """
    return {
        "method": "weighted_sum",
        "weights": settings.adoption_weights,
    }
