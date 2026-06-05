"""UserId -> email mapping (US-DATA-05).

The ``User_Email`` column is present in only a subset of report files. To label users by email
everywhere, we scan the files that DO contain it and build a ``{user_id: email}`` map. When a user
has no known email, we fall back to a shortened UserId.
"""
from __future__ import annotations

import logging

from backend.core.ingestion.parser import parse_report
from backend.core.ingestion.s3_client import S3IngestionClient

logger = logging.getLogger(__name__)


def build_email_map(client: S3IngestionClient) -> dict[str, str]:
    """Scan all report files and return a ``{user_id: email}`` mapping.

    Only files containing ``User_Email`` contribute. If the same user maps to multiple emails
    (not observed in current data), the first non-empty email encountered wins.
    """
    email_map: dict[str, str] = {}
    for key in client.list_all_keys():
        text = client.fetch_object_text(key)
        if not text:
            continue
        lines = text.splitlines()
        header_line = lines[0] if lines else ""
        # Quick header check: skip files whose header lacks User_Email.
        if "User_Email" not in header_line:
            continue
        for record in parse_report(text):
            if record.user_email and record.user_id not in email_map:
                email_map[record.user_id] = record.user_email
    logger.info("Built email map with %d entries", len(email_map))
    return email_map


def shorten_user_id(user_id: str, length: int = 8) -> str:
    """Return a shortened display form of a UserId."""
    if not user_id:
        return "unknown"
    if len(user_id) <= length:
        return user_id
    return f"{user_id[:length]}…"


def resolve_label(user_id: str, email_map: dict[str, str]) -> str:
    """Return the email for a user if known, else a shortened UserId (US-DATA-05, A-4)."""
    email = email_map.get(user_id)
    if email:
        return email
    return shorten_user_id(user_id)
