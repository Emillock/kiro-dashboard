# Application Design — Kiro NRT Dashboard (Consolidated Overview)

This document summarises all Application Design artifacts. See individual files for full detail.

---

## System Overview

A full-stack, near-real-time, Kiro-styled metrics dashboard:

```
Browser                Docker Compose                   AWS
-------                --------------                   ---
Next.js SPA  <--HTTP-> FastAPI + SQLite  <--boto3/S3--> S3 bucket
                        (port 8000)                     (kiro CSVs)
(port 3000)
```

- **Backend**: Python 3.12 / FastAPI — layered architecture (api → services → core → repos → models).
- **Frontend**: Next.js 14 / React / TypeScript — TanStack Query for data + polling, Recharts for charts, localStorage for layout state.
- **Database**: SQLite (single file, Docker volume) — app users, session-less JWT auth, SQLite-backed S3 result cache.
- **S3**: daily per-user CSV reports, evolving schema (31 header variants observed), ~83 files / ~93 KB total to date.

---

## Backend Architecture (Layered)

```
api/
  auth_router.py       POST /auth/register · login · GET /auth/me
  metrics_router.py    GET /metrics/aggregate · users · users/{id} · top-adopters · compare
  config_router.py     GET /config/refresh-interval
  health_router.py     GET /health

services/
  auth_service.py      AuthService
  metrics_service.py   MetricsService  ← main orchestrator
  user_dir_service.py  UserDirectoryService

core/
  config.py            Settings (Pydantic BaseSettings)
  auth/
    security.py        bcrypt, JWT helpers, FastAPI dependency
  ingestion/
    s3_client.py       S3 list/fetch (boto3)
    parser.py          Dynamic CSV parser → UsageRecord
    email_map.py       UserId → email scan + cache
  metrics/
    aggregator.py      Combine IDE+CLI, per-user + aggregate computation
    adoption.py        Configurable weighted sum
    selection.py       Top/Bottom-N, top5_bottom5, all

repositories/
  user_repo.py         UserRepository (SQLite)
  cache_repo.py        CacheRepository (SQLite cache table)

models/
  user.py              UserRecord, UserCreate, UserOut, TokenData
  metrics.py           UsageRecord, UserMetrics, AggregateMetrics, UserSummary
```

Key decisions:
- Q1=A layered, Q2=B SQLite cache table (survives restarts; same DB as user store)
- Active day = `Total_Messages > 0 OR Chat_Conversations > 0` (Q3=B)
- JWT secret + AWS credentials from `.env` only

---

## Frontend Architecture

```
app/
  (auth)/
    register/page.tsx
    login/page.tsx
  (dashboard)/
    layout.tsx           App shell + sidebar (FE-1)
    page.tsx             Main dashboard (FE-5)
    individual/page.tsx  Individual metrics (FE-6)
    comparison/page.tsx  Comparison page (FE-7)

components/
  layout/
    Sidebar.tsx          Navigation links; active highlight
  dashboard/
    DashboardGrid.tsx    Drag-to-reorder + lock (dnd-kit)
    DashboardBlock.tsx   Block wrapper with lock icon
    TopAdoptersPodium.tsx  Top-5; gold/silver/bronze borders
    StatCards.tsx        Summary metric cards
    Charts/              MessagesOverTime, ModelDistribution, CreditsChart, ActiveUsersChart (Recharts)
  individual/
    UserSearchSelect.tsx  Searchable selector (email or shortened userId)
    UserMetricCharts.tsx
  comparison/
    MetricSelect.tsx      Dropdown: 5 metric options (Q6=A)
    UserSetSelect.tsx     Top-N / Bottom-N / Top5+Bottom5 / All; N capped 20
    ComparisonChart.tsx   Bar chart (Recharts)
  common/
    AuthGuard.tsx         Redirect to login if no token

lib/
  api.ts                  Typed fetch wrapper; attaches JWT
  queries.ts              TanStack Query hooks; polling interval from /config/refresh-interval
  layout.ts               localStorage read/write for block state (Q4=C)
  auth-context.tsx        JWT storage, current-user context

styles/
  theme.ts                Design tokens — Kiro dark palette, typography, accent colors
```

---

## REST API Contract Summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/register` | ❌ | Register new account |
| POST | `/api/v1/auth/login` | ❌ | Login, get JWT |
| GET | `/api/v1/auth/me` | ✅ | Current user |
| GET | `/api/v1/metrics/aggregate` | ✅ | All-users aggregate metrics |
| GET | `/api/v1/metrics/users` | ✅ | User list (search selector data) |
| GET | `/api/v1/metrics/users/{id}` | ✅ | One user's full metrics |
| GET | `/api/v1/metrics/top-adopters` | ✅ | Top-K by AI Adoption (podium) |
| GET | `/api/v1/metrics/compare` | ✅ | Comparison user set |
| GET | `/api/v1/config/refresh-interval` | ✅ | Polling interval config |
| GET | `/api/v1/health` | ❌ | Health check |

Full request/response shapes: see `api-contract.md`.

---

## Key Constraints & Decisions

| Decision | Choice |
|---|---|
| Backend structure | Layered (Q1=A) |
| Cache storage | SQLite-backed table (Q2=B) |
| Active-day definition | messages>0 or convos>0 (Q3=B) |
| Layout persistence | Browser localStorage (Q4=C) — no backend layout endpoint |
| Frontend data/polling | TanStack Query (Q5=A) |
| Comparison metrics | AI Adoption, Total Messages, Chat Convos, Credits, Active Days (Q6=A) |
| PBT frameworks | Hypothesis (backend), fast-check (frontend) |
| Docker Compose | frontend + backend; `.env` credentials as env vars; SQLite volume |

---

## Traceability (design → requirements)

| Artifact | Covers |
|---|---|
| BE-2 + FE-2 Auth + AuthService | FR-1.1–1.7 |
| BE-3/4/5/6/7 + MetricsService | FR-2.1–2.6, FR-3.1–3.4 |
| FE-5 DashboardGrid + TopAdopters | FR-4.1–4.4 |
| FE-6 Individual page | FR-5.1–5.3 |
| FE-7 Comparison page | FR-6.1–6.4 |
| FE-1 Sidebar + route guard | FR-7.1–7.2 |
| FE-8 Theme | NFR-1.1–1.2 |
| TanStack Query polling + cache TTL | NFR-2.1–2.2 |
| Parser graceful degradation | NFR-3.1–3.2 |
| Settings + env | NFR-4.1–4.2 |
| Docker Compose | NFR-5.1–5.2 |
| Hypothesis + fast-check | NFR-6.1–6.3 |
