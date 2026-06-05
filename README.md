# Kiro NRT Dashboard

A near-real-time metrics dashboard for Kiro IDE/CLI usage, built with FastAPI + Next.js.

## Quick Start (Docker Compose)

```bash
# 1. Copy the env template and fill in your AWS credentials + JWT secret.
cp .env.example .env
# Edit .env with your real values.

# 2. Build and start both services.
docker compose up --build

# 3. Open the dashboard.
open http://localhost:3000
```

That's it. The backend starts on port **8000**, the frontend on port **3000**.

---

## What it does

- Reads daily per-user Kiro activity reports from **S3** (IDE + CLI variants).
- Combines IDE and CLI rows per user; labels users by email (discovered automatically).
- Computes per-user and aggregate metrics, including a **configurable AI Adoption score**
  (weighted sum of Total Messages, Chat Conversations, Credits Used, Active Days).
- Presents a **dark, Kiro-styled dashboard** with:
  - **Overview page** — aggregate charts, Top-5 adopters podium (gold/silver/bronze),
    stat cards; blocks are **drag-to-reorder** and **lockable**.
  - **Individual page** — searchable user selector with per-user charts.
  - **Comparison page** — compare any metric across Top N, Bottom N, Top-5+Bottom-5, or all users.
- Auto-refreshes every few minutes (configurable via `REFRESH_INTERVAL_SECONDS`).
- Registration is open; any logged-in user can view all metrics.

---

## Local Development (without Docker)

### Backend

```bash
# From the repo root:
uv pip install --python backend/.venv/Scripts/python -e ".[dev]"

# Set env vars (or use .env file):
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=us-east-1
export JWT_SECRET=dev-secret

# Run the API:
cd backend
.venv/Scripts/uvicorn backend.main:app --reload
# API available at http://localhost:8000
# Interactive docs at http://localhost:8000/docs
```

### Frontend

```bash
cd frontend
npm install
# Copy .env.local (or set inline):
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
# App available at http://localhost:3000
```

### Backend Tests

```bash
cd backend
.venv/Scripts/python -m pytest tests/ -q
# 75 tests (unit + integration, includes Hypothesis PBT)
```

### Frontend Tests

```bash
cd frontend
npm run test
# 7 tests (vitest + fast-check PBT)
```

---

## Configuration

All configuration is via environment variables (`.env` file or Docker env).

| Variable | Default | Description |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | **(required)** | AWS access key for S3 |
| `AWS_SECRET_ACCESS_KEY` | **(required)** | AWS secret key for S3 |
| `AWS_DEFAULT_REGION` | `us-east-1` | AWS region |
| `JWT_SECRET` | `change-me-in-production` | ⚠️ Change for production |
| `JWT_EXPIRY_MINUTES` | `720` | Token validity (12 h) |
| `DATABASE_PATH` | `data/kiro_dashboard.db` | SQLite file path |
| `CACHE_TTL_SECONDS` | `300` | Metric data cache TTL |
| `EMAIL_MAP_TTL_SECONDS` | `86400` | User email map cache TTL |
| `REFRESH_INTERVAL_SECONDS` | `180` | Frontend polling interval |
| `ADOPTION_WEIGHT_TOTAL_MESSAGES` | `0.40` | AI Adoption weight |
| `ADOPTION_WEIGHT_CHAT_CONVERSATIONS` | `0.30` | AI Adoption weight |
| `ADOPTION_WEIGHT_CREDITS_USED` | `0.20` | AI Adoption weight |
| `ADOPTION_WEIGHT_ACTIVE_DAYS` | `0.10` | AI Adoption weight |

---

## Architecture

```
browser (port 3000)          Docker Compose          AWS
─────────────────            ──────────────          ───
Next.js 16 SPA          ←─→  FastAPI + SQLite  ←─→  S3 bucket
TanStack Query                uvicorn               (kiro CSVs)
dnd-kit, Recharts             bcrypt + JWT
```

**S3 bucket**: `example-kiro-activity-bucket`  
**Prefix**: `AWSLogs/000000000000/KiroLogs/user_report/us-east-1/{year}/{month}/{day}/00/`

---

## Project Structure

```
kiro-dashboard/
├── backend/           FastAPI backend (Units 1 & 2)
│   ├── core/          Config, ingestion (S3+CSV parser), metrics engine
│   ├── models/        Pydantic models
│   ├── repositories/  SQLite (users + cache)
│   ├── services/      Auth, Metrics, UserDirectory
│   ├── api/           FastAPI routers
│   ├── tests/         75 tests (Hypothesis PBT)
│   └── Dockerfile
├── frontend/          Next.js 16 frontend (Unit 3)
│   ├── app/           Pages (dashboard, individual, comparison, auth)
│   ├── components/    UI components (charts, podium, drag grid, sidebar)
│   ├── lib/           API client, auth context, TanStack queries, layout
│   ├── styles/        Design tokens (Kiro dark theme)
│   ├── tests/         7 tests (fast-check PBT)
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── .env               (git-ignored — add your real credentials here)
└── pyproject.toml     Backend Python package definition
```
