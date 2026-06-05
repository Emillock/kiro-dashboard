"""Auth request/response transport models."""
from __future__ import annotations

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    """Login request body (US-AUTH-02): email + password."""

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """JWT issued on successful login."""

    access_token: str
    token_type: str = "bearer"
