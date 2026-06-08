"""Daily data-refresh scheduler.

Kiro activity CSVs land in S3 at ~06:00 each day. This scheduler pulls all of that data
once a day at 07:00 (Asia/Baku by default) and stores it locally in the SQLite snapshot, so
the dashboard serves from the local store with no per-request S3 access and no live polling.

A one-off refresh is also kicked off on application startup so the dashboard has data
immediately rather than waiting for the next 07:00 window.
"""
from __future__ import annotations

import logging
import threading

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from backend.core.cache.cache_service import CacheService
from backend.core.config import Settings, get_settings
from backend.repositories.cache_repo import CacheRepository
from backend.repositories.db import get_connection
from backend.services.metrics_service import MetricsService

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def run_daily_refresh() -> None:
    """Pull all data from S3 and rebuild the local snapshot (used by the scheduler/startup)."""
    conn = get_connection()
    try:
        service = MetricsService(cache=CacheService(CacheRepository(conn)))
        summary = service.refresh_all()
        conn.commit()
        logger.info("Daily refresh complete: %s", summary)
    except Exception:  # noqa: BLE001 - never let a refresh crash the scheduler thread
        logger.exception("Daily refresh job failed")
    finally:
        conn.close()


def start_scheduler(settings: Settings | None = None) -> BackgroundScheduler | None:
    """Start the background scheduler and kick off an initial refresh.

    Returns the scheduler instance (or None if disabled).
    """
    global _scheduler
    settings = settings or get_settings()

    if not settings.daily_refresh_enabled:
        logger.info("Daily refresh disabled (DAILY_REFRESH_ENABLED=false)")
        return None

    # Warm the local store immediately on startup, in a background thread so we don't
    # block application startup while S3 is scanned.
    threading.Thread(target=run_daily_refresh, name="startup-refresh", daemon=True).start()

    scheduler = BackgroundScheduler(timezone=settings.daily_refresh_timezone)
    trigger = CronTrigger(
        hour=settings.daily_refresh_hour,
        minute=settings.daily_refresh_minute,
        timezone=settings.daily_refresh_timezone,
    )
    scheduler.add_job(
        run_daily_refresh,
        trigger=trigger,
        id="daily-s3-refresh",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info(
        "Scheduler started: daily refresh at %02d:%02d %s",
        settings.daily_refresh_hour,
        settings.daily_refresh_minute,
        settings.daily_refresh_timezone,
    )
    return scheduler


def shutdown_scheduler() -> None:
    """Stop the background scheduler if running."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Scheduler stopped")
