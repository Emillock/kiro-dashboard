/**
 * Feature: insights-section, Property 16: Mix-shift detection threshold
 *
 * Property 16 (design.md): For all pairs of sub-period model distributions, a
 * model is reported as mix-shifted if and only if the absolute change in its
 * share between the two sub-periods is greater than or equal to the configured
 * threshold (default 0.05); when no model reaches the threshold, a single "no
 * significant shift" insight is produced.
 *
 * Validates: Requirements 6.3, 6.4 (combined with 9.7 / 12.1 no-fabrication).
 *
 * ## API limitation — Property 16's threshold branch is currently unreachable
 *
 * The threshold-based detection above requires a `model_distribution` for EACH of
 * the two sub-periods. As documented in `lib/insights/modelUsage.ts`, the metrics
 * API exposes `model_distribution` only as a single overall `Record<string,
 * number>` on `AggregateMetrics`, and the per-day `DailyTotal` records carry no
 * per-model breakdown (their fields are date, total_messages, chat_conversations,
 * credits_used, active_users). There is therefore NO data source from which a
 * per-sub-period model distribution can be derived, so `computeMixShiftInsight()`
 * ALWAYS returns a single `insufficient_data` insight (id `modelUsage-mix-shift`)
 * and never fabricates a magnitude.
 *
 * Accordingly, this test validates the ACTUAL implemented contract rather than an
 * idealized threshold comparison: for any (single, overall) non-empty
 * `model_distribution`, the mix-shift insight is always present with status
 * `insufficient_data`, carries no numeric `magnitude`, and names the missing
 * dependency in `unavailableReason`. This is the requirement's intent that no
 * fabricated mix-shift value is produced when per-sub-period data is unavailable
 * (Requirements 6.3 / 6.4 with 9.7 / 12.1 no-fabrication).
 *
 * If/when the backend exposes a daily or sub-period model breakdown, this test
 * SHOULD be extended to exercise the `>= threshold` detection (Requirement 6.3)
 * and the "no significant shift" fallback (Requirement 6.4); only
 * `computeMixShiftInsight()` in modelUsage.ts needs to change.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeModelUsageInsights } from "../lib/insights/modelUsage";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import type { AggregateMetrics } from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const MIX_SHIFT_ID = "modelUsage-mix-shift";

/**
 * Build a minimal but complete `AggregateMetrics` carrying the supplied
 * `model_distribution`. The mix-shift insight depends only on the (un)availability
 * of per-sub-period data, so the remaining fields are filled with inert values and
 * `daily_totals` is left empty.
 */
function buildAggregate(
  modelDistribution: Record<string, number>,
): AggregateMetrics {
  return {
    range: "month",
    start_date: "2024-01-01",
    end_date: "2024-01-31",
    total_messages: 0,
    total_chat_conversations: 0,
    total_credits_used: 0,
    active_user_count: 0,
    avg_messages_per_user: 0,
    avg_conversations_per_user: 0,
    model_distribution: modelDistribution,
    daily_totals: [],
  };
}

/**
 * A non-empty `model_distribution` of model id -> NON-NEGATIVE INTEGER count with
 * a guaranteed positive total. Varied widths, counts, and id orderings exercise
 * the insight across many overall distributions; the mix-shift contract must hold
 * identically for every one of them because the API exposes no per-sub-period
 * breakdown to compare.
 */
const distributionArb = (): fc.Arbitrary<Record<string, number>> =>
  fc
    .array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 12 })
    .map((counts) => {
      const adjusted = counts.slice();
      // Guarantee a strictly positive total so the distribution is meaningful.
      if (adjusted.reduce((sum, c) => sum + c, 0) === 0) {
        adjusted[0] = 1;
      }
      const dist: Record<string, number> = {};
      adjusted.forEach((count, i) => {
        dist[`model-${String(i).padStart(3, "0")}`] = count;
      });
      return dist;
    });

// ── Property 16: mix-shift is always insufficient_data with no fabricated value ──

test("Property 16: for any non-empty model_distribution, the mix-shift insight is insufficient_data with no magnitude (per-sub-period data unavailable)", () => {
  fc.assert(
    fc.property(distributionArb(), (dist) => {
      const insights = computeModelUsageInsights(
        { aggregate: buildAggregate(dist), userMetrics: null },
        DEFAULT_INSIGHT_CONFIG,
      );

      // Exactly one mix-shift insight is produced.
      const mixShifts = insights.filter((i) => i.id === MIX_SHIFT_ID);
      expect(mixShifts).toHaveLength(1);

      const mixShift = mixShifts[0];
      expect(mixShift.category).toBe("modelUsage");
      // Implemented contract: per-sub-period distribution is unavailable.
      expect(mixShift.status).toBe("insufficient_data");
      // No fabricated value (Requirements 9.7 / 12.1).
      expect(mixShift.magnitude).toBeUndefined();
      // The missing dependency is named.
      expect(typeof mixShift.unavailableReason).toBe("string");
      expect(mixShift.unavailableReason!.length).toBeGreaterThan(0);
    }),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("single-model distribution still yields an insufficient_data mix-shift with no magnitude", () => {
  const insights = computeModelUsageInsights(
    { aggregate: buildAggregate({ claude: 42 }), userMetrics: null },
    DEFAULT_INSIGHT_CONFIG,
  );
  const mixShift = insights.find((i) => i.id === MIX_SHIFT_ID)!;
  expect(mixShift).toBeDefined();
  expect(mixShift.status).toBe("insufficient_data");
  expect(mixShift.magnitude).toBeUndefined();
  expect(mixShift.unavailableReason).toBeTruthy();
});

test("multi-model distribution with a clearly dominant model still yields no fabricated mix-shift value", () => {
  const insights = computeModelUsageInsights(
    {
      aggregate: buildAggregate({ alpha: 900, beta: 50, gamma: 50 }),
      userMetrics: null,
    },
    DEFAULT_INSIGHT_CONFIG,
  );
  const mixShift = insights.find((i) => i.id === MIX_SHIFT_ID)!;
  expect(mixShift.status).toBe("insufficient_data");
  expect(mixShift.magnitude).toBeUndefined();
});
