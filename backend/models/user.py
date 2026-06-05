"""User and auth-token domain/transport models."""
from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    """Registration request body (US-AUTH-01)."""

    email: EmailStr
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)


class UserRecord(BaseModel):
    """A user as stored in the database."""

    id: int
    email: str
    username: str
    password_hash: str
    created_at: str | None = None


class UserOut(BaseModel):
    """Public user representation (no password hash)."""

    id: int
    email: str
    username: str


class TokenData(BaseModel):
    """Decoded JWT claims."""

    user_id: int
    email: str
