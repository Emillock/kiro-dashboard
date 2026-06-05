"""Authentication orchestration (US-AUTH-01, US-AUTH-02)."""
from __future__ import annotations

from backend.core.auth.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from backend.models.user import UserCreate, UserOut, UserRecord
from backend.repositories.user_repo import DuplicateUserError, UserRepository


class RegistrationError(Exception):
    """Raised when registration fails (e.g. duplicate email/username)."""


class AuthenticationError(Exception):
    """Raised when login credentials are invalid."""


class AuthService:
    def __init__(self, user_repo: UserRepository) -> None:
        self._users = user_repo

    def register(self, data: UserCreate) -> UserOut:
        """Create a new account (FR-1.1, FR-1.6). Validation handled by the Pydantic model."""
        if self._users.get_by_email(data.email):
            raise RegistrationError("email already in use")
        if self._users.get_by_username(data.username):
            raise RegistrationError("username already in use")
        try:
            record = self._users.create(
                email=data.email,
                username=data.username,
                password_hash=hash_password(data.password),
            )
        except DuplicateUserError as exc:  # race-condition safety
            raise RegistrationError("email or username already in use") from exc
        return UserOut(id=record.id, email=record.email, username=record.username)

    def login(self, email: str, password: str) -> str:
        """Verify credentials and return a JWT access token (FR-1.2, FR-1.4)."""
        user: UserRecord | None = self._users.get_by_email(email)
        if user is None or not verify_password(password, user.password_hash):
            raise AuthenticationError("invalid credentials")
        return create_access_token(user_id=user.id, email=user.email)
