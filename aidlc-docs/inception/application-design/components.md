# Components — Kiro NRT Dashboard

High-level component identification for backend (FastAPI, layered per Q1=A) and frontend
(Next.js/React). Detailed business rules are intentionally deferred (Functional Design was skipped;
rules will be finalized in the Code Generation plan).

---

## Backend Components (Python / FastAPI)

Layering: **api (routers) → services (orchestration) → core (domain logic) → repositories (SQLite)
→ models (schemas)**, with cross-cutting **config** and **cache**.

### BE-1. Config (`core/config`)
- **Purpose**: Centralize configuration and secrets loading.
- **Responsibilities**:
  - Load AWS credentials + region from environment/`.env` (never hard-coded).
  - Hold tunables: S3 bucket/prefix, cache TTLs, AI-Adoption weights, refresh interval, JWT secret/expiry.
  - Expose typed settings to other components.
- **Interface**: `Settings` object (singleton/dependency).

### BE-2. Auth (`core/auth` + `api/auth_router`)
- **Purpose**: Registration, login, JWT issuance/validation.
- **Responsibilities**:
  - Hash/verify passwords (bcrypt).
  - Issue JWT access tokens; validate them on protected routes.
  - Enforce unique email/username and input validation.
- **Interface**: register, login, current-user dependency.

### BE-3. S3 Ingestion Client (`core/ingestion/s3_client`)
- **Purpose**: List and download report CSVs from S3 for a date range.
- **Responsibilities**:
  - Build day-partitioned prefixes; list IDE + CLI objects; tolerate missing days/files.
  - Stream object bodies to the parser.
- **Interface**: list keys for range, fetch object bytes.

### BE-4. CSV Parser (`core/ingestion/parser`)
- **Purpose**: Parse the evolving CSV schema into normalized records.
- **Responsibilities**:
  - Read stable core columns; discover `*_messages` model columns dynamically.
  - Coerce types; default missing fields to zero; ignore unknown columns safely.
  - Emit a normalized per-row record (with a `model_messages` map).
- **Interface**: parse CSV text → list of normalized records.

### BE-5. Email Mapping (`core/ingestion/email_map`)
- **Purpose**: Build and serve the UserId → email mapping.
- **Responsibilities**:
  - Scan files containing `User_Email` across the bucket; record one email per UserId.
  - Provide label resolution (email if known, else shortened UserId).
  - Cache the mapping with a longer TTL than metric data.
- **Interface**: get mapping, resolve label for a UserId.

### BE-6. Metrics Engine (`core/metrics/aggregator`)
- **Purpose**: Compute per-user and aggregate metrics for a period.
- **Responsibilities**:
  - Combine IDE + CLI rows per user (sum counts).
  - Compute per-user totals: messages, conversations, credits, active days, per-model breakdown, tier.
  - Compute aggregate totals/averages and model-usage distribution across all users.
  - Active day = `Total_Messages > 0 OR Chat_Conversations > 0` (Q3=B).
- **Interface**: compute per-user metrics, compute aggregate metrics.

### BE-7. AI Adoption Calculator (`core/metrics/adoption`)
- **Purpose**: Compute the configurable absolute weighted AI Adoption score.
- **Responsibilities**:
  - Apply weights (default Total_Messages 0.40, Chat_Conversations 0.30, Credits_Used 0.20,
    Active_Days 0.10) as an absolute weighted sum; missing inputs contribute 0.
  - Read weights from Config (changeable without code edits).
- **Interface**: score(user_metrics) → float; rank users.

### BE-8. Ranking/Selection (`core/metrics/selection`)
- **Purpose**: Top/Bottom-N and composite selections for podium and comparison.
- **Responsibilities**:
  - Top-N, Bottom-N (N capped at 20), Top-5+Bottom-5, all — for a chosen metric.
  - Produce the Top-5-by-AI-Adoption list for the main page podium.
- **Interface**: select(metric, mode, n) → ordered users.

### BE-9. Cache (`core/cache` + SQLite cache table)
- **Purpose**: Short-TTL cache of S3-derived data (Q2=B, SQLite-backed).
- **Responsibilities**:
  - Store serialized computed results keyed by (range, query) with timestamp.
  - Serve fresh entries within TTL; recompute on expiry (drives NRT polling efficiency).
- **Interface**: get(key), set(key, value, ttl), invalidate.

### BE-10. Repositories (`repositories`)
- **Purpose**: SQLite persistence for app data.
- **Responsibilities**:
  - `UserRepository`: CRUD for registered accounts.
  - `CacheRepository`: read/write the cache table.
- **Interface**: user lookup/create; cache read/write.

### BE-11. API Routers (`api`)
- **Purpose**: Expose REST endpoints; depend on services; enforce auth.
- **Responsibilities**: auth routes, metrics routes (aggregate/per-user), users list, health.
- **Interface**: See `api-contract.md`.

### BE-12. Models/Schemas (`models`)
- **Purpose**: Pydantic models for requests/responses and internal records.
- **Responsibilities**: validation, serialization, typed contracts.

---

## Backend Services (orchestration layer — see services.md)
- **AuthService**, **MetricsService**, **UserDirectoryService** orchestrate the core components and
  the cache for the routers.

---

## Frontend Components (Next.js / React / TypeScript)

### FE-1. App Shell & Sidebar (`components/layout`)
- **Purpose**: Authenticated layout with persistent sidebar navigation.
- **Responsibilities**: Sidebar links (Main, Individual, Comparison), active highlight, route guard.

### FE-2. Auth Pages (`app/(auth)`)
- **Purpose**: Register and Login pages + auth context.
- **Responsibilities**: forms with validation, call auth API, store JWT, redirect, logout.

### FE-3. API Client (`lib/api`)
- **Purpose**: Typed wrapper over the REST API.
- **Responsibilities**: attach JWT, handle errors, expose typed functions; base for query hooks.

### FE-4. Query/State Layer (`lib/queries`)
- **Purpose**: TanStack Query hooks (Q5=A) for data fetching + polling.
- **Responsibilities**: query keys, refetch intervals (auto-refresh), caching, loading/error states.

### FE-5. Main Dashboard (`app/dashboard`)
- **Purpose**: Overview page with modular blocks.
- **Sub-components**:
  - **TimeRangeSelector** (week/month, default month).
  - **DashboardGrid** — drag-to-reorder + lock per block; layout persisted to **localStorage** (Q4=C).
  - **StatCards** + **Charts** (Recharts: messages over time, model distribution, credits, active users).
  - **TopAdoptersPodium** — Top-5 by AI Adoption; gold/silver/bronze borders for top 3.

### FE-6. Individual Page (`app/individual`)
- **Purpose**: Per-user metrics.
- **Sub-components**: **UserSearchSelect** (searchable), per-user **StatCards** + **Charts**.

### FE-7. Comparison Page (`app/comparison`)
- **Purpose**: Compare users on a metric.
- **Sub-components**: **MetricSelect** (AI Adoption, Total Messages, Chat Conversations, Credits
  Used, Active Days — Q6=A), **UserSetSelect** (Top N / Last N / Top-5+Bottom-5 / All; N≤20),
  **ComparisonChart** (bar).

### FE-8. Design Tokens / Theme (`styles/theme`)
- **Purpose**: Kiro IDE-like dark theme.
- **Responsibilities**: color palette, typography, accent tokens, shared component styles.

### FE-9. Layout Persistence (`lib/layout`)
- **Purpose**: Read/write dashboard block order + lock states to **localStorage** (Q4=C).
- **Responsibilities**: serialize/restore layout; default layout when none saved.

---

## Story/Requirement Coverage (component view)

| Area | Backend | Frontend |
|---|---|---|
| Auth (US-AUTH-*) | BE-2, BE-10, BE-11 | FE-2, FE-3 |
| Ingestion/parsing (US-DATA-*) | BE-1, BE-3, BE-4, BE-5, BE-9 | — |
| Metrics + AI Adoption (US-METRIC-*) | BE-6, BE-7, BE-8 | FE-4 |
| Main dashboard (US-MAIN-*) | BE-6, BE-7, BE-8, BE-11 | FE-5, FE-9, FE-4 |
| Individual (US-IND-*) | BE-6, BE-11 | FE-6 |
| Comparison (US-COMP-*) | BE-8, BE-11 | FE-7 |
| NRT + nav (US-NRT/NAV) | BE-9 | FE-1, FE-4 |
| Styling/deploy/quality (US-NFR-*) | all | FE-8, all |
