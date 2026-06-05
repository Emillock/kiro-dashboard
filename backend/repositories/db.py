"""SQLite connection management and schema initialization.

A single SQLite database file (path from Settings) holds both application data (registered users)
and the S3 result cache (Q2=B). ``init_db`` is idempotent (PBT-04).
"""
from __future__ import annotations

import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

from backend.core.config import get_settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS metrics_cache (
    cache_key   TEXT PRIMARY KEY,
    value_json  TEXT NOT NULL,
    expires_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON metrics_cache(expires_at);
"""


def _resolve_db_path() -> str:
    path = get_settings().database_path
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    return path


def get_connection() -> sqlite3.Connection:
    """Open a new SQLite connection with row access by name and FK enforcement."""
    conn = sqlite3.connect(_resolve_db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    """Context-managed connection that commits on success and always closes."""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """Create tables and indexes if they do not exist (idempotent)."""
    with connection() as conn:
        conn.executescript(_SCHEMA)
