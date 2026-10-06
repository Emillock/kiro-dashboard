/**
 * Feature: insights-section, Property 5: Momentum_Streak monotonicity and bounds
 *
 * Property 5 (design.md): For all metric series over a range, a detected rising
 * (resp. falling) streak of length N is reported only when N >= 2, every one of
 * the final N day-over-day differences is strictly positive (resp. strictly
 * negative), and N lies between 0 and (number of days − 1) inclusive.
 *
 * Validates: Requirements 3.5, 3.6
 *
 * The function under test is `computeTrendInsights(dailyTotals, config)` from
 * lib/insights/trends.ts. It emits a momentum insight (id
 * `trends-momentum-total_messages`) for `total_messages` with status
 * "increase"/"decrease" and `magnitude` = streak length, ONLY when the trailing
 * strictly-monotonic run length N >= 2.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeTrendInsights } from "../lib/insights/trends";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import type { DailyTotal } from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const MOMENTUM_ID = "trends-momentum-total_messages";

/**
 * Build a `DailyTotal[]` from a sequence of `total_messages` values. Only
 * `total_messages` is relevant to the momentum computation; the remaining
 * fields carry deterministic, valid values and sequential ISO dates so the
 * array is a realistic, ordered range.
 */
function toDailyTotals(messages: number[]): DailyTotal[] {
  return messages.map((m, i) => {
    const day = String(i + 1).padStart(2, "0");
    return {
      date: `2024-01-${day}`,
      total_messages: m,
      chat_conversations: 0,
      credits_used: 0,
      active_users: 0,
    };
  });
}

/**
 * Independently compute the trailing strictly-monotonic streak of a series:
 * the count of trailing day-over-day differences that are all strictly positive
 * ("rising") or all strictly negative ("falling"). Mirrors the requirement
 * definition (Requirements 3.5, 3.6) but is derived directly from the series so
 * it serves as an independent oracle.
 */
function expectedStreak(values: number[]): {
  direction: "rising" | "falling" | "none";
  length: number;
} {
  if (values.length < 2) return { direction: "none", length: 0 };

  let rising = 0;
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i] > values[i - 1]) rising++;
    else break;
  }
  if (rising > 0) return { direction: "rising", length: rising };

  let falling = 0;
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i] < values[i - 1]) falling++;
    else break;
  }
  if (falling > 0) return { direction: "falling", length: falling };

  return { direction: "none", length: 0 };
}

// A series of non-negative message counts. The small value range makes equal
// values, plateaus, and short strict runs all common, exercising the streak
// boundaries (N < 2, N == 2, longer runs) densely.
const messageSeries = (): fc.Arbitrary<number[]> =>
  fc.array(fc.integer({ min: 0, max: 12 }), { minLength: 0, maxLength: 30 });

// ── Property 5: when a momentum insight is present, it is well-formed ─────────

test("Property 5: a reported momentum streak has N >= 2, is bounded, and every final diff is strictly monotonic", () => {
  fc.assert(
    fc.property(messageSeries(), (messages) => {
      const dailyTotals = toDailyTotals(messages);
      const insights = computeTrendInsights(dailyTotals, DEFAULT_INSIGHT_CONFIG);
      const momentum = insights.find((i) => i.id === MOMENTUM_ID);

      if (!momentum) return; // covered by the "absence" property below

      const n = momentum.magnitude as number;

      // N >= 2 (reported only for runs of at least two days).
      expect(n).toBeGreaterThanOrEqual(2);

      // N lies between 0 and (number of days − 1) inclusive.
      expect(n).toBeLessThanOrEqual(dailyTotals.length - 1);

      // Status reflects the direction.
      expect(["increase", "decrease"]).toContain(momentum.status);

      // Every one of the final N day-over-day differences is strictly positive
      // (rising/increase) or strictly negative (falling/decrease).
      const series = messages;
      const startIdx = series.length - n; // first index of the streak window
      for (let i = startIdx; i < series.length; i++) {
        const diff = series[i] - series[i - 1];
        if (momentum.status === "increase") {
          expect(diff).toBeGreaterThan(0);
        } else {
          expect(diff).toBeLessThan(0);
        }
      }
    }),
    { numRuns: RUNS },
  );
});

// ── Property 5: the reported streak matches the independent oracle ───────────

test("Property 5: reported momentum direction and length match the trailing strict run", () => {
  fc.assert(
    fc.property(messageSeries(), (messages) => {
      const dailyTotals = toDailyTotals(messages);
      const insights = computeTrendInsights(dailyTotals, DEFAULT_INSIGHT_CONFIG);
      const momentum = insights.find((i) => i.id === MOMENTUM_ID);

      const oracle = expectedStreak(messages);
      const reportable = oracle.direction !== "none" && oracle.length >= 2;

      if (reportable) {
        expect(momentum).toBeDefined();
        expect(momentum!.magnitude).toBe(oracle.length);
        expect(momentum!.status).toBe(
          oracle.direction === "rising" ? "increase" : "decrease",
        );
      } else {
        // No trailing strict run of length >= 2 in either direction.
        expect(momentum).toBeUndefined();
      }
    }),
    { numRuns: RUNS },
  );
});

// ── Property 5: absence implies no qualifying trailing run ───────────────────

test("Property 5: when no momentum insight is present there is no trailing strict run of length >= 2", () => {
  fc.assert(
    fc.property(messageSeries(), (messages) => {
      const dailyTotals = toDailyTotals(messages);
      const insights = computeTrendInsights(dailyTotals, DEFAULT_INSIGHT_CONFIG);
      const momentum = insights.find((i) => i.id === MOMENTUM_ID);

      if (momentum) return; // covered by the well-formedness property above

      const oracle = expectedStreak(messages);
      // Either there is no trailing strict run at all, or it is shorter than 2.
      expect(oracle.direction === "none" || oracle.length < 2).toBe(true);
    }),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("strictly rising series reports a rising streak of length n-1", () => {
  const insights = computeTrendInsights(
    toDailyTotals([1, 2, 3, 4, 5]),
    DEFAULT_INSIGHT_CONFIG,
  );
  const momentum = insights.find((i) => i.id === MOMENTUM_ID);
  expect(momentum).toBeDefined();
  expect(momentum!.status).toBe("increase");
  expect(momentum!.magnitude).toBe(4);
});

test("strictly falling series reports a falling streak of length n-1", () => {
  const insights = computeTrendInsights(
    toDailyTotals([5, 4, 3, 2, 1]),
    DEFAULT_INSIGHT_CONFIG,
  );
  const momentum = insights.find((i) => i.id === MOMENTUM_ID);
  expect(momentum).toBeDefined();
  expect(momentum!.status).toBe("decrease");
  expect(momentum!.magnitude).toBe(4);
});

test("a flat tail (equal last values) yields no momentum insight", () => {
  const insights = computeTrendInsights(
    toDailyTotals([1, 2, 3, 3]),
    DEFAULT_INSIGHT_CONFIG,
  );
  expect(insights.find((i) => i.id === MOMENTUM_ID)).toBeUndefined();
});

test("a single trailing rising day (N=1) is not reported", () => {
  const insights = computeTrendInsights(
    toDailyTotals([5, 5, 6]),
    DEFAULT_INSIGHT_CONFIG,
  );
  expect(insights.find((i) => i.id === MOMENTUM_ID)).toBeUndefined();
});

test("empty and single-day ranges produce no momentum insight", () => {
  expect(
    computeTrendInsights([], DEFAULT_INSIGHT_CONFIG).find(
      (i) => i.id === MOMENTUM_ID,
    ),
  ).toBeUndefined();
  expect(
    computeTrendInsights(toDailyTotals([7]), DEFAULT_INSIGHT_CONFIG).find(
      (i) => i.id === MOMENTUM_ID,
    ),
  ).toBeUndefined();
});
