"""FastAPI application factory.

Creates the app, configures CORS, initialises the SQLite DB on startup, and registers all
routers under the ``/api/v1`` prefix.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.auth_router import router as auth_router
from backend.api.config_router import router as config_router
from backend.api.health_router import router as health_router
from backend.api.metrics_router import router as metrics_router
from backend.repositories.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise the SQLite schema on startup (idempotent)."""
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Kiro NRT Dashboard API",
        version="1.0.0",
        description="Near-realtime Kiro usage metrics dashboard backend.",
        lifespan=lifespan,
    )

    # CORS — allow the Next.js dev server and Docker frontend.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://frontend:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api_prefix = "/api/v1"
    app.include_router(health_router, prefix=api_prefix)
    app.include_router(auth_router, prefix=api_prefix)
    app.include_router(metrics_router, prefix=api_prefix)
    app.include_router(config_router, prefix=api_prefix)

    return app


# Uvicorn entry-point: uvicorn backend.main:app
app = create_app()
