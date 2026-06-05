"""Tests for ranking/selection (FR-6.3, FR-4.3).

Example-based + property-based tests for invariants in the Unit 1 plan (PBT-03 ordering/size,
top5_bottom5 no-overlap).
"""
from __future__ import annotations

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from backend.core.metrics.selection import (
    MAX_N,
    clamp_n,
    select_users,
    top_adopters,
)
from backend.models.metrics import UserMetrics
from backend.tests.unit.generators import user_metrics


def _users(values):
    return [
        UserMetrics(user_id=f"u{i}", label=f"u{i}", total_messages=v, adoption_score=float(v))
        for i, v in enumerate(values)
    ]


# --- Example-based tests ---

def test_top_n_returns_highest():
    users = _users([10, 50, 30, 20, 40])
    result = select_users(users, "total_messages", "top_n", 2)
    assert [u.total_messages for u in result] == [50, 40]


def test_bottom_n_returns_lowest():
    users = _users([10, 50, 30, 20, 40])
    result = select_users(users, "total_messages", "bottom_n", 2)
    assert [u.total_messages for u in result] == [10, 20]


def test_top5_bottom5_with_few_users_returns_all():
    users = _users([10, 20, 30])
    result = select_users(users, "total_messages", "top5_bottom5")
    assert len(result) == 3


def test_top5_bottom5_with_many_users():
    users = _users(list(range(20)))  # 0..19
    result = select_users(users, "total_messages", "top5_bottom5")
    assert len(result) == 10
    values = [u.total_messages for u in result]
    assert values[:5] == [19, 18, 17, 16, 15]
    assert values[5:] == [4, 3, 2, 1, 0]


def test_n_capped_at_20():
    users = _users(list(range(50)))
    result = select_users(users, "total_messages", "top_n", 100)
    assert len(result) == MAX_N


def test_top_adopters_returns_5():
    users = _users(list(range(10)))
    result = top_adopters(users, 5)
    assert len(result) == 5
    assert result[0].adoption_score == 9.0


def test_invalid_metric_raises():
    try:
        select_users(_users([1, 2]), "nonexistent", "top_n", 1)  # type: ignore[arg-type]
        assert False, "expected ValueError"
    except ValueError:
        pass


# --- Property-based tests (Hypothesis) ---

@settings(max_examples=100)
@given(st.integers(min_value=-100, max_value=100) | st.none())
def test_clamp_n_within_bounds(n):
    assert 1 <= clamp_n(n) <= MAX_N


@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
@given(st.lists(user_metrics(), min_size=0, max_size=40), st.integers(min_value=1, max_value=40))
def test_top_n_size_bounded(users, n):
    result = select_users(users, "total_messages", "top_n", n)
    assert len(result) <= min(len(users), MAX_N)


@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
@given(st.lists(user_metrics(), min_size=2, max_size=40))
def test_top_n_ordering_non_increasing(users):
    result = select_users(users, "total_messages", "top_n", MAX_N)
    values = [u.total_messages for u in result]
    assert values == sorted(values, reverse=True)


@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
@given(st.lists(user_metrics(), min_size=10, max_size=40))
def test_top5_bottom5_no_duplicates(users):
    # Use a distinct id per user to detect overlap reliably.
    for i, u in enumerate(users):
        u.user_id = f"user-{i}"
    result = select_users(users, "adoption_score", "top5_bottom5")
    ids = [u.user_id for u in result]
    assert len(ids) == len(set(ids))
