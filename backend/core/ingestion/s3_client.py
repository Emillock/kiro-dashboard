"""S3 access for Kiro user-activity reports (US-DATA-02).

Lists and downloads the daily per-user CSV reports for a date range. Tolerates missing days/files
(NFR-3.1): listing simply returns whatever exists.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError

from backend.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class S3IngestionClient:
    """Thin wrapper over boto3 S3 for listing and fetching report objects."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._bucket = self._settings.s3_bucket
        self._base_prefix = self._settings.s3_base_prefix
        self._client = boto3.client(
            "s3",
            aws_access_key_id=self._settings.aws_access_key_id or None,
            aws_secret_access_key=self._settings.aws_secret_access_key or None,
            region_name=self._settings.aws_default_region,
            config=BotoConfig(retries={"max_attempts": 3, "mode": "standard"}),
        )

    def _day_prefix(self, day: date) -> str:
        return (
            f"{self._base_prefix}{day.year}/{day.month:02d}/{day.day:02d}/00/"
        )

    def list_report_keys(self, start: date, end: date) -> list[str]:
        """List all report CSV keys for days in [start, end] (inclusive)."""
        keys: list[str] = []
        day = start
        while day <= end:
            prefix = self._day_prefix(day)
            try:
                resp = self._client.list_objects_v2(Bucket=self._bucket, Prefix=prefix)
                for obj in resp.get("Contents", []):
                    if obj["Key"].lower().endswith(".csv"):
                        keys.append(obj["Key"])
            except (BotoCoreError, ClientError) as exc:
                logger.warning("Failed to list S3 prefix %s: %s", prefix, exc)
            day += timedelta(days=1)
        return keys

    def list_all_keys(self) -> list[str]:
        """List every report CSV key under the base prefix (used for the email-map scan)."""
        keys: list[str] = []
        paginator = self._client.get_paginator("list_objects_v2")
        try:
            for page in paginator.paginate(Bucket=self._bucket, Prefix=self._base_prefix):
                for obj in page.get("Contents", []):
                    if obj["Key"].lower().endswith(".csv"):
                        keys.append(obj["Key"])
        except (BotoCoreError, ClientError) as exc:
            logger.warning("Failed to list all S3 keys: %s", exc)
        return keys

    def fetch_object_text(self, key: str) -> str:
        """Download an object and decode it (utf-8-sig to strip any BOM)."""
        try:
            resp = self._client.get_object(Bucket=self._bucket, Key=key)
            return resp["Body"].read().decode("utf-8-sig", errors="replace")
        except (BotoCoreError, ClientError) as exc:
            logger.warning("Failed to fetch S3 object %s: %s", key, exc)
            return ""
