"""Metrics aggregation engine (US-METRIC-01, US-METRIC-02, US-DATA-04).

Combines IDE + CLI rows per user (Q9=A), computes per-user metrics over a period, and computes
organization-wide aggregate metrics. An "active day" is a day where the user had
``Total_Messages > 0 OR Chat_Conversations > 0`` (Q3=B).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date

from backend.models.metrics import (
    AggregateMetrics,
    DailyTotal,
    UsageRecord,
    UserMetrics,
)


def combine_records(records: list[UsageRecord]) -> dict[str, list[UsageRecord]]:
    """Group records by user_id (IDE and CLI together)."""
    grouped: dict[str, list[UsageRecord]] = defaultdict(list)
    for record in records:
        grouped[record.user_id].append(record)
    return dict(grouped)


def _is_active(record: UsageRecord) -> bool:
    return record.total_messages > 0 or record.chat_conversations > 0


def compute_user_metrics(
    records: list[UsageRecord],
    email_map: dict[str, str] | None = None,
) -> list[UserMetrics]:
    """Compute per-user metrics over the period represented by ``records``."""
    from backend.core.ingestion.email_map import resolve_label

    email_map = email_map or {}
    grouped = combine_records(records)
    results: list[UserMetrics] = []

    for user_id, user_records in grouped.items():
        total_messages = sum(r.total_messages for r in user_records)
        chat_conversations = sum(r.chat_conversations for r in user_records)
        credits_used = sum(r.credits_used for r in user_records)
        overage_credits_used = sum(r.overage_credits_used for r in user_records)

        # Overage cap (credit allowance): take the most-recent non-zero value.
        overage_cap = 0.0
        for r in sorted(user_records, key=lambda x: x.date, reverse=True):
            if r.overage_cap:
                overage_cap = r.overage_cap
                break

        # Active days: distinct dates with activity.
        active_dates = {r.date for r in user_records if _is_active(r)}
        active_days = len(active_dates)

        # Per-model message totals across all the user's rows.
        model_messages: dict[str, int] = defaultdict(int)
        for r in user_records:
            for model, count in r.model_messages.items():
                model_messages[model] += count

        # Subscription tier: take the most recent non-null.
        tier = None
        for r in sorted(user_records, key=lambda x: x.date, reverse=True):
            if r.subscription_tier:
                tier = r.subscription_tier
                break

        # Per-day breakdown for charts.
        daily_map: dict[date, DailyTotal] = {}
        for r in user_records:
            dt = daily_map.get(r.date)
            if dt is None:
                daily_map[r.date] = DailyTotal(
                    date=r.date,
                    total_messages=r.total_messages,
                    chat_conversations=r.chat_conversations,
                    credits_used=r.credits_used,
                    active_users=1 if _is_active(r) else 0,
                )
            else:
                dt.total_messages += r.total_messages
                dt.chat_conversations += r.chat_conversations
                dt.credits_used += r.credits_used

        daily_breakdown = [daily_map[d] for d in sorted(daily_map)]

        results.append(
            UserMetrics(
                user_id=user_id,
                label=resolve_label(user_id, email_map),
                total_messages=total_messages,
                chat_conversations=chat_conversations,
                credits_used=round(credits_used, 6),
                active_days=active_days,
                model_messages=dict(model_messages),
                subscription_tier=tier,
                adoption_score=0.0,  # filled by adoption.apply_scores
                daily_breakdown=daily_breakdown,
                overage_cap=overage_cap,
                overage_credits_used=round(overage_credits_used, 6),
            )
        )

    return results


def compute_aggregate_metrics(
    user_metrics: list[UserMetrics],
    records: list[UsageRecord],
    range_label: str,
    start_date: date,
    end_date: date,
) -> AggregateMetrics:
    """Compute organization-wide aggregate metrics from per-user metrics + raw records."""
    total_messages = sum(u.total_messages for u in user_metrics)
    total_conversations = sum(u.chat_conversations for u in user_metrics)
    total_credits = sum(u.credits_used for u in user_metrics)
    active_user_count = sum(1 for u in user_metrics if u.active_days > 0)
    user_count = len(user_metrics) or 1

    # Model distribution across all users.
    model_distribution: dict[str, int] = defaultdict(int)
    for u in user_metrics:
        for model, count in u.model_messages.items():
            model_distribution[model] += count

    # Daily totals across all users (for time-series charts).
    daily_map: dict[date, DailyTotal] = {}
    for r in records:
        dt = daily_map.get(r.date)
        active = 1 if _is_active(r) else 0
        if dt is None:
            daily_map[r.date] = DailyTotal(
                date=r.date,
                total_messages=r.total_messages,
                chat_conversations=r.chat_conversations,
                credits_used=r.credits_used,
                active_users=active,
            )
        else:
            dt.total_messages += r.total_messages
            dt.chat_conversations += r.chat_conversations
            dt.credits_used += r.credits_used
            dt.active_users += active

    daily_totals = [daily_map[d] for d in sorted(daily_map)]

    return AggregateMetrics(
        range=range_label,
        start_date=start_date,
        end_date=end_date,
        total_messages=total_messages,
        total_chat_conversations=total_conversations,
        total_credits_used=round(total_credits, 6),
        active_user_count=active_user_count,
        avg_messages_per_user=round(total_messages / user_count, 2),
        avg_conversations_per_user=round(total_conversations / user_count, 2),
        model_distribution=dict(model_distribution),
        daily_totals=daily_totals,
    )
