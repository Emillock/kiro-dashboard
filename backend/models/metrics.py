"""Domain models for ingestion and metrics.

These dataclasses/Pydantic models are the contract between Unit 1 (Data & Metrics) and Unit 2
(Auth & API). Unit 2 imports and serializes these directly.
"""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


# --- Stable core CSV columns (always present) ---
STABLE_CORE_COLUMNS = [
    "Date",
    "UserId",
    "Client_Type",
    "Chat_Conversations",
    "Credits_Used",
    "Overage_Cap",
    "Overage_Credits_Used",
    "Overage_Enabled",
    "ProfileId",
    "Subscription_Tier",
    "Total_Messages",
]


class UsageRecord(BaseModel):
    """A single parsed row from a daily report CSV (one user, one client type, one day)."""

    date: date
    user_id: str
    client_type: str                       # KIRO_IDE | KIRO_CLI
    chat_conversations: int = 0
    credits_used: float = 0.0
    total_messages: int = 0
    overage_credits_used: float = 0.0
    overage_enabled: bool = False
    subscription_tier: str | None = None
    profile_id: str | None = None
    # Dynamic per-model message counts (e.g. auto_messages, claude_opus_4.8_messages)
    model_messages: dict[str, int] = Field(default_factory=dict)
    user_email: str | None = None          # present only in some files
    new_user: bool | None = None


class DailyTotal(BaseModel):
    """Per-day aggregate point for time-series charts."""

    date: date
    total_messages: int = 0
    chat_conversations: int = 0
    credits_used: float = 0.0
    active_users: int = 0


class UserMetrics(BaseModel):
    """Aggregated per-user metrics over a time period."""

    user_id: str
    label: str                             # email if known, else shortened user_id
    total_messages: int = 0
    chat_conversations: int = 0
    credits_used: float = 0.0
    active_days: int = 0
    model_messages: dict[str, int] = Field(default_factory=dict)
    subscription_tier: str | None = None
    adoption_score: float = 0.0
    daily_breakdown: list[DailyTotal] = Field(default_factory=list)


class UserSummary(BaseModel):
    """Lightweight per-user record for the search selector / comparison."""

    user_id: str
    label: str
    adoption_score: float = 0.0
    total_messages: int = 0
    chat_conversations: int = 0
    credits_used: float = 0.0
    active_days: int = 0


class AggregateMetrics(BaseModel):
    """Organization-wide aggregate metrics over a time period."""

    range: str                             # "week" | "month"
    start_date: date
    end_date: date
    total_messages: int = 0
    total_chat_conversations: int = 0
    total_credits_used: float = 0.0
    active_user_count: int = 0
    avg_messages_per_user: float = 0.0
    avg_conversations_per_user: float = 0.0
    model_distribution: dict[str, int] = Field(default_factory=dict)
    daily_totals: list[DailyTotal] = Field(default_factory=list)
