"""Metrics endpoints (serve Unit 1 data through MetricsService). All require auth."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.api.deps import (
    get_current_user,
    get_metrics_service,
    get_user_dir_service,
)
from backend.models.metrics import AggregateMetrics, UserMetrics
from backend.models.user import UserOut
from backend.services.metrics_service import MetricsError, MetricsService
from backend.services.user_dir_service import UserDirectoryService

router = APIRouter(prefix="/metrics", tags=["metrics"])

RangeParam = Literal["week", "month"]
MetricParam = Literal[
    "adoption_score", "total_messages", "chat_conversations", "credits_used", "active_days"
]
ModeParam = Literal["top_n", "bottom_n", "top5_bottom5", "all"]


@router.get("/aggregate", response_model=AggregateMetrics)
def aggregate(
    range: RangeParam = "month",
    service: MetricsService = Depends(get_metrics_service),
    _user: UserOut = Depends(get_current_user),
) -> AggregateMetrics:
    try:
        return service.get_aggregate_metrics(range)
    except MetricsError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/users")
def list_users(
    range: RangeParam = "month",
    q: str | None = Query(default=None, description="Optional search query"),
    dir_service: UserDirectoryService = Depends(get_user_dir_service),
    _user: UserOut = Depends(get_current_user),
) -> dict:
    try:
        users = dir_service.search_users(range, q)
    except MetricsError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return {"range": range, "users": [u.model_dump() for u in users]}


@router.get("/users/{user_id}", response_model=UserMetrics)
def user_detail(
    user_id: str,
    range: RangeParam = "month",
    service: MetricsService = Depends(get_metrics_service),
    _user: UserOut = Depends(get_current_user),
) -> UserMetrics:
    try:
        metrics = service.get_user_metrics(range, user_id)
    except MetricsError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    if metrics is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found in period")
    return metrics


@router.get("/top-adopters")
def top_adopters_endpoint(
    range: RangeParam = "month",
    k: int = Query(default=5, ge=1, le=5),
    service: MetricsService = Depends(get_metrics_service),
    _user: UserOut = Depends(get_current_user),
) -> dict:
    try:
        users = service.get_top_adopters(range, k)
    except MetricsError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return {
        "range": range,
        "top_adopters": [
            {"rank": i + 1, "user_id": u.user_id, "label": u.label, "adoption_score": u.adoption_score}
            for i, u in enumerate(users)
        ],
    }


@router.get("/compare")
def compare(
    metric: MetricParam,
    mode: ModeParam,
    range: RangeParam = "month",
    n: int | None = Query(default=None, ge=1, le=20),
    service: MetricsService = Depends(get_metrics_service),
    _user: UserOut = Depends(get_current_user),
) -> dict:
    try:
        users = service.get_comparison(range, metric, mode, n)
    except MetricsError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return {
        "metric": metric,
        "mode": mode,
        "n": n,
        "users": [
            {
                "user_id": u.user_id,
                "label": u.label,
                "value": getattr(u, metric),
                "adoption_score": u.adoption_score,
            }
            for u in users
        ],
    }
