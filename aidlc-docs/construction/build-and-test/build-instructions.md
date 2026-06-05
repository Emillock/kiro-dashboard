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
- `JWT_SECRET` — change from default before production

---

## Local Build

### Backend

```bash
# From repo root — install the backend package + dev deps into the backend venv.
uv pip install --python backend/.venv/Scripts/python -e ".[dev]"

# Windows alternative (run from backend/ dir):
cd backend
uv venv .venv   # only if .venv doesn't exist yet
uv pip install -e ".[dev]"
```

**Expected output**: `Installed N packages in Xs` — no errors.

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
| `ModuleNotFoundError: No module named 'backend'` | Editable install not pointing to repo root | Run `uv pip install` from repo root, not from `backend/` |
| `email-validator not installed` | `pydantic[email]` not in deps | `uv pip install "pydantic[email]"` |
| Next.js build fails with TS errors | Type mismatch | Run `npm run build` to see full error; fix the indicated file |
| Docker build fails on `uv` COPY | Docker version < BuildKit | Use `docker buildx build` or enable BuildKit |
