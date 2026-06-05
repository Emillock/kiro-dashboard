"""User directory service — searchable user list for the Individual page (US-IND-02)."""
from __future__ import annotations

from backend.models.metrics import UserSummary
from backend.services.metrics_service import MetricsService


class UserDirectoryService:
    def __init__(self, metrics_service: MetricsService) -> None:
        self._metrics = metrics_service

    def search_users(self, range_label: str, query: str | None = None) -> list[UserSummary]:
        """Return users whose label or user_id matches the query (case-insensitive substring)."""
        users = self._metrics.list_users(range_label)
        if not query:
            return users
        q = query.strip().lower()
        return [u for u in users if q in u.label.lower() or q in u.user_id.lower()]
