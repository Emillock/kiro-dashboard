/**
 * Feature: insights-section, Property 15: Model shares normalize, are bounded, and identify the dominant model
 *
 * Property 15 (design.md): For all non-empty model distributions, each model's
 * computed share lies between 0 and 1 inclusive, the shares sum to 1 within a
 * tolerance of 1e-9, and the reported dominant model has a share greater than or
 * equal to every other model's share, with ties broken by the lexicographically
 * smallest model identifier.
 *
 * Validates: Requirements 6.1, 6.2
 *
 * The function under test is `computeModelUsageInsights({ aggregate, userMetrics:
 * null }, config)` from lib/insights/modelUsage.ts. It emits a dominant-model
 * insight with id `modelUsage-dominant` whose:
 *   - `status` is `ok` (a non-empty distribution with a positive total),
 *   - `magnitude` is `round2(dominantShare * 100)`,
 *   - `detail.model` is the dominant model identifier,
 *   - `detail.share` is the dominant model's share, and
 *   - `detail["share_<model>"]` carries each model's individual share.
 *
 * ## Determinism note
 *
 * `model_distribution` counts are generated as NON-NEGATIVE INTEGERS with a
 * guaranteed positive total. Integer counts make the per-model shares exact
 * rationals (`count / total`): two models tie for the maximum share if and only
 * if they have equal counts, so the lexicographic tie-break is exercised without
 * any floating-point boundary ambiguity. Zero-count models are permitted (they
 * contribute a 0 share) and tie cases are common because counts are drawn from a
 * small range. The oracle reproduces the dominant model by selecting the maximum
 * integer count, breaking ties by the lexicographically smallest identifier --
 * identical to the implementation's behavior over the sorted key set.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeModelUsageInsights } from "../lib/insights/modelUsage";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import { round2 } from "../lib/insights/math";
import type { AggregateMetrics } from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const DOMINANT_ID = "modelUsage-dominant";

/** The tolerance the design requires for share normalization (Requirement 6.1). */
const SHARE_SUM_TOLERANCE = 1e-9;

/**
 * Build a minimal but complete `AggregateMetrics` carrying the supplied
 * `model_distribution`. The dominant-model computation reads only
 * `model_distribution`, so the remaining fields are filled with inert values and
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
 * a guaranteed positive total. Model identifiers are fixed-width zero-padded so
 * lexicographic string ordering equals index ordering, which makes the
 * "lexicographically smallest" tie-break predictable. Counts are drawn from a
 * small range so ties for the maximum are common; zero counts are included to
 * exercise zero-share models.
 */
const distributionArb = (): fc.Arbitrary<Record<string, number>> =>
  fc
    .array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 12 })
    .map((counts) => {
      const adjusted = counts.slice();
      // Guarantee a strictly positive total so a dominant model exists.
      if (adjusted.reduce((sum, c) => sum + c, 0) === 0) {
        adjusted[0] = 1;
      }
      const dist: Record<string, number> = {};
      adjusted.forEach((count, i) => {
        dist[`model-${String(i).padStart(3, "0")}`] = count;
      });
      return dist;
    });

/**
 * Independent oracle. Computes the total, the dominant model (maximum integer
 * count, ties broken by the lexicographically smallest identifier), and the
 * dominant model's exact share.
 */
function oracle(dist: Record<string, number>): {
  total: number;
  dominantModel: string;
  dominantShare: number;
} {
  const models = Object.keys(dist);
  const total = models.reduce((sum, m) => sum + dist[m], 0);

  let dominantModel = "";
  let dominantCount = -1;
  // Iterate in ascending id order; a strictly-greater count replaces the
  // incumbent, so the first (smallest id) member of a tie group is retained.
  for (const m of [...models].sort()) {
    if (dist[m] > dominantCount) {
      dominantCount = dist[m];
      dominantModel = m;
    }
  }

  return { total, dominantModel, dominantShare: dominantCount / total };
}

// ── Property 15: shares are bounded, normalized, and the dominant is correct ──

test("Property 15: per-model shares lie in [0, 1], sum to 1 within 1e-9, and the dominant model has the maximal share", () => {
  fc.assert(
    fc.property(distributionArb(), (dist) => {
      const insights = computeModelUsageInsights(
        { aggregate: buildAggregate(dist), userMetrics: null },
        DEFAULT_INSIGHT_CONFIG,
      );

      const dominant = insights.find((i) => i.id === DOMINANT_ID);
      expect(dominant).toBeDefined();
      expect(dominant!.status).toBe("ok");
      expect(dominant!.detail).toBeDefined();

      const detail = dominant!.detail!;
      const models = Object.keys(dist);

      // Collect every reported per-model share from detail["share_<model>"].
      const reportedShares: number[] = models.map((m) => {
        const s = detail[`share_${m}`];
        expect(typeof s).toBe("number");
        return s as number;
      });

      // Share bounds: each reported share lies in [0, 1] inclusive.
      for (const s of reportedShares) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }

      // Share normalization: the reported shares sum to 1 within tolerance.
      const shareSum = reportedShares.reduce((a, b) => a + b, 0);
      expect(Math.abs(shareSum - 1)).toBeLessThanOrEqual(SHARE_SUM_TOLERANCE);

      // Dominant-model correctness: the reported dominant share is >= every
      // other model's reported share.
      const reportedDominantShare = detail.share as number;
      expect(typeof reportedDominantShare).toBe("number");
      for (const s of reportedShares) {
        expect(reportedDominantShare).toBeGreaterThanOrEqual(s - SHARE_SUM_TOLERANCE);
      }

      // The dominant share is itself a valid share in [0, 1].
      expect(reportedDominantShare).toBeGreaterThanOrEqual(0);
      expect(reportedDominantShare).toBeLessThanOrEqual(1);

      // Cross-check against the independent oracle (value + lexicographic tie-break).
      const o = oracle(dist);
      expect(detail.model).toBe(o.dominantModel);
      expect(reportedDominantShare).toBeCloseTo(o.dominantShare, 9);
      expect(detail[`share_${o.dominantModel}`]).toBeCloseTo(o.dominantShare, 9);

      // Magnitude is the dominant share as a rounded percentage.
      expect(dominant!.magnitude).toBeCloseTo(round2(o.dominantShare * 100), 9);
    }),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("single model has a share of 1 and is the dominant model", () => {
  const insights = computeModelUsageInsights(
    { aggregate: buildAggregate({ "claude": 42 }), userMetrics: null },
    DEFAULT_INSIGHT_CONFIG,
  );
  const dominant = insights.find((i) => i.id === DOMINANT_ID)!;
  expect(dominant.status).toBe("ok");
  expect(dominant.detail!.model).toBe("claude");
  expect(dominant.detail!.share).toBeCloseTo(1, 9);
  expect(dominant.detail!["share_claude"]).toBeCloseTo(1, 9);
  expect(dominant.magnitude).toBeCloseTo(100, 9);
});

test("tie for the maximum share resolves to the lexicographically smallest id", () => {
  // "alpha" and "beta" tie at count 10; "alpha" is lexicographically smaller.
  const insights = computeModelUsageInsights(
    {
      aggregate: buildAggregate({ beta: 10, alpha: 10, gamma: 3 }),
      userMetrics: null,
    },
    DEFAULT_INSIGHT_CONFIG,
  );
  const dominant = insights.find((i) => i.id === DOMINANT_ID)!;
  expect(dominant.detail!.model).toBe("alpha");
  expect(dominant.detail!.share).toBeCloseTo(10 / 23, 9);
});

test("zero-count models contribute a 0 share and never win", () => {
  const dist = { a: 0, b: 0, c: 7 };
  const insights = computeModelUsageInsights(
    { aggregate: buildAggregate(dist), userMetrics: null },
    DEFAULT_INSIGHT_CONFIG,
  );
  const dominant = insights.find((i) => i.id === DOMINANT_ID)!;
  expect(dominant.detail!.model).toBe("c");
  expect(dominant.detail!["share_a"]).toBe(0);
  expect(dominant.detail!["share_b"]).toBe(0);
  expect(dominant.detail!["share_c"]).toBeCloseTo(1, 9);

  const sum =
    (dominant.detail!["share_a"] as number) +
    (dominant.detail!["share_b"] as number) +
    (dominant.detail!["share_c"] as number);
  expect(Math.abs(sum - 1)).toBeLessThanOrEqual(1e-9);
});
