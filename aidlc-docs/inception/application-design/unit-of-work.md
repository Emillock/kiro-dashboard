# Units of Work — Kiro NRT Dashboard

**Decomposition approach**: 4 units (Q1=C) · **Repo layout**: `backend/` + `frontend/` + root
infra (Q2=A) · **Build order**: Unit 1 → 2 → 3 → 4 (Q3=A, data-first).

The application is a monolith-per-tier (single repo, two runtime processes + shared infra).
Units are logical Code Generation groupings, not independently deployable microservices.

---

## Unit 1 — Data & Metrics (Backend Core Logic)

**Build order**: First — all other units consume its output.

**Purpose**: Everything that touches S3: raw ingestion, CSV parsing, email-map, and all metric
computation (aggregation, AI Adoption score, ranking/selection). The inner engine with zero HTTP
concerns — pure Python logic, testable in isolation.

**Components covered**: BE-1 Config (partial), BE-3 S3Client, BE-4 CSV Parser, BE-5 EmailMapping,
BE-6 Metrics Engine, BE-7 AI Adoption Calculator, BE-8 Ranking/Selection.

**Directory structure**:
```
backend/
  core/
    config.py              Settings (partial — all config keys)
    ingestion/
      s3_client.py         S3 list/fetch helpers
      parser.py            Dynamic CSV parser → UsageRecord
      email_map.py         UserId → email full-bucket scan + cache
    metrics/
      aggregator.py        combine_records, compute_user_metrics, compute_aggregate_metrics
      adoption.py          adoption_score, apply_scores
      selection.py         select_users, top_adopters
  models/
    metrics.py             UsageRecord, UserMetrics, AggregateMetrics, UserSummary, TimeSeries
  tests/
    unit/
      test_parser.py       Example-based + PBT (Hypothesis): dynamic columns, missing fields
      test_aggregator.py   Example-based + PBT: IDE+CLI combine, active-day counting
      test_adoption.py     Example-based + PBT: weighted sum invariants, configurable weights
      test_selection.py    Example-based + PBT: top/bottom-N monotonicity, cap-at-20
      test_email_map.py    Example-based: label resolution
  pyproject.toml           (shared with Unit 2; created here)
  requirements.txt         boto3, pydantic, hypothesis, ...
```

**PBT properties (PBT-01 — identified here per plan)**:
- `parser.py` — round-trip (parse → re-serialize stable cols), invariant (unknown cols ignored), dynamic-col discovery
- `aggregator.py` — invariant (combine IDE+CLI ≥ either alone), active-day count monotonicity
- `adoption.py` — invariant (score ≥ 0 for non-negative inputs), monotonicity (higher raw metrics → higher score with positive weights)
- `selection.py` — invariant (top_n result size ≤ n ≤ 20), ordering guarantee, top5+bottom5 no-overlap

**Deliverables**: All `core/` logic modules + `models/metrics.py` + full test suite (example-based + PBT).

---

## Unit 2 — Auth & API (Backend HTTP Layer)

**Build order**: Second — depends on Unit 1 for `MetricsService`; adds SQLite cache + user store + HTTP.

**Purpose**: Authentication (register/login/JWT), the SQLite-backed cache, user/cache repositories,
the orchestrating services, and all FastAPI routers that expose the REST API.

**Components covered**: BE-2 Auth, BE-9 Cache, BE-10 Repositories, AuthService, MetricsService,
UserDirectoryService, BE-11 API Routers, BE-12 Models/Schemas (auth + response), Docker SQLite DB.

**Directory structure**:
```
backend/
  core/
    auth/
      security.py          bcrypt, JWT helpers, FastAPI dependency get_current_user
    cache/
      cache_service.py     make_key, cache_get, cache_set, cache_invalidate
  repositories/
    user_repo.py           UserRepository (SQLite via sqlite3/aiosqlite)
    cache_repo.py          CacheRepository (cache table)
    db.py                  connection + migrations (CREATE TABLE IF NOT EXISTS)
  services/
    auth_service.py        AuthService
    metrics_service.py     MetricsService (orchestrates Unit 1 + cache)
    user_dir_service.py    UserDirectoryService
  api/
    auth_router.py         POST /register, /login; GET /me
    metrics_router.py      GET /aggregate, /users, /users/{id}, /top-adopters, /compare
    config_router.py       GET /config/refresh-interval
    health_router.py       GET /health
    deps.py                Shared FastAPI dependencies (get_current_user, get_db, get_settings)
  models/
    user.py                UserRecord, UserCreate, UserOut, TokenData
    auth.py                LoginRequest, TokenResponse
  main.py                  FastAPI app factory, router registration, CORS
  tests/
    unit/
      test_auth_service.py
      test_metrics_service.py  (mocked S3/cache)
      test_cache.py
    integration/
      test_auth_api.py     register, login, /me (TestClient + in-memory SQLite)
      test_metrics_api.py  aggregate, users, compare (TestClient + mocked S3)
```

**PBT properties**: `cache_service` idempotency (set then get returns same value), `metrics_service`
cache-key uniqueness invariant.

**Deliverables**: Full auth + API stack runnable as `uvicorn backend.main:app`; integration tests
passing with TestClient.

---

## Unit 3 — Frontend (Next.js App)

**Build order**: Third — consumes the Unit 2 REST API; can be developed with mocked API data.

**Purpose**: The entire Next.js/React/TypeScript application: auth pages, app shell, main dashboard
(drag/lock/localStorage, podium, charts), individual page, comparison page, design tokens.

**Components covered**: FE-1 through FE-9 (all frontend components).

**Directory structure**:
```
frontend/
  app/
    (auth)/
      login/page.tsx
      register/page.tsx
    (dashboard)/
      layout.tsx             App shell (sidebar + auth guard)
      page.tsx               Main dashboard
      individual/page.tsx
      comparison/page.tsx
  components/
    layout/
      Sidebar.tsx
      AuthGuard.tsx
    dashboard/
      DashboardGrid.tsx      dnd-kit drag/drop + lock
      DashboardBlock.tsx
      TopAdoptersPodium.tsx  rank 1/2/3 → gold/silver/bronze border
      StatCards.tsx
      charts/
        MessagesOverTime.tsx
        ModelDistribution.tsx
        CreditsChart.tsx
        ActiveUsersChart.tsx
    individual/
      UserSearchSelect.tsx
      UserMetricCharts.tsx
    comparison/
      MetricSelect.tsx
      UserSetSelect.tsx
      ComparisonChart.tsx
    common/
      LoadingSpinner.tsx
      ErrorBoundary.tsx
  lib/
    api.ts                   Typed fetch wrapper + JWT attach
    queries.ts               TanStack Query hooks + polling
    layout.ts                localStorage block state read/write
    auth-context.tsx         JWT context + provider
  styles/
    theme.ts                 Kiro dark palette design tokens
    globals.css
  tests/
    unit/
      layout.test.ts         Example-based + PBT (fast-check): localStorage round-trip
      adoption-display.test.ts
    component/
      TopAdoptersPodium.test.tsx   gold/silver/bronze border logic
      DashboardGrid.test.tsx       drag/lock interactions
      ComparisonChart.test.tsx
  package.json               next, react, typescript, recharts, @tanstack/react-query, dnd-kit, fast-check
  tsconfig.json
  next.config.js
```

**PBT properties**: `layout.ts` round-trip (save → load = identity), block-order permutation invariant.

**Deliverables**: Runnable `npm run dev`; all pages functional against a live or mocked backend.

---

## Unit 4 — Infrastructure (Docker Compose + Config)

**Build order**: Fourth — wraps and wires Units 1–3 for one-command deployment.

**Purpose**: Docker Compose setup, Dockerfiles, environment variable passing, SQLite volume,
and project-level documentation.

**Components covered**: Deployment topology (see `component-dependency.md`), `.env` contract.

**Directory structure**:
```
(repo root)/
  docker-compose.yml         frontend + backend services; SQLite named volume; env_file: .env
  backend/
    Dockerfile               python:3.12-slim, install deps, uvicorn entrypoint
  frontend/
    Dockerfile               node:22-alpine, build Next.js, serve
  .env.example               Template with all required keys (no real values)
  .env                       Git-ignored; real credentials
  .gitignore                 (already updated)
  README.md                  Setup + usage instructions
```

**Deliverables**: `docker compose up` starts both services with `.env` credentials; health check
passes; frontend can call backend API.

---

## Code Structure Summary (Q2=A)

```
kiro-dashboard/            ← repo root
├── backend/               ← Unit 1 + 2
│   ├── core/
│   │   ├── config.py
│   │   ├── ingestion/
│   │   ├── metrics/
│   │   └── auth/
│   ├── repositories/
│   ├── services/
│   ├── api/
│   ├── models/
│   ├── tests/
│   ├── main.py
│   └── pyproject.toml
├── frontend/              ← Unit 3
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── styles/
│   ├── tests/
│   └── package.json
├── docker-compose.yml     ← Unit 4
├── .env.example
├── .env                   (git-ignored)
├── .gitignore
└── README.md
```
