"""User ranking and selection for the podium and comparison page.

Supports Top-N, Bottom-N, Top-5 + Bottom-5, and All (FR-6.3). N is capped at 20 (Q15=A / FR-6.3).
Also provides the Top-5-by-AI-Adoption list for the main-page podium (FR-4.3).
"""
from __future__ import annotations

from typing import Literal

from backend.models.metrics import UserMetrics

MetricKey = Literal[
    "adoption_score",
    "total_messages",
    "chat_conversations",
    "credits_used",
    "active_days",
]
SelectionMode = Literal["top_n", "bottom_n", "top5_bottom5", "all"]

MAX_N = 20
VALID_METRICS: set[str] = {
    "adoption_score",
    "total_messages",
    "chat_conversations",
    "credits_used",
    "active_days",
}


def _metric_value(user: UserMetrics, metric: str) -> float:
    return float(getattr(user, metric, 0) or 0)


def _sorted_by(users: list[UserMetrics], metric: str, descending: bool) -> list[UserMetrics]:
    return sorted(users, key=lambda u: _metric_value(u, metric), reverse=descending)


def clamp_n(n: int | None) -> int:
    """Clamp a requested N into the inclusive range [1, MAX_N]."""
    if n is None:
        return MAX_N
    return max(1, min(int(n), MAX_N))


def select_users(
    users: list[UserMetrics],
    metric: MetricKey,
    mode: SelectionMode,
    n: int | None = None,
) -> list[UserMetrics]:
    """Return an ordered subset of users for the given metric and selection mode."""
    if metric not in VALID_METRICS:
        raise ValueError(f"Invalid metric: {metric}")

    if mode == "all":
        return _sorted_by(users, metric, descending=True)

    if mode == "top_n":
        return _sorted_by(users, metric, descending=True)[: clamp_n(n)]

    if mode == "bottom_n":
        return _sorted_by(users, metric, descending=False)[: clamp_n(n)]

    if mode == "top5_bottom5":
        ranked = _sorted_by(users, metric, descending=True)
        if len(ranked) <= 10:
            return ranked
        top5 = ranked[:5]
        bottom5 = ranked[-5:]
        return top5 + bottom5

    raise ValueError(f"Invalid selection mode: {mode}")


def top_adopters(users: list[UserMetrics], k: int = 5) -> list[UserMetrics]:
    """Return the top-k users by AI Adoption score (main-page podium, FR-4.3)."""
    return _sorted_by(users, "adoption_score", descending=True)[: max(0, k)]
