"""Tests for the metrics aggregator (US-METRIC-01, US-METRIC-02, US-DATA-04).

Example-based + property-based tests for the invariants in the Unit 1 plan (PBT-03, PBT-05).
"""
from __future__ import annotations

from datetime import date

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from backend.core.metrics.aggregator import (
    combine_records,
    compute_aggregate_metrics,
    compute_user_metrics,
)
from backend.models.metrics import UsageRecord
from backend.tests.unit.generators import usage_records


# --- Example-based tests ---

def _rec(user_id, client, day, msgs, convos, credits=0.0, models=None):
    return UsageRecord(
        date=day,
        user_id=user_id,
        client_type=client,
        chat_conversations=convos,
        credits_used=credits,
        total_messages=msgs,
        model_messages=models or {},
    )


def test_ide_and_cli_combined_per_user():
    records = [
        _rec("u1", "KIRO_IDE", date(2026, 6, 1), 100, 5, 10.0, {"auto_messages": 60}),
        _rec("u1", "KIRO_CLI", date(2026, 6, 1), 27, 1, 3.0, {"auto_messages": 2}),
    ]
    metrics = compute_user_metrics(records)
    assert len(metrics) == 1
    m = metrics[0]
    assert m.total_messages == 127
    assert m.chat_conversations == 6
    assert m.credits_used == 13.0
    assert m.model_messages["auto_messages"] == 62


def test_active_days_counts_only_active_days():
    records = [
        _rec("u1", "KIRO_IDE", date(2026, 6, 1), 10, 0),   # active (messages>0)
        _rec("u1", "KIRO_IDE", date(2026, 6, 2), 0, 0),    # inactive
        _rec("u1", "KIRO_IDE", date(2026, 6, 3), 0, 4),    # active (convos>0)
    ]
    m = compute_user_metrics(records)[0]
    assert m.active_days == 2


def test_label_uses_email_when_available():
    records = [_rec("u1", "KIRO_IDE", date(2026, 6, 1), 10, 1)]
    metrics = compute_user_metrics(records, email_map={"u1": "user1@example.com"})
    assert metrics[0].label == "user1@example.com"


def test_aggregate_totals_equal_sum_of_users():
    records = [
        _rec("u1", "KIRO_IDE", date(2026, 6, 1), 100, 5, 10.0),
        _rec("u2", "KIRO_IDE", date(2026, 6, 1), 50, 2, 4.0),
    ]
    users = compute_user_metrics(records)
    agg = compute_aggregate_metrics(users, records, "week", date(2026, 6, 1), date(2026, 6, 7))
    assert agg.total_messages == 150
    assert agg.total_chat_conversations == 7
    assert agg.active_user_count == 2


# --- Property-based tests (Hypothesis) ---

@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
@given(st.lists(usage_records(), min_size=0, max_size=25))
def test_combine_preserves_record_count(records):
    grouped = combine_records(records)
    assert sum(len(v) for v in grouped.values()) == len(records)


@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
@given(st.lists(usage_records(), min_size=1, max_size=25))
def test_user_totals_equal_sum_of_their_records(records):
    grouped = combine_records(records)
    metrics = {m.user_id: m for m in compute_user_metrics(records)}
    for user_id, recs in grouped.items():
        assert metrics[user_id].total_messages == sum(r.total_messages for r in recs)
        assert metrics[user_id].chat_conversations == sum(r.chat_conversations for r in recs)


@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
@given(st.lists(usage_records(), min_size=1, max_size=25))
def test_active_days_within_bounds(records):
    """active_days must be between 0 and the number of distinct dates for that user."""
    grouped = combine_records(records)
    metrics = {m.user_id: m for m in compute_user_metrics(records)}
    for user_id, recs in grouped.items():
        distinct_days = len({r.date for r in recs})
        assert 0 <= metrics[user_id].active_days <= distinct_days


@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
@given(st.lists(usage_records(), min_size=1, max_size=25))
def test_aggregate_equals_sum_of_users_oracle(records):
    """Oracle: aggregate totals must equal the brute-force sum over per-user metrics."""
    users = compute_user_metrics(records)
    agg = compute_aggregate_metrics(users, records, "month", date(2026, 4, 1), date(2026, 6, 30))
    assert agg.total_messages == sum(u.total_messages for u in users)
    assert agg.total_chat_conversations == sum(u.chat_conversations for u in users)
