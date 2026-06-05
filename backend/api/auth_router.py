"""Auth endpoints (US-AUTH-01..04)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from backend.api.deps import get_auth_service, get_current_user
from backend.models.auth import LoginRequest, TokenResponse
from backend.models.user import UserCreate, UserOut
from backend.services.auth_service import (
    AuthenticationError,
    AuthService,
    RegistrationError,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, service: AuthService = Depends(get_auth_service)) -> UserOut:
    try:
        return service.register(payload)
    except RegistrationError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, service: AuthService = Depends(get_auth_service)) -> TokenResponse:
    try:
        token = service.login(payload.email, payload.password)
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials"
        ) from exc
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserOut)
def me(current_user: UserOut = Depends(get_current_user)) -> UserOut:
    return current_user
