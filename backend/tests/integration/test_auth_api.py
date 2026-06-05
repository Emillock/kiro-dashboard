"""Integration tests for the auth endpoints (US-AUTH-01..04).

Uses FastAPI TestClient with a temp-file SQLite DB overridden via env variable.
"""
from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test.db")
    monkeypatch.setenv("DATABASE_PATH", db_path)

    # Clear the settings cache so the new DATABASE_PATH is picked up.
    from backend.core.config import get_settings
    get_settings.cache_clear()

    from backend.main import create_app
    # create_app's lifespan calls init_db() which is idempotent — safe to run.
    with TestClient(create_app()) as c:
        yield c

    get_settings.cache_clear()


def test_register_success(client):
    r = client.post("/api/v1/auth/register", json={
        "email": "user20@example.com",
        "username": "testuser",
        "password": "Passw0rd!",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["email"] == "user20@example.com"
    assert "password" not in data
    assert "password_hash" not in data


def test_register_duplicate_email(client):
    # Register once with valid data.
    client.post("/api/v1/auth/register", json={
        "email": "user9@example.com", "username": "userone", "password": "Pass1234!",
    })
    # Same email, different username → 409.
    r = client.post("/api/v1/auth/register", json={
        "email": "user9@example.com", "username": "usertwo", "password": "Pass1234!",
    })
    assert r.status_code == 409


def test_register_duplicate_username(client):
    client.post("/api/v1/auth/register", json={
        "email": "aauser1@example.com", "username": "sameuser", "password": "Pass1234!",
    })
    # Different email, same username → 409.
    r = client.post("/api/v1/auth/register", json={
        "email": "bbuser5@example.com", "username": "sameuser", "password": "Pass1234!",
    })
    assert r.status_code == 409


def test_register_invalid_email(client):
    r = client.post("/api/v1/auth/register", json={
        "email": "not-an-email",
        "username": "user2",
        "password": "Passw0rd!",
    })
    assert r.status_code == 422


def test_register_short_password(client):
    r = client.post("/api/v1/auth/register", json={
        "email": "u@a.com", "username": "usr3", "password": "short",
    })
    assert r.status_code == 422


def test_login_success(client):
    client.post("/api/v1/auth/register", json={
        "email": "user13@example.com", "username": "loginu", "password": "Passw0rd!",
    })
    r = client.post("/api/v1/auth/login", json={
        "email": "user13@example.com", "password": "Passw0rd!",
    })
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_login_wrong_password(client):
    client.post("/api/v1/auth/register", json={
        "email": "p@a.com", "username": "pu", "password": "Correct1!",
    })
    r = client.post("/api/v1/auth/login", json={"email": "p@a.com", "password": "Wrong1!!"})
    assert r.status_code == 401


def test_me_requires_auth(client):
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401


def test_me_with_valid_token(client):
    client.post("/api/v1/auth/register", json={
        "email": "user14@example.com", "username": "meu", "password": "Passw0rd!",
    })
    token = client.post("/api/v1/auth/login", json={
        "email": "user14@example.com", "password": "Passw0rd!",
    }).json()["access_token"]
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "user14@example.com"


def test_health_no_auth(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
