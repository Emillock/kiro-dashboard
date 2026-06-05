"""Shared FastAPI dependencies: DB connection, services, current-user auth."""
from __future__ import annotations

import sqlite3
from collections.abc import Iterator

from fastapi import Depends, Header, HTTPException, status

from backend.core.auth.security import TokenError, decode_access_token
from backend.core.cache.cache_service import CacheService
from backend.core.config import Settings, get_settings
from backend.models.user import UserOut
from backend.repositories.cache_repo import CacheRepository
from backend.repositories.db import get_connection
from backend.repositories.user_repo import UserRepository
from backend.services.auth_service import AuthService
from backend.services.metrics_service import MetricsService
from backend.services.user_dir_service import UserDirectoryService


def get_db() -> Iterator[sqlite3.Connection]:
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def get_settings_dep() -> Settings:
    return get_settings()


def get_auth_service(conn: sqlite3.Connection = Depends(get_db)) -> AuthService:
    return AuthService(UserRepository(conn))


def get_metrics_service(conn: sqlite3.Connection = Depends(get_db)) -> MetricsService:
    cache = CacheService(CacheRepository(conn))
    return MetricsService(cache=cache)


def get_user_dir_service(
    metrics: MetricsService = Depends(get_metrics_service),
) -> UserDirectoryService:
    return UserDirectoryService(metrics)


def get_current_user(
    authorization: str | None = Header(default=None),
    conn: sqlite3.Connection = Depends(get_db),
) -> UserOut:
    """Resolve the current user from a Bearer JWT (US-AUTH-03). 401 if missing/invalid."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        token_data = decode_access_token(token)
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user = UserRepository(conn).get_by_id(token_data.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return UserOut(id=user.id, email=user.email, username=user.username)
