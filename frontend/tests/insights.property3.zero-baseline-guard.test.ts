/**
 * Feature: insights-section, Property 3: Zero or missing baseline never fabricates a value
 *
 * Property 3 (design.md): For all computations that divide by a baseline
 * (period-over-period change, efficiency, growth rate, percent-consumed,
 * burn-rate projection), when the baseline is zero, negative, or missing, the
 * resulting insight has `status` of `insufficient_data` (or `unavailable` when
 * the dependency itself is absent) and carries no numeric `magnitude`.
 *
 * This file exercises the TRENDS computer (`computeTrendInsights`), which is the
 * subject of task 4.x. The trends computer divides by the preceding sub-period
 * aggregate when computing the period-over-period Percentage_Change for
 * total_messages, active_users, and credits_used. Two baseline-guard scenarios
 * are covered:
 *
 *   1. Zero baseline (Requirements 3.9, 12.1, 12.5): the preceding sub-period
 *      aggregates to zero for every metric, so each period-over-period insight
 *      must be `insufficient_data` with no `magnitude`.
 *   2. Fewer than two daily totals (Requirement 3.3): no two comparable
 *      sub-periods exist, so each period-over-period insight must be
 *      `insufficient_data` with no `magnitude`.
 *
 * Validates: Requirements 3.3, 3.9, 5.4, 7.5, 7.6, 9.7, 12.1, 12.5
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeTrendInsights } from "../lib/insights/trends";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import type { DailyTotal, Insight } from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

// The three metrics that the trends computer compares period over period; each
// produces a `trends-pov-<key>` insight (see lib/insights/trends.ts).
const POV_KEYS = ["total_messages", "active_users", "credits_used"] as const;

// A deterministic, unique, ordered date string for a given index. The
// period-over-period computation does not use dates, so any unique string works.
const dateFor = (i: number): string => `2024-01-${String(i + 1).padStart(4, "0")}`;

// Non-negative integer metric magnitudes (messages, credits, users).
const nonNegInt = (): fc.Arbitrary<number> => fc.nat({ max: 100000 });

// The four numeric fields of a DailyTotal.
interface DailyValues {
  total_messages: number;
  chat_conversations: number;
  credits_used: number;
  active_users: number;
}

const dailyValues = (): fc.Arbitrary<DailyValues> =>
  fc.record({
    total_messages: nonNegInt(),
    chat_conversations: nonNegInt(),
    credits_used: nonNegInt(),
    active_users: nonNegInt(),
  });

// A day whose every metric is zero: contributes a zero baseline when it lands in
// the preceding sub-period.
const zeroDay = (i: number): DailyTotal => ({
  date: dateFor(i),
  total_messages: 0,
  chat_conversations: 0,
  credits_used: 0,
  active_users: 0,
});

const fullDay = (i: number, v: DailyValues): DailyTotal => ({ date: dateFor(i), ...v });

/** Locate the period-over-period insight for a given metric key. */
function povInsight(insights: Insight[], key: string): Insight | undefined {
  return insights.find((ins) => ins.id === `trends-pov-${key}`);
}

/**
 * Assert every period-over-period insight is `insufficient_data` and fabricates
 * no numeric magnitude (the core of Property 3).
 */
function expectAllPovGuarded(insights: Insight[]): void {
  for (const key of POV_KEYS) {
    const ins = povInsight(insights, key);
    expect(ins).toBeDefined();
    expect(ins!.status).toBe("insufficient_data");
    // No fabricated value: `magnitude` must be absent.
    expect(ins!.magnitude).toBeUndefined();
    expect(ins).not.toHaveProperty("magnitude");
  }
}

// ── Scenario 1: zero baseline (Requirements 3.9, 12.1, 12.5) ─────────────────
//
// `splitRange` assigns the first floor(n/2) days to `preceding`. By making the
// preceding count `p` all-zero days and the current count `c` equal to `p` or
// `p + 1`, the split lands exactly the zero days in `preceding`, so every metric
// baseline aggregates to zero.

test("Property 3: a zero preceding-sub-period baseline yields insufficient_data with no magnitude", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 15 }), // p: number of all-zero preceding days
      fc.boolean(), // whether the current half carries the odd middle day (c = p + 1)
      // Current-half day values; generate up to p + 1 and slice to the chosen length.
      fc.array(dailyValues(), { minLength: 16, maxLength: 16 }),
      (p, oddMiddle, currentVals) => {
        const c = oddMiddle ? p + 1 : p;
        const days: DailyTotal[] = [];
        for (let i = 0; i < p; i++) {
          days.push(zeroDay(i));
        }
        for (let j = 0; j < c; j++) {
          days.push(fullDay(p + j, currentVals[j]));
        }

        const insights = computeTrendInsights(days, DEFAULT_INSIGHT_CONFIG);
        expectAllPovGuarded(insights);
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Scenario 2: fewer than two daily totals (Requirement 3.3) ────────────────

test("Property 3: fewer than two daily totals yield insufficient_data with no magnitude", () => {
  fc.assert(
    fc.property(
      // Zero or one daily total: too few to form two comparable sub-periods.
      fc.array(dailyValues(), { minLength: 0, maxLength: 1 }),
      (vals) => {
        const days = vals.map((v, i) => fullDay(i, v));
        const insights = computeTrendInsights(days, DEFAULT_INSIGHT_CONFIG);
        expectAllPovGuarded(insights);
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("two days with a zero preceding baseline are insufficient_data without magnitude", () => {
  const days: DailyTotal[] = [
    { date: dateFor(0), total_messages: 0, chat_conversations: 0, credits_used: 0, active_users: 0 },
    { date: dateFor(1), total_messages: 50, chat_conversations: 7, credits_used: 30, active_users: 4 },
  ];
  const insights = computeTrendInsights(days, DEFAULT_INSIGHT_CONFIG);
  expectAllPovGuarded(insights);
});

test("an empty range produces insufficient_data period-over-period insights", () => {
  const insights = computeTrendInsights([], DEFAULT_INSIGHT_CONFIG);
  expectAllPovGuarded(insights);
});
