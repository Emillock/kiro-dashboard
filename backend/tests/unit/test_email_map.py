"""Tests for email mapping / label resolution (US-DATA-05)."""
from __future__ import annotations

from backend.core.ingestion.email_map import resolve_label, shorten_user_id


def test_resolve_label_returns_email_when_known():
    email_map = {"3418e4b8-7011-70bd-40eb-e18d9c6fb086": "user11@example.com"}
    assert resolve_label("3418e4b8-7011-70bd-40eb-e18d9c6fb086", email_map) == "user11@example.com"


def test_resolve_label_falls_back_to_shortened_id():
    label = resolve_label("3418e4b8-7011-70bd-40eb-e18d9c6fb086", {})
    assert label.startswith("3418e4b8")
    assert label.endswith("…")


def test_shorten_short_id_unchanged():
    assert shorten_user_id("abc") == "abc"


def test_shorten_empty_id():
    assert shorten_user_id("") == "unknown"
