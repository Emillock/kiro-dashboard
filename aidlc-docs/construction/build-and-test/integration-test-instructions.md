# Integration Test Instructions — Kiro NRT Dashboard

## Backend Integration Tests (TestClient + mocked S3)

The backend integration tests use FastAPI's `TestClient` with a temp SQLite DB and
monkeypatched S3 (no real AWS calls). They verify the full auth and metrics API contracts.

```bash
# From repo root:
backend/.venv/Scripts/python -m pytest backend/tests/integration/ -q
```

**Expected**: 18 tests pass (10 auth + 8 metrics).

### Integration test scenarios covered:

| Test | Scenario |
|---|---|
| `test_register_success` | Register → 201, email + username in response |
| `test_register_duplicate_email` | Same email second time → 409 |
| `test_register_duplicate_username` | Same username second time → 409 |
| `test_register_invalid_email` | Bad email → 422 |
| `test_login_success` | Correct creds → JWT token |
| `test_login_wrong_password` | Wrong password → 401 |
| `test_me_with_valid_token` | JWT → correct user returned |
| `test_me_requires_auth` | No token → 401 |
| `test_aggregate_returns_data` | Mocked S3 → aggregate metrics computed correctly |
| `test_list_users` | Mocked S3 → user list with labels |
| `test_list_users_search` | Search query filters users |
| `test_top_adopters` | Rank 1 has higher score than rank 2 |
| `test_compare_top_n` | Top-1 returns the highest scorer |
| `test_user_detail_not_found` | Non-existent user → 404 |
| `test_refresh_interval_endpoint` | Config endpoint returns interval |
| `test_metrics_requires_auth` | Metrics API 401 without token |

---

## Full Backend Test Suite (unit + integration)

```bash
backend/.venv/Scripts/python -m pytest backend/tests/ -q
```

**Expected**: 75 tests pass, 0 failures.

---

## Manual Integration Test (backend + real S3)

Requires a `.env` file with valid AWS credentials:

```bash
# Start the backend:
cd backend
.venv/Scripts/uvicorn backend.main:app --reload

# In another terminal — register a user:
curl -s -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user16@example.com","username":"testuser","password":"Passw0rd!"}' | python -m json.tool

# Login:
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user16@example.com","password":"Passw0rd!"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Fetch aggregate metrics (triggers real S3 read):
curl -s http://localhost:8000/api/v1/metrics/aggregate?range=month \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

---

## Docker Compose Integration Test

```bash
# From repo root (requires .env with real credentials):
docker compose up --build -d
sleep 10  # wait for healthcheck

# Check health:
curl -s http://localhost:8000/api/v1/health

# Check frontend:
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000

# Tear down:
docker compose down
```
