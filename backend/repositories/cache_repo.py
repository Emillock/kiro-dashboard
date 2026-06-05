"""Cache repository — SQLite-backed short-TTL cache (Q2=B).

Stores serialized JSON values keyed by a cache key with an expiry timestamp.
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass
class CacheRow:
    cache_key: str
    value_json: str
    expires_at: datetime


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


class CacheRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def read(self, key: str) -> CacheRow | None:
        """Return a non-expired cache row, or None if missing/expired."""
        row = self._conn.execute(
            "SELECT cache_key, value_json, expires_at FROM metrics_cache WHERE cache_key = ?",
            (key,),
        ).fetchone()
        if row is None:
            return None
        expires_at = _parse_dt(row["expires_at"])
        if expires_at <= _now():
            return None
        return CacheRow(cache_key=row["cache_key"], value_json=row["value_json"], expires_at=expires_at)

    def write(self, key: str, value_json: str, expires_at: datetime) -> None:
        """Insert or replace a cache entry (idempotent upsert)."""
        self._conn.execute(
            """
            INSERT INTO metrics_cache (cache_key, value_json, expires_at)
            VALUES (?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET
                value_json = excluded.value_json,
                expires_at = excluded.expires_at
            """,
            (key, value_json, expires_at.isoformat()),
        )

    def purge_expired(self) -> int:
        cur = self._conn.execute(
            "DELETE FROM metrics_cache WHERE expires_at <= ?", (_now().isoformat(),)
        )
        return cur.rowcount
