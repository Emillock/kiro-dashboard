# Build Instructions — Kiro NRT Dashboard

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.12+ | Backend |
| uv | 0.8+ | Python env manager |
| Node.js | 22+ | Frontend |
| npm | 10+ | Frontend deps |
| Docker | 24+ | Container deployment |
| Docker Compose | 2.20+ | Multi-service orchestration |

**Environment Variables** (copy `.env.example` → `.env`):
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` — S3 access
- `S3_BUCKET`, `S3_BASE_PREFIX` — location of the Kiro activity-report CSVs
- `JWT_SECRET` — change from default before production (or set `AUTH_DISABLED=true` to skip login)

---

## Local Build

### Backend

`pyproject.toml` lives in `backend/` alongside the source; the code is imported as the
top-level `backend` package.

```bash
# From repo root — install the backend package + dev deps into the backend venv.
uv pip install --python backend/.venv/Scripts/python "backend[dev]"
```

**Expected output**: `Installed N packages in Xs` — no errors.

> Run the API and tests from the repo root so the `backend.*` import path resolves
> to the live `./backend` source (e.g. `python -m uvicorn backend.main:app --reload`,
> `python -m pytest backend/tests`).

### Frontend

```bash
cd frontend
npm install      # install all deps (including vitest, fast-check)
npm run build    # TypeScript check + Next.js production build
```

**Expected output**: `✓ Compiled successfully`, `✓ Finished TypeScript`, all routes listed.

---

## Docker Build (production)

```bash
# From repo root:
docker compose build

# Or build a single service:
docker compose build backend
docker compose build frontend
```

**Expected output**: Both images built successfully, no errors.

**Artifacts**:
- Docker image `kiro-backend` (Python 3.12-slim + FastAPI)
- Docker image `kiro-frontend` (Node 22 Alpine + Next.js standalone)

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `ModuleNotFoundError: No module named 'backend'` | Running uvicorn/pytest from inside `backend/` | Run from the repo root so the live `./backend` package resolves |
| `email-validator not installed` | `pydantic[email]` not in deps | `uv pip install "pydantic[email]"` |
| Next.js build fails with TS errors | Type mismatch | Run `npm run build` to see full error; fix the indicated file |
| Docker build fails on `uv` COPY | Docker version < BuildKit | Use `docker buildx build` or enable BuildKit |
