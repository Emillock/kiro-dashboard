"""Metrics orchestration: cache-first pipeline over Unit 1 logic (FR-2.6, NFR-2, NFR-3).

For a requested time range, the service:
  1. computes the [start, end] date window,
  2. checks the SQLite cache,
  3. on miss: lists + fetches S3 reports, parses, combines IDE+CLI, computes per-user + aggregate
     metrics, applies the AI Adoption score, and caches the result,
  4. serves derived views (aggregate, per-user, top-adopters, comparison, user list).

Ingestion failures are caught and surfaced as MetricsError (US-NFR-05) rather than crashing.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta

from backend.core.cache.cache_service import CacheService, make_key
from backend.core.config import Settings, get_settings
from backend.core.ingestion.email_map import build_email_map
from backend.core.ingestion.parser import parse_report
from backend.core.ingestion.s3_client import S3IngestionClient
from backend.core.metrics.adoption import apply_scores
from backend.core.metrics.aggregator import (
    compute_aggregate_metrics,
    compute_user_metrics,
)
from backend.core.metrics.selection import (
    MetricKey,
    SelectionMode,
    select_users,
    top_adopters,
)
from backend.models.metrics import AggregateMetrics, UsageRecord, UserMetrics, UserSummary

logger = logging.getLogger(__name__)

VALID_RANGES = {"week", "month"}


class MetricsError(Exception):
    """Raised when metrics cannot be produced (e.g. S3 access failure)."""


def _range_window(range_label: str, today: date | None = None) -> tuple[date, date]:
    today = today or date.today()
    if range_label == "week":
        start = today - timedelta(days=7)
    else:  # month (default)
        start = today - timedelta(days=30)
    return start, today


class MetricsService:
    def __init__(
        self,
        cache: CacheService,
        s3_client: S3IngestionClient | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._cache = cache
        self._settings = settings or get_settings()
        self._s3 = s3_client or S3IngestionClient(self._settings)

    # --- email mapping (longer TTL) ---
    def get_email_map(self) -> dict[str, str]:
        key = make_key("email_map", "v1")
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        try:
            mapping = build_email_map(self._s3)
        except Exception as exc:  # noqa: BLE001 - resilient ingestion (US-NFR-05)
            logger.warning("email map build failed: %s", exc)
            mapping = {}
        self._cache.set(key, mapping, self._settings.email_map_ttl_seconds)
        return mapping

    # --- core pipeline (cache-first) ---
    def _load_user_metrics(self, range_label: str) -> tuple[list[UserMetrics], list[UsageRecord], date, date]:
        if range_label not in VALID_RANGES:
            raise MetricsError(f"invalid range: {range_label}")
        start, end = _range_window(range_label)
        try:
            keys = self._s3.list_report_keys(start, end)
            records: list[UsageRecord] = []
            for key in keys:
                text = self._s3.fetch_object_text(key)
                if text:
                    records.extend(parse_report(text))
        except Exception as exc:  # noqa: BLE001 - resilient ingestion (US-NFR-05)
            logger.error("S3 ingestion failed for range %s: %s", range_label, exc)
            raise MetricsError("failed to load metrics from S3") from exc

        email_map = self.get_email_map()
        users = compute_user_metrics(records, email_map=email_map)
        users = apply_scores(users, self._settings.adoption_weights)
        return users, records, start, end

    def _cached_user_metrics(self, range_label: str) -> list[UserMetrics]:
        start, end = _range_window(range_label)
        key = make_key("users", range_label, start.isoformat(), end.isoformat())
        cached = self._cache.get(key)
        if cached is not None:
            return [UserMetrics(**u) for u in cached]
        users, _records, _s, _e = self._load_user_metrics(range_label)
        self._cache.set(key, [u.model_dump(mode="json") for u in users], self._settings.cache_ttl_seconds)
        return users

    # --- public API ---
    def get_aggregate_metrics(self, range_label: str) -> AggregateMetrics:
        start, end = _range_window(range_label)
        key = make_key("aggregate", range_label, start.isoformat(), end.isoformat())
        cached = self._cache.get(key)
        if cached is not None:
            return AggregateMetrics(**cached)
        users, records, start, end = self._load_user_metrics(range_label)
        agg = compute_aggregate_metrics(users, records, range_label, start, end)
        self._cache.set(key, agg.model_dump(mode="json"), self._settings.cache_ttl_seconds)
        # also cache the user list to avoid recompute
        ukey = make_key("users", range_label, start.isoformat(), end.isoformat())
        self._cache.set(ukey, [u.model_dump(mode="json") for u in users], self._settings.cache_ttl_seconds)
        return agg

    def list_users(self, range_label: str) -> list[UserSummary]:
        users = self._cached_user_metrics(range_label)
        return [
            UserSummary(
                user_id=u.user_id,
                label=u.label,
                adoption_score=u.adoption_score,
                total_messages=u.total_messages,
                chat_conversations=u.chat_conversations,
                credits_used=u.credits_used,
                active_days=u.active_days,
            )
            for u in sorted(users, key=lambda x: x.adoption_score, reverse=True)
        ]

    def get_user_metrics(self, range_label: str, user_id: str) -> UserMetrics | None:
        users = self._cached_user_metrics(range_label)
        for u in users:
            if u.user_id == user_id:
                return u
        return None

    def get_top_adopters(self, range_label: str, k: int = 5) -> list[UserMetrics]:
        users = self._cached_user_metrics(range_label)
        return top_adopters(users, k)

    def get_comparison(
        self, range_label: str, metric: MetricKey, mode: SelectionMode, n: int | None = None
    ) -> list[UserMetrics]:
        users = self._cached_user_metrics(range_label)
        return select_users(users, metric, mode, n)
