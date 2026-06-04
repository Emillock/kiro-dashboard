# Unit of Work Dependencies — Kiro NRT Dashboard

---

## Dependency Matrix

| Unit | Depends on | Type |
|---|---|---|
| **Unit 1** Data & Metrics | AWS S3 (external) | Runtime — boto3 API calls |
| **Unit 2** Auth & API | Unit 1 (metrics logic) | Build-time import; Unit 1 must be code-complete first |
| **Unit 3** Frontend | Unit 2 REST API | Runtime — HTTP; can mock for parallel dev |
| **Unit 4** Infrastructure | Units 1, 2, 3 (Dockerfiles) | Deployment wiring; must build last |

**No circular dependencies.** Unit 1 has no internal dependencies.

---

## Critical Integration Points

### Unit 1 → Unit 2
- `MetricsService` (Unit 2) imports and calls `compute_user_metrics`, `compute_aggregate_metrics`,
  `apply_scores`, `select_users`, `top_adopters`, `build_email_map` from Unit 1.
- The `UsageRecord`, `UserMetrics`, `AggregateMetrics` Pydantic models defined in Unit 1 are
  referenced by Unit 2 service + router response models.
- **Integration contract**: Unit 1 exports a stable Python API from `backend/core/`. Unit 2 imports
  from those modules directly (same Python package, same container).

### Unit 2 → Unit 3
- All 10 REST endpoints defined in `api-contract.md` are the contract boundary.
- Unit 3 consumes them via `lib/api.ts`. During Unit 3 development, the backend can be either live
  or mocked (e.g. MSW or a JSON fixture server).
- **Integration contract**: The endpoint paths, query param names, and response JSON shapes in
  `api-contract.md` are frozen after Unit 2 is complete.

### Units 1+2+3 → Unit 4
- Unit 4 supplies `Dockerfile` for both backend and frontend and the `docker-compose.yml` that
  binds them with environment variables and a named SQLite volume.
- **Integration contract**: Backend listens on port 8000, frontend on 3000. `NEXT_PUBLIC_API_URL`
  is set to the backend service address in Compose.

---

## Build Order & Parallelisation

```
Step 1  ──► Unit 1 (Data & Metrics)          ← no dependencies; start here
              │
Step 2  ──► Unit 2 (Auth & API)               ← imports Unit 1 logic
              │
Step 3  ──► Unit 3 (Frontend)                 ← calls Unit 2 API
              │                                  (can start in parallel with Unit 2 using mocked API)
Step 4  ──► Unit 4 (Infrastructure)           ← wraps all three
```

**Partial parallelism**: Unit 3 frontend development can begin against a mocked API (MSW) while
Unit 2 is being built. Integration testing of Unit 3 requires Unit 2 to be complete.

---

## External Dependencies

| Dependency | Unit | Direction | Notes |
|---|---|---|---|
| AWS S3 | Unit 1 | Runtime outbound | Credentials from `.env`; boto3 |
| SQLite DB file | Unit 2 | Runtime local | Docker named volume `kiro_db` |
| Browser localStorage | Unit 3 | Runtime local | Dashboard layout state only |

---

## Failure Isolation

- **Unit 1 failures** (S3 unreachable, malformed CSV): caught in `MetricsService`, surfaced as
  API errors; do not crash the backend process.
- **Unit 2 failures** (DB unavailable, JWT invalid): HTTP 5xx / 4xx responses; frontend shows error state.
- **Unit 3 failures** (API unreachable): TanStack Query retry logic + error boundaries; page
  degrades gracefully.
- **Unit 4 failures** (missing `.env`, port conflict): startup fails with a clear Docker error;
  no partial-run risk.
