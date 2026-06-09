# Performance Test Instructions — Kiro NRT Dashboard

## Performance Context

The Kiro Dashboard is an **internal tool** with a small user base (the S3 bucket contains ~22
users). Performance testing focuses on backend S3 fetch latency and cache effectiveness
rather than high-concurrency load scenarios.

## Key Performance Targets

| Scenario | Target |
|---|---|
| Cached metrics response | < 50ms (SQLite cache read) |
| Cold metrics fetch (S3 + parse) | < 3s (93KB total dataset) |
| Auth endpoints (register/login) | < 500ms (bcrypt cost) |
| Frontend initial load | < 2s (Next.js standalone) |

---

## Cache Effectiveness Test (manual)

```bash
# Start backend with .env (from the repo root):
backend/.venv/Scripts/python -m uvicorn backend.main:app &
TOKEN=<login token>

# Cold request (S3 fetch + parse + cache write):
time curl -s http://localhost:8000/api/v1/metrics/aggregate?range=month \
  -H "Authorization: Bearer $TOKEN" > /dev/null

# Warm request (cache hit — should be <50ms):
time curl -s http://localhost:8000/api/v1/metrics/aggregate?range=month \
  -H "Authorization: Bearer $TOKEN" > /dev/null
```

**Expected**: Second call < 50ms (cache hit).

---

## Stress Test with wrk (optional, requires wrk installed)

```bash
# Auth endpoint (stateless, fast):
wrk -t2 -c10 -d10s -s post.lua http://localhost:8000/api/v1/health

# Metrics endpoint (authenticated):
wrk -t2 -c5 -d10s \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/metrics/aggregate?range=month
```

---

## Notes

- bcrypt login is deliberately ~300ms by design (security); no optimization target.
- S3 fetch is network-bound. For faster cold loads, reduce `CACHE_TTL_SECONDS` to ensure
  results are fresh but don't increase unnecessary S3 calls.
- This dashboard is not designed for hundreds of concurrent users; for scale see future
  Operations phase (Redis cache, horizontal scaling).
