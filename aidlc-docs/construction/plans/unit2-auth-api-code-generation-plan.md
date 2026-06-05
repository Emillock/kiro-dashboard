# Unit 2 — Auth & API — Code Generation Plan

**Unit**: Auth & API (Backend HTTP Layer) · **Build order**: 2nd of 4
**Workspace root**: `c:\Users\User\Desktop\apps\repos\kiro-dashboard`
**Code location**: `backend/` · **Doc summaries**: `aidlc-docs/construction/unit2-auth-api/code/`

Single source of truth for Unit 2 Code Generation. Builds on Unit 1's `core/` logic. PBT is
**enabled (full)** — applicable properties (cache idempotency, cache-key uniqueness) get
property-based tests; auth/API paths get example-based + integration tests (PBT-10).

---

## Unit Context

**Stories implemented**: US-AUTH-01, US-AUTH-02, US-AUTH-03, US-AUTH-04, US-DATA-01, US-NFR-05.

**Dependencies**: Unit 1 (`backend/core/metrics/*`, `backend/core/ingestion/*`, `backend/models/metrics.py`).
Adds SQLite persistence, JWT auth, the orchestrating services, and the FastAPI app + routers.

**Entities owned**: `users` table (id, email, username, password_hash, created_at);
`metrics_cache` table (cache_key, value_json, expires_at).

**Business rules**:
- bcrypt password hashing; JWT (HS256) access tokens with configurable expiry (FR-1.3, FR-1.4).
- Unique email + username; email format + password min-length validation (FR-1.6).
- Open registration; all authenticated users see all data (FR-1.5, FR-6).
- MetricsService is cache-first (SQLite cache table, Q2=B): key by (range, start, end); on miss,
  run Unit 1 ingest→parse→aggregate→score→select, then store with TTL.
- Email map cached with longer TTL.
- Resilient ingestion: S3/parse errors surface as clean API errors, never crash (US-NFR-05, NFR-3).

---

## REST API (from api-contract.md)

| Method | Path | Auth | Story |
|---|---|---|---|
| POST | `/api/v1/auth/register` | ❌ | US-AUTH-01 |
| POST | `/api/v1/auth/login` | ❌ | US-AUTH-02 |
| GET | `/api/v1/auth/me` | ✅ | US-AUTH-03 |
| GET | `/api/v1/metrics/aggregate` | ✅ | US-METRIC-02 (serve) |
| GET | `/api/v1/metrics/users` | ✅ | US-IND-02 (serve) |
| GET | `/api/v1/metrics/users/{id}` | ✅ | US-IND-03 (serve) |
| GET | `/api/v1/metrics/top-adopters` | ✅ | US-MAIN-03 (serve) |
| GET | `/api/v1/metrics/compare` | ✅ | US-COMP-02/03 (serve) |
| GET | `/api/v1/config/refresh-interval` | ✅ | US-NRT-01 (serve) |
| GET | `/api/v1/health` | ❌ | — |

(Logout US-AUTH-04 is client-side token discard; `/auth/me` + stateless JWT support it. No server
token store in this iteration.)

## PBT Property Catalogue (PBT-01 for Unit 2)

| Module | Property | Category |
|---|---|---|
| cache_service | `make_key` deterministic + unique per distinct inputs | Invariant |
| cache_service | set→get within TTL returns equal value (round-trip) | Round-trip |
| cache_service | get after expiry returns None | Invariant |
| security | hash→verify round-trips (verify(pw, hash(pw)) is True) | Round-trip |
| security | JWT encode→decode returns same user id/email | Round-trip |

---

## Generation Steps

- [ ] **Step 1 — DB layer (`backend/repositories/db.py`)**
  - SQLite connection helper; `init_db()` creating `users` + `metrics_cache` tables (idempotent).

- [ ] **Step 2 — User repository (`backend/repositories/user_repo.py`)** — US-AUTH-01/02
  - `create`, `get_by_email`, `get_by_username`, `get_by_id`.

- [ ] **Step 3 — Cache repository (`backend/repositories/cache_repo.py`)** — Q2=B
  - `read(key)`, `write(key, value_json, expires_at)`, `purge_expired()`.

- [ ] **Step 4 — Security (`backend/core/auth/security.py`)** — US-AUTH-01..03
  - bcrypt hash/verify, JWT create/decode, `get_current_user` dependency.

- [ ] **Step 5 — Auth/user models (`backend/models/user.py`, `backend/models/auth.py`)**
  - `UserRecord`, `UserCreate`, `UserOut`, `TokenData`, `LoginRequest`, `TokenResponse`.

- [ ] **Step 6 — Cache service (`backend/core/cache/cache_service.py`)**
  - `make_key`, `cache_get`, `cache_set`, `cache_invalidate` over CacheRepository (JSON serialize).

- [ ] **Step 7 — Auth service (`backend/services/auth_service.py`)** — US-AUTH-01/02
  - `register`, `login`, validation, conflict handling.

- [ ] **Step 8 — Metrics service (`backend/services/metrics_service.py`)** — orchestrator
  - Range calc (week/month), cache-first pipeline calling Unit 1; `get_aggregate_metrics`,
    `get_user_metrics`, `list_users`, `get_top_adopters`, `get_comparison`, `get_email_map`.
  - Resilient error handling (US-NFR-05).

- [ ] **Step 9 — User directory service (`backend/services/user_dir_service.py`)** — US-IND-02
  - `search_users(range, query)` over cached user list.

- [ ] **Step 10 — API deps (`backend/api/deps.py`)**
  - `get_settings`, `get_db`, `get_current_user`, service providers.

- [ ] **Step 11 — Auth router (`backend/api/auth_router.py`)** — US-AUTH-01..04
- [ ] **Step 12 — Metrics router (`backend/api/metrics_router.py`)** — serve metrics endpoints
- [ ] **Step 13 — Config + health routers (`backend/api/config_router.py`, `health_router.py`)**
- [ ] **Step 14 — App factory (`backend/main.py`)**
  - Create FastAPI app, CORS, `init_db()` on startup, register routers under `/api/v1`.

- [ ] **Step 15 — Unit tests** (`tests/unit/test_security.py`, `test_cache.py`) — example + PBT
- [ ] **Step 16 — Integration tests** (`tests/integration/test_auth_api.py`, `test_metrics_api.py`)
  - TestClient + temp SQLite; mock S3 (monkeypatch `S3IngestionClient`) for metrics endpoints.

- [ ] **Step 17 — Documentation summary**
  - `aidlc-docs/construction/unit2-auth-api/code/summary.md` (files, PBT compliance).

- [ ] **Step 18 — Verify** — run full backend test suite via `backend/.venv`.

---

## PBT Compliance (to confirm at completion)

| Rule | Applies | Plan coverage |
|---|---|---|
| PBT-01 property identification | Yes | Catalogue above |
| PBT-02 round-trip | Yes | hash/verify, JWT encode/decode, cache set/get |
| PBT-03 invariant | Yes | cache key determinism, expiry |
| PBT-04 idempotency | Yes | `init_db` idempotent; cache set idempotent |
| PBT-05 oracle | N/A | no reference impl needed |
| PBT-06 stateful | Partial | cache get/set sequence (lightweight) |
| PBT-07 generators | Yes | reuse + small auth generators |
| PBT-08 shrinking/seed | Yes | Hypothesis config (inherited) |
| PBT-09 framework | Yes | Hypothesis already in deps |
| PBT-10 complementary | Yes | example + integration + PBT |

## Story Traceability

| Story | Steps |
|---|---|
| US-AUTH-01 | 2, 4, 5, 7, 11, 16 |
| US-AUTH-02 | 4, 7, 11, 16 |
| US-AUTH-03 | 4, 10, 11, 16 |
| US-AUTH-04 | 11 (client-side discard) |
| US-DATA-01 | 8 (S3 via Unit 1 + env config) |
| US-NFR-05 | 8 (resilient ingestion) |

**Total steps**: 18.
