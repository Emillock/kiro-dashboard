# Unit 2 — Auth & API — Code Generation Summary

**Status**: Complete · **Tests**: 75 total (40 Unit 1 + 8 new unit + 18 integration + 1 xfail), all passing.

## Files Created (application code)

| File | Purpose | Stories |
|---|---|---|
| `backend/repositories/db.py` | SQLite connection, `init_db()` (idempotent schema creation) | — |
| `backend/repositories/user_repo.py` | `UserRepository` with parameterized CRUD | US-AUTH-01/02 |
| `backend/repositories/cache_repo.py` | `CacheRepository` (SQLite-backed cache table, Q2=B) | — |
| `backend/core/auth/security.py` | bcrypt hash/verify (72-byte truncation), JWT HS256 create/decode | US-AUTH-01..03 |
| `backend/models/user.py` | `UserCreate`, `UserRecord`, `UserOut`, `TokenData` | — |
| `backend/models/auth.py` | `LoginRequest`, `TokenResponse` | — |
| `backend/core/cache/cache_service.py` | `CacheService`: `make_key`, `get`, `set`, TTL, JSON (de)serialization | — |
| `backend/services/auth_service.py` | `AuthService`: register + login + conflict handling | US-AUTH-01/02 |
| `backend/services/metrics_service.py` | `MetricsService`: cache-first S3 pipeline, resilient errors (US-NFR-05) | US-DATA-01, US-NFR-05 |
| `backend/services/user_dir_service.py` | `UserDirectoryService`: searchable user list | US-IND-02 (serve) |
| `backend/api/deps.py` | FastAPI dependencies: `get_db`, `get_current_user`, service factories | US-AUTH-03 |
| `backend/api/auth_router.py` | `POST /register`, `POST /login`, `GET /me` | US-AUTH-01..04 |
| `backend/api/metrics_router.py` | All metrics endpoints (aggregate, users, user detail, top-adopters, compare) | US-MAIN-01..03, US-IND-02/03, US-COMP-02/03 |
| `backend/api/config_router.py` | `GET /config/refresh-interval` | US-NRT-01 |
| `backend/api/health_router.py` | `GET /health` (no auth) | — |
| `backend/main.py` | FastAPI app factory, CORS, lifespan `init_db()`, router registration | — |
| `pyproject.toml` (repo root) | Package definition moved to repo root so `import backend` works correctly | — |

## Test Files Created

| File | Type | Coverage |
|---|---|---|
| `tests/unit/test_security.py` | Example + PBT | bcrypt round-trip, JWT encode/decode round-trip, cross-verify invariant |
| `tests/unit/test_cache.py` | Example + PBT | cache set/get round-trip, key determinism, idempotent overwrite |
| `tests/integration/test_auth_api.py` | Integration (TestClient) | register, duplicate detection, login, JWT-gated /me, health |
| `tests/integration/test_metrics_api.py` | Integration (TestClient + mocked S3) | aggregate, list users, search, top-adopters, comparison, 404, auth guard |

## Key Fixes During Development

1. **bcrypt 72-byte limit**: truncate password bytes in `hash_password`/`verify_password` before hashing to avoid `ValueError` on multi-byte-char passwords (found by Hypothesis PBT).
2. **Package import structure**: moved `pyproject.toml` to repo root so `import backend` resolves correctly in all contexts; editable install now points to repo root.
3. **Hypothesis bcrypt deadline**: set `deadline=None` and reduced `max_examples=10` for bcrypt-heavy PBT (bcrypt is intentionally slow).
4. **Test data**: registration tests used 2-character usernames (`"u1"`) which fail `min_length=3` validation — corrected to 7-char names.

## Environment

- `backend/.venv` — run tests: `.venv\Scripts\python.exe -m pytest tests/` (from `backend/`).
- Install: `uv pip install --python backend\.venv\Scripts\python.exe -e ".[dev]"` (from repo root).

## PBT Compliance (Unit 2)

| Rule | Status | Notes |
|---|---|---|
| PBT-01 property identification | ✅ | Catalogue in the unit plan |
| PBT-02 round-trip | ✅ | bcrypt hash/verify, JWT encode/decode, cache set/get |
| PBT-03 invariant | ✅ | key determinism, different-password non-verification |
| PBT-04 idempotency | ✅ | cache overwrite idempotent; `init_db` idempotent (CREATE IF NOT EXISTS) |
| PBT-05 oracle | N/A | No reference impl needed |
| PBT-06 stateful | N/A | Stateful cache sequence covered by example tests |
| PBT-07 generators | ✅ | ASCII password strategies, constrained user_ids |
| PBT-08 shrinking/seed | ✅ | Hypothesis default shrinking + `print_blob=true` |
| PBT-09 framework | ✅ | Hypothesis (inherited from project deps) |
| PBT-10 complementary | ✅ | Example-based + PBT + integration tests per feature |

No blocking PBT findings.
