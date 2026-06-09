# Backend Dockerfile — Kiro NRT Dashboard
# Uses a slim Python 3.12 image. Credentials come from the environment (never baked in).
#
# Build context is the repo root (see docker-compose.yml), and pyproject.toml now lives
# inside backend/ alongside the source. We copy the whole backend/ project into the image
# and run from /app so that `backend.main:app` resolves to /app/backend.

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

# Copy the backend project (pyproject.toml + source). A .dockerignore at the repo root
# keeps the local virtualenv, caches, and test artifacts out of the build context.
COPY backend/ /app/backend/

# Install production + dev dependencies into the system Python. This builds the `backend`
# wheel from backend/pyproject.toml (hatch maps the package into a top-level `backend`).
RUN uv pip install --system --no-cache "/app/backend[dev]"

# Ensure the SQLite data directory exists.
RUN mkdir -p /app/data

# Expose the API port.
EXPOSE 8000

# Run with uvicorn from /app so `backend.main` is importable. Credentials and DB path are
# injected via environment.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
