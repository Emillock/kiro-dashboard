"""Tests for CacheService / make_key (PBT-02 round-trip, PBT-03 invariant, PBT-04 idempotency)."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

from hypothesis import given, settings
from hypothesis import strategies as st

from backend.core.cache.cache_service import CacheService, make_key
from backend.repositories.cache_repo import CacheRepository


def _make_service() -> CacheService:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE metrics_cache (
            cache_key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            expires_at TEXT NOT NULL
        )
    """)
    return CacheService(CacheRepository(conn))


# --- Example-based tests ---

def test_set_then_get_returns_value():
    svc = _make_service()
    svc.set("k1", {"x": 1}, ttl_seconds=300)
    assert svc.get("k1") == {"x": 1}


def test_get_missing_key_returns_none():
    svc = _make_service()
    assert svc.get("no_such_key") is None


def test_expired_entry_returns_none():
    svc = _make_service()
    # manually write an already-expired entry
    svc._repo.write("k_exp", '{"v":1}', datetime.now(timezone.utc) - timedelta(seconds=1))
    assert svc.get("k_exp") is None


def test_overwrite_updates_value():
    svc = _make_service()
    svc.set("k", "old", 300)
    svc.set("k", "new", 300)
    assert svc.get("k") == "new"


def test_make_key_deterministic():
    assert make_key("a", "b", "c") == make_key("a", "b", "c")


def test_make_key_different_parts_different_keys():
    assert make_key("a", "b") != make_key("b", "a")
    assert make_key("x", "y") != make_key("x", "z")


# --- Property-based tests ---

key_parts = st.lists(st.text(min_size=1, max_size=20, alphabet=st.characters(
    whitelist_categories=("Ll", "Nd"),
)), min_size=1, max_size=4)

json_values = st.one_of(
    st.integers(),
    st.text(max_size=50),
    st.lists(st.integers(), max_size=5),
    st.dictionaries(st.text(max_size=10), st.integers(), max_size=3),
)


@settings(max_examples=100)
@given(key_parts)
def test_make_key_deterministic_pbt(parts):
    """Same parts always produce the same key (PBT-03 invariant)."""
    assert make_key(*parts) == make_key(*parts)


@settings(max_examples=100)
@given(st.text(min_size=1, max_size=30), json_values)
def test_cache_round_trip(key, value):
    """set then get returns the original value (PBT-02 round-trip)."""
    svc = _make_service()
    svc.set(key, value, ttl_seconds=3600)
    assert svc.get(key) == value


@settings(max_examples=100)
@given(st.text(min_size=1, max_size=30), json_values, json_values)
def test_cache_idempotent_overwrite(key, val1, val2):
    """Setting a key twice with the same value leaves the same result (PBT-04)."""
    svc = _make_service()
    svc.set(key, val1, ttl_seconds=3600)
    svc.set(key, val1, ttl_seconds=3600)
    assert svc.get(key) == val1
