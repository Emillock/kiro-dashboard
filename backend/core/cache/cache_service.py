"""Cache service over the SQLite cache repository.

Provides a simple get/set interface with JSON (de)serialization and TTL handling. Cache keys are
built deterministically from their parts (PBT: determinism + uniqueness).
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.repositories.cache_repo import CacheRepository


def make_key(*parts: str) -> str:
    """Build a deterministic cache key from string parts."""
    return ":".join(str(p) for p in parts)


class CacheService:
    def __init__(self, repo: CacheRepository) -> None:
        self._repo = repo

    def get(self, key: str) -> Any | None:
        """Return the deserialized cached value, or None if missing/expired."""
        row = self._repo.read(key)
        if row is None:
            return None
        try:
            return json.loads(row.value_json)
        except json.JSONDecodeError:
            return None

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        """Serialize and store a value with a TTL."""
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        self._repo.write(key, json.dumps(value, default=str), expires_at)

    def invalidate_expired(self) -> int:
        return self._repo.purge_expired()
