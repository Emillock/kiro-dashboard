"""Tests for the AI Adoption score (US-METRIC-03).

Example-based + property-based tests for invariants in the Unit 1 plan
(PBT-03 invariant/monotonicity, PBT-05 oracle).
"""
from __future__ import annotations

from hypothesis import given, settings
from hypothesis import strategies as st

from backend.core.config import DEFAULT_ADOPTION_WEIGHTS
from backend.core.metrics.adoption import adoption_score, apply_scores
from backend.models.metrics import UserMetrics
from backend.tests.unit.generators import user_metrics, weight_maps


# --- Example-based tests ---

def test_default_weighted_sum():
    m = UserMetrics(
        user_id="u1", label="u1",
        total_messages=100, chat_conversations=10, credits_used=50.0, active_days=5,
    )
    # 0.40*100 + 0.30*10 + 0.20*50 + 0.10*5 = 40 + 3 + 10 + 0.5 = 53.5
    assert adoption_score(m) == 53.5


def test_zero_metrics_zero_score():
    m = UserMetrics(user_id="u1", label="u1")
    assert adoption_score(m) == 0.0


def test_custom_weights_applied():
    m = UserMetrics(
        user_id="u1", label="u1",
        total_messages=100, chat_conversations=0, credits_used=0.0, active_days=0,
    )
    assert adoption_score(m, {"total_messages": 1.0}) == 100.0


def test_apply_scores_sets_field():
    users = [
        UserMetrics(user_id="u1", label="u1", total_messages=10),
        UserMetrics(user_id="u2", label="u2", total_messages=20),
    ]
    apply_scores(users)
    assert users[0].adoption_score == 4.0   # 0.40 * 10
    assert users[1].adoption_score == 8.0   # 0.40 * 20


# --- Property-based tests (Hypothesis) ---

@settings(max_examples=200)
@given(user_metrics())
def test_score_non_negative_for_non_negative_inputs(m):
    assert adoption_score(m) >= 0.0


@settings(max_examples=200)
@given(user_metrics())
def test_score_matches_manual_dot_product_oracle(m):
    """Oracle: score equals the manual weighted dot product (rounded)."""
    w = DEFAULT_ADOPTION_WEIGHTS
    expected = (
        w["total_messages"] * m.total_messages
        + w["chat_conversations"] * m.chat_conversations
        + w["credits_used"] * m.credits_used
        + w["active_days"] * m.active_days
    )
    assert adoption_score(m) == round(expected, 4)


@settings(max_examples=200)
@given(user_metrics(), st.integers(min_value=1, max_value=1000))
def test_monotonic_in_total_messages(m, delta):
    """Increasing total_messages (positive weight) never decreases the score."""
    base = adoption_score(m)
    m2 = m.model_copy(update={"total_messages": m.total_messages + delta})
    assert adoption_score(m2) >= base


@settings(max_examples=200)
@given(user_metrics(), weight_maps())
def test_score_non_negative_for_any_non_negative_weights(m, weights):
    assert adoption_score(m, weights) >= 0.0
