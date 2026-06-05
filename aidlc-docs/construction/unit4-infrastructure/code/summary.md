# Unit 4 — Infrastructure — Code Generation Summary

**Status**: Complete · **Verification**: `docker compose config --quiet` passes.

## Files Created

| File | Purpose | Story |
|---|---|---|
| `backend/Dockerfile` | Python 3.12-slim; uv install; uvicorn entrypoint | US-NFR-03 |
| `frontend/Dockerfile` | Multi-stage Node 22 Alpine; Next.js standalone build | US-NFR-03 |
| `frontend/next.config.ts` | Added `output: "standalone"` for Docker compatibility | US-NFR-03 |
| `docker-compose.yml` | Both services; named SQLite volume; healthcheck; env_file | US-NFR-03 |
| `.env.example` | Template with all required + optional config keys | US-NFR-04 |
| `README.md` | Setup, architecture, local dev, config reference | — |

## Key Notes

- AWS credentials and JWT secret come **only from `.env`** (env_file in Compose); never baked into images.
- The SQLite DB lives on a named Docker volume `kiro_dashboard_db` — survives `docker compose down`.
- The frontend container is built with `NEXT_PUBLIC_API_URL=http://backend:8000` pointing at the Compose service name.
- Backend healthcheck polls `/api/v1/health`; frontend `depends_on` waits for it.
- `docker compose down -v` removes both containers **and** the data volume.
- AI Adoption weights and refresh interval are all configurable via env (US-NFR-04).
