# Backend Dockerfile — Kiro NRT Dashboard
# Uses a slim Python 3.12 image. Credentials come from the environment (never baked in).

FROM python:3.12-slim AS base

WORKDIR /app

# ── Corporate proxy support ───────────────────────────────────────────────────
# Servers without direct internet egress reach PyPI (build) and AWS S3 (runtime)
# through an HTTP proxy. Values are passed as build args (from docker-compose /.env)
# and also persisted as ENV so boto3 can use the proxy at runtime. Empty by default,
# so builds on machines with direct internet are unaffected.
ARG HTTP_PROXY=
ARG HTTPS_PROXY=
ARG NO_PROXY=localhost,127.0.0.1
ENV http_proxy=${HTTP_PROXY} \
    https_proxy=${HTTPS_PROXY} \
    HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY} \
    no_proxy=${NO_PROXY} \
    NO_PROXY=${NO_PROXY}

# Install uv for fast dependency management.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency definitions first for layer caching.
COPY pyproject.toml /app/pyproject.toml
# Create a stub backend package so the editable install resolves.
RUN mkdir -p backend && touch backend/__init__.py

# Install production dependencies (no dev extras) into the system Python.
RUN uv pip install --system --no-cache ".[dev]"

# Copy full source code.
COPY backend/ /app/backend/

# Ensure the SQLite data directory exists.
RUN mkdir -p /app/data

# Expose the API port.
EXPOSE 8000

# Run with uvicorn. Credentials and DB path are injected via environment.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
