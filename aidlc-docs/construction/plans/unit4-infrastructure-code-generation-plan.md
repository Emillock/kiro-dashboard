# Unit 4 — Infrastructure — Code Generation Plan

**Unit**: Infrastructure (Docker Compose + config) · **Build order**: 4th (last)
**Stories**: US-NFR-03 (Docker Compose deployment), US-NFR-04 (configurable weights/interval)

All decisions locked: backend = FastAPI (port 8000), frontend = Next.js (port 3000),
SQLite on a named Docker volume, credentials from `.env`.

## Steps

- [x] **Step 1** — `backend/Dockerfile`
- [x] **Step 2** — `frontend/Dockerfile`
- [x] **Step 3** — `docker-compose.yml` (root)
- [x] **Step 4** — `.env.example` (root)
- [x] **Step 5** — `README.md` (root)
- [x] **Step 6** — Documentation summary
- [x] **Step 7** — Verify (docker compose config --quiet)
