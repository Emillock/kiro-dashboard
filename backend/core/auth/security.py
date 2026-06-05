"""Authentication primitives: bcrypt password hashing + JWT tokens (US-AUTH-01..03).

Passwords are hashed with bcrypt; access tokens are stateless HS256 JWTs whose secret and expiry
come from configuration.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from backend.core.config import get_settings
from backend.models.user import TokenData

_ALGORITHM = "HS256"


def hash_password(plain: str) -> str:
    """Return a bcrypt hash of the plaintext password.

    bcrypt only processes the first 72 bytes of a password. We truncate at the byte level
    before hashing so callers never hit a silent truncation or ValueError.
    """
    salt = bcrypt.gensalt()
    encoded = plain.encode("utf-8")[:72]
    return bcrypt.hashpw(encoded, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        encoded = plain.encode("utf-8")[:72]
        return bcrypt.checkpw(encoded, hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int, email: str) -> str:
    """Create a signed JWT access token for the given user."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_expiry_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=_ALGORITHM)


class TokenError(Exception):
    """Raised when a JWT cannot be decoded or is invalid/expired."""


def decode_access_token(token: str) -> TokenData:
    """Decode and validate a JWT, returning the token claims."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc
    sub = payload.get("sub")
    email = payload.get("email")
    if sub is None or email is None:
        raise TokenError("Token missing required claims")
    return TokenData(user_id=int(sub), email=email)
