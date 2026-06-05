# Unit 1 — Data & Metrics — Code Generation Plan

**Unit**: Data & Metrics (Backend Core Logic) · **Build order**: 1st of 4
**Workspace root**: `c:\Users\User\Desktop\apps\repos\kiro-dashboard`
**Code location**: `backend/` (application code) · **Doc summaries**: `aidlc-docs/construction/unit1-data-metrics/code/`

This plan is the single source of truth for Unit 1 Code Generation. PBT is **enabled (full)** — every
property identified below MUST get a property-based test (Hypothesis) alongside example-based tests.

---

## Unit Context

**Stories implemented**: US-DATA-02, US-DATA-03, US-DATA-04, US-DATA-05, US-METRIC-01,
US-METRIC-02, US-METRIC-03, US-NFR-06.

**Dependencies**: AWS S3 (runtime, boto3). No internal unit dependencies. Exports a stable Python
API from `backend/core/` for Unit 2 to import.

**Entities/models owned**: `UsageRecord`, `UserMetrics`, `AggregateMetrics`, `UserSummary`,
`DailyTotal` (Pydantic / dataclasses in `backend/models/metrics.py`).

**Business rules (finalized here since Functional Design was skipped)**:
- Active day = `Total_Messages > 0 OR Chat_Conversations > 0` (Q3=B).
- IDE + CLI rows for the same UserId are summed (Q9=A).
- AI Adoption = absolute weighted sum (Q8=B): `0.40*total_messages + 0.30*chat_conversations +
  0.20*credits_used + 0.10*active_days`; weights from config; missing metric → 0.
- Dynamic columns: any header matching `*_messages` (incl. `auto_messages`) is a model message count.
- `User_Email` present in only some files; build mapping from those; one email per UserId; fallback
  to shortened UserId.
- Tolerate missing days/files/columns (default to 0, skip gracefully).

---

## PBT Property Catalogue (PBT-01)

| Module | Property | Category |
|---|---|---|
| parser | parse ignores unknown columns; output field count stable | Invariant |
| parser | known stable columns always extracted with correct types | Invariant |
| parser | `discover_message_columns` returns exactly the `*_messages`/`auto_messages` headers | Oracle |
| aggregator | combine(IDE,CLI) totals == sum of parts (per metric) | Invariant |
| aggregator | active_days == count(days where messages>0 or convos>0); 0 ≤ active_days ≤ period length | Invariant |
| aggregator | aggregate totals == sum of per-user totals | Invariant (oracle vs brute force) |
| adoption | score ≥ 0 for non-negative inputs; score == 0 when all inputs 0 | Invariant |
| adoption | monotonic: increasing any positive-weighted input never decreases score | Invariant |
| adoption | score == manual dot(weights, metrics) | Oracle |
| selection | top_n size == min(n, users); n clamped to ≤ 20 | Invariant |
| selection | top_n ordering is non-increasing by metric | Ordering |
| selection | top5_bottom5 has no duplicate users when users ≥ 10 | Invariant |
| email_map | resolve_label returns email if present else 8-char prefix | Invariant |

**Framework**: Hypothesis. Domain generators for `UsageRecord` (valid UUIDs, non-negative counts,
realistic model-message maps) per PBT-07. Shrinking + seed logging per PBT-08.

---

## Generation Steps

- [x] **Step 1 — Project structure setup**
  - Create `backend/` skeleton: `core/`, `core/ingestion/`, `core/metrics/`, `models/`, `tests/unit/`.
  - Create `backend/pyproject.toml` (or `requirements.txt`) with: boto3, pydantic, pydantic-settings,
    python-dateutil, pytest, hypothesis. Add `backend/__init__.py` packages.
  - Create `backend/.python-version` / note uv usage.

- [x] **Step 2 — Config (`backend/core/config.py`)**
  - `Settings` (pydantic-settings) with all keys from component-methods.md (AWS, bucket/prefix,
    TTLs, adoption weights, refresh interval, JWT placeholder). Loads from env/`.env`.
  - *(US-DATA-01 credential plumbing finalized in Unit 2; config keys defined here.)*

- [x] **Step 3 — Models (`backend/models/metrics.py`)**
  - `UsageRecord`, `UserMetrics`, `AggregateMetrics`, `UserSummary`, `DailyTotal`.

- [x] **Step 4 — CSV Parser (`backend/core/ingestion/parser.py`)** — US-DATA-03
  - `discover_message_columns(header)`, `parse_report(csv_text) -> list[UsageRecord]`.
  - Dynamic columns, type coercion, missing→0, unknown columns ignored, utf-8-sig.

- [x] **Step 5 — S3 Client (`backend/core/ingestion/s3_client.py`)** — US-DATA-02
  - `list_report_keys(start,end)`, `fetch_object_text(key)`, `list_all_keys()`. Tolerate missing days.

- [x] **Step 6 — Email Mapping (`backend/core/ingestion/email_map.py`)** — US-DATA-05
  - `build_email_map()`, `resolve_label(user_id, email_map)`.

- [x] **Step 7 — Metrics Engine (`backend/core/metrics/aggregator.py`)** — US-METRIC-01, US-METRIC-02, US-DATA-04
  - `combine_records`, `compute_user_metrics`, `compute_aggregate_metrics`.

- [x] **Step 8 — AI Adoption (`backend/core/metrics/adoption.py`)** — US-METRIC-03
  - `adoption_score`, `apply_scores`. Weights from config.

- [x] **Step 9 — Ranking/Selection (`backend/core/metrics/selection.py`)** — main page + comparison support
  - `select_users(metric, mode, n)`, `top_adopters(k=5)`. Clamp n ≤ 20.

- [x] **Step 10 — PBT generators (`backend/tests/unit/generators.py`)** — PBT-07
  - Hypothesis strategies for `UsageRecord`, headers, weight dicts.

- [x] **Step 11 — Tests: parser** (`test_parser.py`) — example-based + PBT (US-NFR-06)
- [x] **Step 12 — Tests: aggregator** (`test_aggregator.py`) — example-based + PBT
- [x] **Step 13 — Tests: adoption** (`test_adoption.py`) — example-based + PBT
- [x] **Step 14 — Tests: selection** (`test_selection.py`) — example-based + PBT
- [x] **Step 15 — Tests: email_map** (`test_email_map.py`) — example-based
  - Configure pytest + hypothesis (seed logging) in `backend/pyproject.toml`/`pytest.ini`.

- [x] **Step 16 — Documentation summary**
  - Write `aidlc-docs/construction/unit1-data-metrics/code/summary.md` (files created, PBT compliance).

- [x] **Step 17 — Verify** (tests executed: 40 passed in ~4.7s via backend/.venv)

---

## PBT Compliance (to confirm at completion)

| Rule | Applies | Plan coverage |
|---|---|---|
| PBT-01 property identification | Yes | Property catalogue above |
| PBT-02 round-trip | Partial | parser stable-column round-trip |
| PBT-03 invariant | Yes | aggregator/adoption/selection invariants |
| PBT-04 idempotency | N/A (Unit 2 cache) | — |
| PBT-05 oracle | Yes | adoption dot-product oracle, aggregate sum oracle |
| PBT-06 stateful | N/A (pure functions) | — |
| PBT-07 generators | Yes | Step 10 domain generators |
| PBT-08 shrinking/seed | Yes | Hypothesis config in Step 15 |
| PBT-09 framework | Yes | Hypothesis in pyproject (Step 1) |
| PBT-10 complementary | Yes | example-based + PBT in every test file |

---

## Story Traceability

| Story | Steps |
|---|---|
| US-DATA-02 | 5 |
| US-DATA-03 | 4, 11 |
| US-DATA-04 | 7, 12 |
| US-DATA-05 | 6, 15 |
| US-METRIC-01 | 7, 12 |
| US-METRIC-02 | 7, 12 |
| US-METRIC-03 | 8, 13 |
| US-NFR-06 | 10–15 (PBT across all core logic) |

**Total steps**: 17.
