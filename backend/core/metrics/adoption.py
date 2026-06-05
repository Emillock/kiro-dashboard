"""AI Adoption score (US-METRIC-03).

The score is an **absolute weighted sum** (Q8=B) of per-user metrics, using configurable weights
(Q7=A defaults, FR-3.3.1). A missing metric contributes 0 (FR-3.3.2).

    score = w_total_messages      * total_messages
          + w_chat_conversations  * chat_conversations
          + w_credits_used        * credits_used
          + w_active_days         * active_days
"""
from __future__ import annotations

from backend.core.config import DEFAULT_ADOPTION_WEIGHTS
from backend.models.metrics import UserMetrics


def adoption_score(metrics: UserMetrics, weights: dict[str, float] | None = None) -> float:
    """Compute the absolute weighted-sum AI Adoption score for one user."""
    w = weights or DEFAULT_ADOPTION_WEIGHTS
    score = (
        w.get("total_messages", 0.0) * metrics.total_messages
        + w.get("chat_conversations", 0.0) * metrics.chat_conversations
        + w.get("credits_used", 0.0) * metrics.credits_used
        + w.get("active_days", 0.0) * metrics.active_days
    )
    return round(score, 4)


def apply_scores(
    user_metrics: list[UserMetrics],
    weights: dict[str, float] | None = None,
) -> list[UserMetrics]:
    """Attach an ``adoption_score`` to each user and return the list."""
    for m in user_metrics:
        m.adoption_score = adoption_score(m, weights)
    return user_metrics
