"""Integration tests for the metrics endpoints.

S3 is mocked via monkeypatching S3IngestionClient so no real AWS calls are made.
"""
from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

SAMPLE_CSV = (
    "Date,UserId,Client_Type,Chat_Conversations,Credits_Used,Overage_Cap,"
    "Overage_Credits_Used,Overage_Enabled,ProfileId,Subscription_Tier,Total_Messages,"
    "auto_messages,User_Email\n"
    f"{date.today().isoformat()},user-1,KIRO_IDE,5,10.0,10000.0,0.0,false,arn,PRO,50,30,user3@example.com\n"
    f"{date.today().isoformat()},user-2,KIRO_IDE,3,6.0,10000.0,0.0,false,arn,PRO,30,20,bouser5@example.com\n"
)


@pytest.fixture
def authed_client(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test.db")
    monkeypatch.setenv("DATABASE_PATH", db_path)

    from backend.core.config import get_settings
    get_settings.cache_clear()

    from backend.main import create_app
    with TestClient(create_app()) as c:
        c.post("/api/v1/auth/register", json={
            "email": "user21@example.com", "username": "viewer", "password": "Passw0rd!",
        })
        token = c.post("/api/v1/auth/login", json={
            "email": "user21@example.com", "password": "Passw0rd!",
        }).json()["access_token"]
        c.headers = {"Authorization": f"Bearer {token}"}
        yield c

    get_settings.cache_clear()


def _mock_s3(keys=None):
    """Return a mock S3IngestionClient that returns SAMPLE_CSV for any key."""
    keys = keys or [f"prefix/2026/06/01/00/KIRO_IDE_file.csv"]
    mock = MagicMock()
    mock.list_report_keys.return_value = keys
    mock.list_all_keys.return_value = keys
    mock.fetch_object_text.return_value = SAMPLE_CSV
    return mock


@patch("backend.services.metrics_service.S3IngestionClient")
def test_aggregate_returns_data(MockS3, authed_client):
    MockS3.return_value = _mock_s3()
    r = authed_client.get("/api/v1/metrics/aggregate?range=month")
    assert r.status_code == 200
    data = r.json()
    assert data["total_messages"] == 80   # 50 + 30
    assert data["active_user_count"] == 2


@patch("backend.services.metrics_service.S3IngestionClient")
def test_list_users(MockS3, authed_client):
    MockS3.return_value = _mock_s3()
    r = authed_client.get("/api/v1/metrics/users?range=month")
    assert r.status_code == 200
    assert len(r.json()["users"]) == 2


@patch("backend.services.metrics_service.S3IngestionClient")
def test_list_users_search(MockS3, authed_client):
    MockS3.return_value = _mock_s3()
    r = authed_client.get("/api/v1/metrics/users?range=month&q=alice")
    assert r.status_code == 200
    users = r.json()["users"]
    assert len(users) == 1
    assert "alice" in users[0]["label"]


@patch("backend.services.metrics_service.S3IngestionClient")
def test_top_adopters(MockS3, authed_client):
    MockS3.return_value = _mock_s3()
    r = authed_client.get("/api/v1/metrics/top-adopters?range=month&k=2")
    assert r.status_code == 200
    adopters = r.json()["top_adopters"]
    assert adopters[0]["rank"] == 1
    # user-1 has higher total_messages → higher adoption
    assert adopters[0]["adoption_score"] > adopters[1]["adoption_score"]


@patch("backend.services.metrics_service.S3IngestionClient")
def test_compare_top_n(MockS3, authed_client):
    MockS3.return_value = _mock_s3()
    r = authed_client.get("/api/v1/metrics/compare?metric=total_messages&mode=top_n&n=1")
    assert r.status_code == 200
    users = r.json()["users"]
    assert len(users) == 1
    assert users[0]["value"] == 50


@patch("backend.services.metrics_service.S3IngestionClient")
def test_user_detail_not_found(MockS3, authed_client):
    MockS3.return_value = _mock_s3()
    r = authed_client.get("/api/v1/metrics/users/nonexistent-user-id?range=month")
    assert r.status_code == 404


@patch("backend.services.metrics_service.S3IngestionClient")
def test_refresh_interval_endpoint(MockS3, authed_client):
    r = authed_client.get("/api/v1/config/refresh-interval")
    assert r.status_code == 200
    assert "refresh_interval_seconds" in r.json()


def test_metrics_requires_auth(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "t.db"))
    from backend.core.config import get_settings
    get_settings.cache_clear()
    from backend.main import create_app
    with TestClient(create_app()) as c:
        r = c.get("/api/v1/metrics/aggregate")
    assert r.status_code == 401
    get_settings.cache_clear()
