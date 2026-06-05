"""User repository — SQLite persistence for registered accounts (US-AUTH-01/02).

Uses parameterized queries throughout to avoid SQL injection.
"""
from __future__ import annotations

import sqlite3

from backend.models.user import UserRecord


class DuplicateUserError(Exception):
    """Raised when an email or username already exists."""


class UserRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def create(self, email: str, username: str, password_hash: str) -> UserRecord:
        try:
            cur = self._conn.execute(
                "INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)",
                (email, username, password_hash),
            )
        except sqlite3.IntegrityError as exc:
            raise DuplicateUserError(str(exc)) from exc
        user_id = cur.lastrowid
        return self.get_by_id(user_id)  # type: ignore[return-value]

    def _row_to_record(self, row: sqlite3.Row | None) -> UserRecord | None:
        if row is None:
            return None
        return UserRecord(
            id=row["id"],
            email=row["email"],
            username=row["username"],
            password_hash=row["password_hash"],
            created_at=row["created_at"],
        )

    def get_by_email(self, email: str) -> UserRecord | None:
        row = self._conn.execute(
            "SELECT * FROM users WHERE email = ?", (email,)
        ).fetchone()
        return self._row_to_record(row)

    def get_by_username(self, username: str) -> UserRecord | None:
        row = self._conn.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
        return self._row_to_record(row)

    def get_by_id(self, user_id: int) -> UserRecord | None:
        row = self._conn.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        return self._row_to_record(row)
