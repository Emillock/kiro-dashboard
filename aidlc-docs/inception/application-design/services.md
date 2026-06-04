# Services — Kiro NRT Dashboard

Services sit between the API routers and the core logic components. They orchestrate multi-step
operations, manage cache lookups, and present a clean interface to the routers.

---

## AuthService

**Purpose**: Orchestrate user registration and login.

**Depends on**: BE-2 Auth helpers, BE-10 UserRepository, BE-1 Config (JWT settings).

**Responsibilities**:
- `register(email, username, password)` — validate uniqueness, hash password, persist user, return created user.
- `login(email, password)` — verify credentials, issue JWT.
- `get_current_user(token)` — decode JWT, load user record (used as FastAPI dependency).

**Error handling**: raises `ConflictError` (duplicate email/username), `UnauthorizedError` (bad credentials), `ValidationError` (input format).

---

## MetricsService

**Purpose**: Orchestrate the full metrics pipeline: ingest → parse → aggregate → score → cache.

**Depends on**: BE-3 S3Client, BE-4 CSV Parser, BE-5 EmailMapping, BE-6 Metrics Engine, BE-7 AI Adoption Calculator, BE-8 Ranking/Selection, BE-9 Cache.

**Responsibilities**:
- `get_aggregate_metrics(range: "week"|"month") → AggregateMetrics`  
  — cache-first: compute range dates, check cache, if miss fetch+parse+aggregate+score+store.
- `get_user_metrics(range, user_id) → UserMetrics`  
  — cache-first: per-user slice from the cached user list.
- `get_top_adopters(range, k=5) → list[UserMetrics]`  
  — top-k by adoption score; used by main-page podium.
- `get_comparison(range, metric, mode, n) → list[UserMetrics]`  
  — ranked/filtered user set per the selection mode.
- `list_users(range) → list[UserSummary]`  
  — all users with label + adoption score for the Individual page search selector.
- `get_email_map() → dict[str,str]`  
  — cache-first full-bucket scan (long TTL).

**Cache key pattern**: `metrics:{range}:{yyyy-mm-dd_start}:{yyyy-mm-dd_end}` for metric data; `email_map:v1` for the mapping.

**NRT behavior**: cache TTL drives freshness; the frontend's TanStack Query polling interval triggers re-requests after TTL expiry, causing a transparent re-ingest.

---

## UserDirectoryService

**Purpose**: Provide the user search list (email labels + basic stats) for the Individual page selector.

**Depends on**: MetricsService (re-uses the user list from the cached metrics pipeline).

**Responsibilities**:
- `search_users(range, query: str) → list[UserSummary]` — filter by email/userId prefix match.

---

## Service Interaction Summary

```
Router (HTTP request)
  └── AuthService
        ├── UserRepository (SQLite)
        └── Auth helpers (bcrypt, JWT)

Router (HTTP request + JWT)
  └── MetricsService
        ├── Cache (SQLite cache table) ← check first
        ├── S3Client → CSV Parser → EmailMapping
        ├── Metrics Engine → AI Adoption Calculator
        ├── Ranking/Selection
        └── Cache (SQLite cache table) ← store result

Router (HTTP request + JWT)
  └── UserDirectoryService
        └── MetricsService (shared cached user list)
```
