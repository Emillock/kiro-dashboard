"""Application configuration and settings.

All configuration — including AWS credentials and the AI Adoption weights — is loaded from
environment variables / a `.env` file. Secrets are never hard-coded (US-DATA-01, NFR-4.2).
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


# Default AI Adoption weights (Q7: option A). Configurable without code changes (FR-3.3.1).
DEFAULT_ADOPTION_WEIGHTS: dict[str, float] = {
    "total_messages": 0.40,
    "chat_conversations": 0.30,
    "credits_used": 0.20,
    "active_days": 0.10,
}


class Settings(BaseSettings):
    """Typed application settings, sourced from environment / .env."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- AWS / S3 ---
    aws_access_key_id: str = Field(default="", validation_alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: str = Field(default="", validation_alias="AWS_SECRET_ACCESS_KEY")
    aws_default_region: str = Field(default="us-east-1", validation_alias="AWS_DEFAULT_REGION")
    # Env-driven; placeholder defaults contain no organizational identifier.
    s3_bucket: str = Field(
        default="example-kiro-activity-bucket",
        validation_alias="S3_BUCKET",
    )
    s3_base_prefix: str = Field(
        default="AWSLogs/000000000000/KiroLogs/user_report/us-east-1/",
        validation_alias="S3_BASE_PREFIX",
    )

    # --- Caching (Q2=B SQLite-backed cache; TTLs in seconds) ---
    # Data is pulled from S3 once a day by the scheduler and stored locally, so the
    # snapshot TTL is intentionally long (36h) — it outlives a full day so requests are
    # always served from the local store between daily refreshes (no per-request S3 pulls).
    cache_ttl_seconds: int = Field(default=129600)       # 36h snapshot TTL for metric data
    email_map_ttl_seconds: int = Field(default=129600)   # 36h TTL for email mapping

    # --- Daily refresh schedule (data lands in S3 at 06:00; we pull at 07:00 Baku) ---
    daily_refresh_enabled: bool = Field(default=True, validation_alias="DAILY_REFRESH_ENABLED")
    daily_refresh_hour: int = Field(default=7, validation_alias="DAILY_REFRESH_HOUR")
    daily_refresh_minute: int = Field(default=0, validation_alias="DAILY_REFRESH_MINUTE")
    daily_refresh_timezone: str = Field(
        default="Asia/Baku", validation_alias="DAILY_REFRESH_TIMEZONE"
    )

    # --- NRT ---
    # 0 disables frontend auto-refresh (data only changes on the daily server-side pull).
    refresh_interval_seconds: int = Field(default=0, validation_alias="REFRESH_INTERVAL_SECONDS")

    # --- Auth toggle ---
    # When true, all auth is bypassed (no login required). Use only for trusted/internal deploys.
    auth_disabled: bool = Field(default=False, validation_alias="AUTH_DISABLED")

    # --- AI Adoption weights (configurable, FR-3.3.1) ---
    adoption_weight_total_messages: float = Field(default=DEFAULT_ADOPTION_WEIGHTS["total_messages"])
    adoption_weight_chat_conversations: float = Field(
        default=DEFAULT_ADOPTION_WEIGHTS["chat_conversations"]
    )
    adoption_weight_credits_used: float = Field(default=DEFAULT_ADOPTION_WEIGHTS["credits_used"])
    adoption_weight_active_days: float = Field(default=DEFAULT_ADOPTION_WEIGHTS["active_days"])

    # --- Auth (used by Unit 2; defined here so config is centralized) ---
    jwt_secret: str = Field(default="change-me-in-production", validation_alias="JWT_SECRET")
    jwt_expiry_minutes: int = Field(default=720)
    database_path: str = Field(default="data/kiro_dashboard.db", validation_alias="DATABASE_PATH")

    @property
    def adoption_weights(self) -> dict[str, float]:
        """Return the configured AI Adoption weight map."""
        return {
            "total_messages": self.adoption_weight_total_messages,
            "chat_conversations": self.adoption_weight_chat_conversations,
            "credits_used": self.adoption_weight_credits_used,
            "active_days": self.adoption_weight_active_days,
        }


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
