# Unit Test Execution — Kiro NRT Dashboard

## Backend Unit Tests (Hypothesis PBT + example-based)

```bash
# From repo root:
backend/.venv/Scripts/python -m pytest backend/tests/unit/ -q
```

**Expected**: 50 tests pass (40 Unit 1 + 10 Unit 2 unit tests).  
**Test report**: stdout; failures include Hypothesis seed for reproduction.

### With verbose PBT output:
```bash
backend/.venv/Scripts/python -m pytest backend/tests/unit/ -v --hypothesis-show-statistics
```

### Run a single test file:
```bash
backend/.venv/Scripts/python -m pytest backend/tests/unit/test_adoption.py -v
```

---

## Frontend Unit Tests (fast-check PBT + example-based)

```bash
cd frontend
npm run test        # vitest run (single pass)
npm run test:watch  # vitest watch mode (development)
```

**Expected**: 7 tests pass (layout round-trip + invariants).

---

## Coverage

Backend coverage (optional):
```bash
backend/.venv/Scripts/python -m pytest backend/tests/unit/ --cov=backend --cov-report=term-missing -q
```

---

## PBT Seed Reproduction

If a Hypothesis property test fails with a seed, reproduce it exactly:
```bash
backend/.venv/Scripts/python -m pytest backend/tests/unit/test_adoption.py -k "test_monotonic_in_total_messages" --hypothesis-seed=<SEED>
```

For fast-check, set the seed in the test:
```ts
fc.assert(fc.property(...), { seed: <SEED> });
```
