"""Dynamic CSV parser for Kiro user-activity reports (US-DATA-03).

The report schema evolves: the first 11 columns are stable, but per-model message columns
(matching ``*_messages`` / ``auto_messages``) are added/removed over time, and ``User_Email`` /
``New_User`` appear only in some files. This parser therefore:

- always reads the stable core columns,
- discovers message columns dynamically,
- defaults missing fields to 0/None,
- ignores unknown columns without error.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime

from backend.models.metrics import UsageRecord


def discover_message_columns(header: list[str]) -> list[str]:
    """Return the header names that represent per-model/mode message counts.

    A message column is any column ending in ``_messages`` (covers ``auto_messages`` and every
    ``claude_*_messages`` / ``glm_*_messages`` variant).
    """
    return [col for col in header if col.strip().endswith("_messages")]


def _to_int(value: str | None) -> int:
    if value is None:
        return 0
    value = value.strip()
    if not value:
        return 0
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return 0


def _to_float(value: str | None) -> float:
    if value is None:
        return 0.0
    value = value.strip()
    if not value:
        return 0.0
    try:
        return float(value)
    except (ValueError, TypeError):
        return 0.0


def _to_bool(value: str | None) -> bool:
    return str(value).strip().lower() in {"true", "1", "yes"}


def _parse_date(value: str | None):
    if not value:
        return None
    value = value.strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def parse_report(csv_text: str) -> list[UsageRecord]:
    """Parse one report CSV into a list of :class:`UsageRecord`.

    Rows with no usable ``UserId`` or ``Date`` are skipped. Unknown columns are ignored.
    """
    if not csv_text or not csv_text.strip():
        return []

    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)
    if len(rows) < 2:
        return []

    header = [h.strip() for h in rows[0]]
    index = {name: i for i, name in enumerate(header)}
    message_cols = discover_message_columns(header)

    def cell(row: list[str], col: str) -> str | None:
        i = index.get(col)
        if i is None or i >= len(row):
            return None
        return row[i]

    records: list[UsageRecord] = []
    for row in rows[1:]:
        if not row or all(not c.strip() for c in row):
            continue

        user_id = (cell(row, "UserId") or "").strip()
        report_date = _parse_date(cell(row, "Date"))
        if not user_id or report_date is None:
            continue

        model_messages = {col: _to_int(cell(row, col)) for col in message_cols}

        email = cell(row, "User_Email")
        email = email.strip() if email and email.strip() else None

        tier = cell(row, "Subscription_Tier")
        tier = tier.strip() if tier and tier.strip() else None

        profile = cell(row, "ProfileId")
        profile = profile.strip() if profile and profile.strip() else None

        new_user_raw = cell(row, "New_User")
        new_user = _to_bool(new_user_raw) if new_user_raw not in (None, "") else None

        records.append(
            UsageRecord(
                date=report_date,
                user_id=user_id,
                client_type=(cell(row, "Client_Type") or "").strip() or "UNKNOWN",
                chat_conversations=_to_int(cell(row, "Chat_Conversations")),
                credits_used=_to_float(cell(row, "Credits_Used")),
                total_messages=_to_int(cell(row, "Total_Messages")),
                overage_credits_used=_to_float(cell(row, "Overage_Credits_Used")),
                overage_enabled=_to_bool(cell(row, "Overage_Enabled")),
                subscription_tier=tier,
                profile_id=profile,
                model_messages=model_messages,
                user_email=email,
                new_user=new_user,
            )
        )

    return records
