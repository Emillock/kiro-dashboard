# Kiro Dashboard — TODO

## 1. Unlock Credit Depletion Insights (currently showing "Unavailable")

Most Credit Depletion insights are blocked because the backend doesn't yet expose
`overage_cap` (credit allowance) and `overage_credits_used` per user, even though
both fields are present in the S3 CSV reports and partially parsed.

### Why they are unavailable right now

The CSV contains `Overage_Cap`, `Overage_Credits_Used`, and `Overage_Enabled` columns.
The parser reads `overage_credits_used` and `overage_enabled` but **does not read
`Overage_Cap`**. Neither field is surfaced in `UserMetrics` or passed to the frontend
insights engine, so the engine marks the dependent insights as `unavailable`.

### Affected insights

| Insight | Blocked by |
|---|---|
| Early burners (depleted within 7 days) | `overage_cap` (allowance) not in `UserMetrics` |
| Overage spend per user | `overage_credits_used` not in `UserMetrics` |
| Cap-hit rate by tier | `overage_cap` not in `UserMetrics` |
| Remaining balance & % consumed | `overage_cap` not in `UserMetrics` |
| Burn-rate projection | Remaining balance (needs `overage_cap`) |
| Underutilizer detection | `overage_cap` not in `UserMetrics` |
| Depletion-timing trend | Needs ≥ 2 months of data; single range is stored at a time |

### Fix plan

#### Backend (3 changes)

- [ ] **`backend/core/ingestion/parser.py`** — parse `Overage_Cap` column into a new
  `overage_cap: float` field on `UsageRecord` (already in `STABLE_CORE_COLUMNS`).

- [ ] **`backend/models/metrics.py`** — add `overage_cap: float = 0.0` and
  `overage_credits_used: float = 0.0` to `UserMetrics` so the API exposes them.

- [ ] **`backend/core/metrics/aggregator.py`** — propagate `overage_cap` and
  `overage_credits_used` when building `UserMetrics` in `compute_user_metrics()`
  (take the most-recent non-zero `overage_cap` per user, sum `overage_credits_used`).

#### Frontend (2 changes)

- [ ] **`frontend/lib/api.ts`** — add `overage_cap: number` and
  `overage_credits_used: number` to the `UserMetrics` TypeScript interface.

- [ ] **`frontend/app/(dashboard)/insights/page.tsx`** — build `allowanceByTier` and
  `overageByUser` maps from the resolved `userMetrics` fan-out and pass them to
  `computeInsights()` instead of `null`, which will unblock all 6 insight computations.

### Reference — Kiro credit allowances by tier (as of 2026)

```
FREE      →     50 credits/month
PRO       →  1,000 credits/month
PRO_PLUS  →  2,000 credits/month
PRO_MAX   →  5,000 credits/month
POWER     → 10,000 credits/month
```

These can be derived directly from `overage_cap` in the CSV (already per-user), so
no hard-coded lookup table is strictly required — the value is already in the data.

---

## 2. Fill Gaps Between Insight Cards

The Insights page grid currently leaves visible empty space in certain viewport widths
because chart-bearing cards (Trends, Model Usage, Cost & Efficiency) span 2 columns
while text-only cards span 1 column, producing an uneven layout.

### Issue description

At the `≥ 1200px` breakpoint the grid is `repeat(4, 1fr)`. With the current card order:

```
[Trends   — span 2][Adoption  — span 1][Engagement   — span 1]
[ModelUsg — span 2][CostEff   — span 2][CreditDep    — span 1]  ← gap on right
```

`CreditDepletion` (span 1) sits alone in the last row, leaving 3 empty columns.

### Fix options

- [ ] **Option A — Reorder cards** so text-only cards fill the gaps beside chart cards:
  ```
  [Trends   — span 2][Adoption  — span 1][Engagement   — span 1]
  [ModelUsg — span 2][CostEff   — span 2]
  [CreditDep — span 4 full-width]
  ```

- [ ] **Option B — Make Credit Depletion span 2** to fill a half-row instead of
  leaving 3 empty columns.

- [ ] **Option C — Add a new text-only card** (e.g. a Summary card showing top-level
  stats at a glance) so the grid always fills completely.

- [ ] **Option D — Use CSS `grid-auto-flow: dense`** to let the browser pack cards
  automatically without manual reordering.

### Files to change

- `frontend/app/(dashboard)/insights/page.tsx` — `CARD_ORDER`, `CHART_CARD_CATEGORIES`,
  and the `<style>` block with the responsive grid breakpoints.

---

## 3. Minor Polish (lower priority)

- [ ] The Trends card sparklines occupy the full card width but the text insights below
  them leave a lot of vertical whitespace when there are only 5 insight rows. Consider
  increasing sparkline height to `120px` or adding a mini summary stat row.

- [ ] Model Usage donut: the legend text uses raw API key names like
  `claude_opus_4.8_messages`. Strip the `_messages` suffix for a cleaner display
  (e.g. show `claude opus 4.8` instead).

- [ ] Cost & Efficiency bar chart: the Y-axis email labels are truncated at narrow
  viewport widths. Add `textOverflow: "ellipsis"` or a tooltip on the tick label.
