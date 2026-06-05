"""Reusable Hypothesis strategies (domain generators) for property-based tests (PBT-07).

These generators produce realistic, constrained domain objects rather than raw primitives, so
property tests exercise meaningful inputs.
"""
from __future__ import annotations

from datetime import date

from hypothesis import strategies as st

from backend.models.metrics import UsageRecord, UserMetrics

# A small pool of stable, UUID-like user ids so multiple records can collide on the same user.
user_ids = st.sampled_from(
    [
        "3418e4b8-7011-70bd-40eb-e18d9c6fb086",
        "44784438-10d1-7045-3de4-1b58e34374b8",
        "5458e4b8-f071-708a-4f9f-176493c016b4",
        "84283488-b0c1-70f2-53cf-7c8f1371135c",
        "942894a8-f0e1-7019-eeeb-14354b7ce7d4",
    ]
)

client_types = st.sampled_from(["KIRO_IDE", "KIRO_CLI"])
subscription_tiers = st.sampled_from(["PRO", "PRO_PLUS", None])
model_names = st.sampled_from(
    [
        "auto_messages",
        "claude_opus_4.6_messages",
        "claude_opus_4.8_messages",
        "claude_sonnet_4.6_messages",
        "glm_5_messages",
    ]
)

report_dates = st.dates(min_value=date(2026, 4, 1), max_value=date(2026, 6, 30))


emails = st.sampled_from(
    [None, "user17@example.com", "user18@example.com", "user19@example.com"]
)


@st.composite
def model_message_maps(draw) -> dict[str, int]:
    keys = draw(st.lists(model_names, min_size=0, max_size=3, unique=True))
    return {k: draw(st.integers(min_value=0, max_value=2000)) for k in keys}


@st.composite
def usage_records(draw) -> UsageRecord:
    """Generate a single realistic UsageRecord."""
    return UsageRecord(
        date=draw(report_dates),
        user_id=draw(user_ids),
        client_type=draw(client_types),
        chat_conversations=draw(st.integers(min_value=0, max_value=200)),
        credits_used=draw(st.floats(min_value=0, max_value=5000, allow_nan=False, allow_infinity=False)),
        total_messages=draw(st.integers(min_value=0, max_value=5000)),
        overage_credits_used=draw(st.floats(min_value=0, max_value=1000, allow_nan=False, allow_infinity=False)),
        overage_enabled=draw(st.booleans()),
        subscription_tier=draw(subscription_tiers),
        model_messages=draw(model_message_maps()),
        user_email=draw(emails),
    )


@st.composite
def user_metrics(draw) -> UserMetrics:
    """Generate a single UserMetrics object with non-negative values."""
    return UserMetrics(
        user_id=draw(user_ids),
        label="user@example.com",
        total_messages=draw(st.integers(min_value=0, max_value=10000)),
        chat_conversations=draw(st.integers(min_value=0, max_value=1000)),
        credits_used=draw(st.floats(min_value=0, max_value=10000, allow_nan=False, allow_infinity=False)),
        active_days=draw(st.integers(min_value=0, max_value=60)),
        model_messages=draw(model_message_maps()),
    )


def weight_maps():
    """Strategy for non-negative AI Adoption weight maps."""
    weight = st.floats(min_value=0, max_value=1, allow_nan=False, allow_infinity=False)
    return st.fixed_dictionaries(
        {
            "total_messages": weight,
            "chat_conversations": weight,
            "credits_used": weight,
            "active_days": weight,
        }
    )
