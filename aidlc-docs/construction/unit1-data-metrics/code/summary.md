# Unit 1 — Data & Metrics — Code Generation Summary

**Status**: Complete · **Tests**: 40 passed (example-based + property-based) in ~4.7s.

## Files Created (application code)

| File | Purpose | Stories |
|---|---|---|
| `backend/pyproject.toml` | Project + deps (fastapi, boto3, pydantic, hypothesis, ...) + pytest/hypothesis config | — |
| `backend/.python-version` | Pin Python 3.12 | — |
| `backend/__init__.py`, package `__init__.py`s | Package markers | — |
| `backend/core/config.py` | `Settings` (env/.env), AI Adoption weights, TTLs, refresh interval | US-DATA-01 (config), US-METRIC-03 |
| `backend/models/metrics.py` | `UsageRecord`, `UserMetrics`, `AggregateMetrics`, `UserSummary`, `DailyTotal` | — |
| `backend/core/ingestion/parser.py` | Dynamic CSV parser (stable + `*_messages` discovery, missing→0, unknown ignored) | US-DATA-03 |
| `backend/core/ingestion/s3_client.py` | List/fetch S3 reports for a range; tolerate missing days | US-DATA-02 |
| `backend/core/ingestion/email_map.py` | UserId→email scan + label resolution | US-DATA-05 |
| `backend/core/metrics/aggregator.py` | IDE+CLI combine, per-user + aggregate metrics, active-days | US-METRIC-01, US-METRIC-02, US-DATA-04 |
| `backend/core/metrics/adoption.py` | Configurable absolute weighted AI Adoption score | US-METRIC-03 |
| `backend/core/metrics/selection.py` | Top/Bottom-N (cap 20), Top5+Bottom5, all; top-5 podium | FR-6.3, FR-4.3 |

## Test Files Created

| File | Coverage |
|---|---|
| `backend/tests/unit/generators.py` | Hypothesis domain generators (PBT-07) |
| `backend/tests/unit/test_parser.py` | Example + PBT: dynamic columns, unknown-column invariance, non-negative counts |
| `backend/tests/unit/test_aggregator.py` | Example + PBT: IDE+CLI combine, active-days bounds, aggregate-sum oracle |
| `backend/tests/unit/test_adoption.py` | Example + PBT: weighted-sum, monotonicity, dot-product oracle |
| `backend/tests/unit/test_selection.py` | Example + PBT: top/bottom-N size+ordering, cap-at-20, top5+bottom5 no-overlap |
| `backend/tests/unit/test_email_map.py` | Example: label resolution + fallback |

## Environment

- `backend/.venv` created with `uv venv`; deps installed via `uv pip install -e ".[dev]"`.
- Run tests: `.venv\Scripts\python.exe -m pytest tests/unit` (from `backend/`).

## PBT Compliance (Unit 1)

| Rule | Status | Notes |
|---|---|---|
| PBT-01 property identification | ✅ | Property catalogue in the unit plan; realized in tests |
| PBT-02 round-trip | ✅ | parser stable-column extraction verified across generated CSVs |
| PBT-03 invariant | ✅ | combine/active-days/adoption/selection invariants |
| PBT-04 idempotency | N/A | No idempotent ops in Unit 1 (cache is Unit 2) |
| PBT-05 oracle | ✅ | adoption dot-product oracle; aggregate-sum oracle |
| PBT-06 stateful | N/A | Pure functions only |
| PBT-07 generators | ✅ | `generators.py` domain strategies (constrained, realistic) |
| PBT-08 shrinking/seed | ✅ | Hypothesis default shrinking; `print_blob=true` for repro; seed logged on failure |
| PBT-09 framework | ✅ | Hypothesis in `pyproject.toml` |
| PBT-10 complementary | ✅ | Example-based + PBT in every logic test file |

No blocking PBT findings.

## Notes
- Generators were tuned (sampled emails/models, capped list sizes) to satisfy Hypothesis'
  `too_slow` health check while keeping inputs realistic.
- `credits_used` rounded to 6 dp in aggregation to avoid float drift.
