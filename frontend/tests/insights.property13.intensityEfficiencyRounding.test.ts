/**
 * Feature: insights-section, Property 13: avg_messages_per_user and efficiency rounding/non-negativity
 *
 * Property 13 (design.md): For all inputs with a positive denominator,
 * `avg_messages_per_user` equals `round2(total_messages / active_users)` and
 * `Credit_Efficiency` equals `round2(credits_used / total_messages)`, and
 * `Credit_Efficiency` is greater than or equal to 0 whenever credits_used is
 * non-negative.
 *
 * Validates: Requirements 5.2, 7.1
 *
 * This property spans TWO pure computers, each driven only by aggregate daily
 * totals (per-user metrics are passed as `null`, so neither needs the fan-out):
 *
 *   1. Intensity (avg_messages_per_user) — `computeEngagementInsights`
 *      (lib/insights/engagement.ts), insight id `engagement-intensity`. Its
 *      magnitude is `round2(totalMessages / activeUsersPeak)` where
 *      `activeUsersPeak` is the maximum `active_users` across the range
 *      (Requirement 5.2). The denominator is positive iff some day has
 *      `active_users > 0`; otherwise the insight is `insufficient_data` with no
 *      magnitude (Requirement 5.4).
 *
 *   2. Credit_Efficiency — `computeCostEfficiencyInsights`
 *      (lib/insights/costEfficiency.ts), insight id `costEfficiency-efficiency`.
 *      Its magnitude is `round2(sum credits_used / sum total_messages)`
 *      (Requirement 7.1). The denominator is positive iff the summed
 *      `total_messages` is greater than 0; otherwise the insight is
 *      `insufficient_data` with no magnitude (Requirement 7.5). For non-negative
 *      credits_used and a positive denominator, efficiency is >= 0.
 *
 * ## Determinism note
 *
 * Both computers and this test reuse the SAME `round2` helper from
 * lib/insights/math as the oracle, applied to the SAME integer operands divided
 * in the SAME order. The intermediate float division is therefore bit-identical
 * between engine and oracle, so the rounded magnitudes compare with exact
 * equality (`toBe`). Inputs are constrained to INTEGER non-negative values, and
 * the positive-denominator generator injects a guaranteed seed day so the
 * denominators (intensity: peak active_users; efficiency: summed total_messages)
 * are strictly positive.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeEngagementInsights } from "../lib/insights/engagement";
import { computeCostEfficiencyInsights } from "../lib/insights/costEfficiency";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import { round2 } from "../lib/insights/math";
import type { DailyTotal, Insight } from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const INTENSITY_ID = "engagement-intensity";
const EFFICIENCY_ID = "costEfficiency-efficiency";

// A deterministic, unique, ordered date string for a given index. Neither
// computer uses the date for these magnitudes, so any unique string works.
const dateFor = (i: number): string =>
  `2024-01-${String(i + 1).padStart(4, "0")}`;

// Non-negative integer metric magnitudes (messages, credits, users).
const nonNegInt = (max = 100000): fc.Arbitrary<number> => fc.nat({ max });

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

const dayFrom = (i: number, v: DailyValues): DailyTotal => ({
  date: dateFor(i),
  ...v,
});

function findInsight(insights: Insight[], id: string): Insight | undefined {
  return insights.find((ins) => ins.id === id);
}

// ── Oracles (independent of the engine, sharing only `round2`) ───────────────

/** Sum of a numeric field across the days. */
function sumOf(days: DailyTotal[], key: keyof DailyValues): number {
  return days.reduce((acc, d) => acc + (d[key] as number), 0);
}

/** Maximum `active_users` across the days (0 for an empty range). */
function peakActiveUsers(days: DailyTotal[]): number {
  return days.reduce((max, d) => (d.active_users > max ? d.active_users : max), 0);
}

// ── Generators ───────────────────────────────────────────────────────────────

/**
 * A non-empty range guaranteed to have POSITIVE denominators for BOTH computers:
 * a seed day with `active_users >= 1` (so the intensity peak is > 0) and
 * `total_messages >= 1` (so the summed messages, the efficiency denominator, is
 * > 0), plus arbitrarily many additional non-negative integer days.
 */
const positiveRange = (): fc.Arbitrary<DailyTotal[]> =>
  fc
    .record({
      seedMessages: fc.integer({ min: 1, max: 100000 }),
      seedActive: fc.integer({ min: 1, max: 100000 }),
      seedCredits: nonNegInt(),
      seedConversations: nonNegInt(),
      rest: fc.array(dailyValues(), { minLength: 0, maxLength: 20 }),
    })
    .map(({ seedMessages, seedActive, seedCredits, seedConversations, rest }) => {
      const days: DailyTotal[] = [
        dayFrom(0, {
          total_messages: seedMessages,
          chat_conversations: seedConversations,
          credits_used: seedCredits,
          active_users: seedActive,
        }),
      ];
      rest.forEach((v, j) => days.push(dayFrom(j + 1, v)));
      return days;
    });

// ── Property 13a: positive-denominator correctness and non-negativity ────────

test("Property 13: intensity and efficiency equal the round2 oracle exactly, and efficiency >= 0", () => {
  fc.assert(
    fc.property(positiveRange(), (days) => {
      const engagement = computeEngagementInsights(
        { dailyTotals: days, userMetrics: null },
        DEFAULT_INSIGHT_CONFIG,
      );
      const cost = computeCostEfficiencyInsights(
        { dailyTotals: days, userMetrics: null },
        DEFAULT_INSIGHT_CONFIG,
      );

      // ── Intensity (avg_messages_per_user) = round2(totalMessages / peak) ──
      const totalMessages = sumOf(days, "total_messages");
      const peak = peakActiveUsers(days);
      expect(peak).toBeGreaterThan(0); // generator guarantee
      const expectedIntensity = round2(totalMessages / peak);

      const intensity = findInsight(engagement, INTENSITY_ID);
      expect(intensity).toBeDefined();
      expect(intensity!.status).toBe("ok");
      expect(intensity!.magnitude).toBe(expectedIntensity);
      // Supporting numbers report the operands used.
      expect(intensity!.detail!.totalMessages).toBe(totalMessages);
      expect(intensity!.detail!.activeUsers).toBe(peak);

      // ── Credit_Efficiency = round2(sum credits_used / sum total_messages) ─
      const totalCredits = sumOf(days, "credits_used");
      expect(totalMessages).toBeGreaterThan(0); // generator guarantee
      const expectedEfficiency = round2(totalCredits / totalMessages);

      const efficiency = findInsight(cost, EFFICIENCY_ID);
      expect(efficiency).toBeDefined();
      expect(efficiency!.status).toBe("ok");
      expect(efficiency!.magnitude).toBe(expectedEfficiency);

      // Non-negativity: non-negative credits over a positive denominator.
      expect(efficiency!.magnitude!).toBeGreaterThanOrEqual(0);
    }),
    { numRuns: RUNS },
  );
});

// ── Property 13b: zero intensity denominator -> insufficient_data ────────────
//
// When NO day has active_users > 0 the peak is 0, so avg_messages_per_user is
// undefined; the intensity insight must be insufficient_data with no magnitude
// (Requirement 5.4), never a fabricated value.

test("Property 13: a zero active-user peak yields insufficient_data intensity with no magnitude", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          total_messages: nonNegInt(),
          chat_conversations: nonNegInt(),
          credits_used: nonNegInt(),
        }),
        { minLength: 1, maxLength: 20 },
      ),
      (rows) => {
        // Force active_users to 0 on every day.
        const days: DailyTotal[] = rows.map((r, i) =>
          dayFrom(i, { ...r, active_users: 0 }),
        );

        const engagement = computeEngagementInsights(
          { dailyTotals: days, userMetrics: null },
          DEFAULT_INSIGHT_CONFIG,
        );
        const intensity = findInsight(engagement, INTENSITY_ID);
        expect(intensity).toBeDefined();
        expect(intensity!.status).toBe("insufficient_data");
        expect(intensity!.magnitude).toBeUndefined();
        expect(intensity).not.toHaveProperty("magnitude");
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Property 13c: zero efficiency denominator -> insufficient_data ───────────
//
// When the summed total_messages is 0 the efficiency denominator is 0, so
// Credit_Efficiency is undefined; the insight must be insufficient_data with no
// magnitude (Requirement 7.5).

test("Property 13: zero total messages yields insufficient_data efficiency with no magnitude", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          chat_conversations: nonNegInt(),
          credits_used: nonNegInt(),
          active_users: nonNegInt(),
        }),
        { minLength: 1, maxLength: 20 },
      ),
      (rows) => {
        // Force total_messages to 0 on every day.
        const days: DailyTotal[] = rows.map((r, i) =>
          dayFrom(i, { ...r, total_messages: 0 }),
        );

        const cost = computeCostEfficiencyInsights(
          { dailyTotals: days, userMetrics: null },
          DEFAULT_INSIGHT_CONFIG,
        );
        const efficiency = findInsight(cost, EFFICIENCY_ID);
        expect(efficiency).toBeDefined();
        expect(efficiency!.status).toBe("insufficient_data");
        expect(efficiency!.magnitude).toBeUndefined();
        expect(efficiency).not.toHaveProperty("magnitude");
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("intensity rounds to two decimals (10 messages / 3 peak active users = 3.33)", () => {
  const days: DailyTotal[] = [
    { date: dateFor(0), total_messages: 4, chat_conversations: 0, credits_used: 0, active_users: 3 },
    { date: dateFor(1), total_messages: 6, chat_conversations: 0, credits_used: 0, active_users: 2 },
  ];
  const engagement = computeEngagementInsights(
    { dailyTotals: days, userMetrics: null },
    DEFAULT_INSIGHT_CONFIG,
  );
  const intensity = findInsight(engagement, INTENSITY_ID);
  expect(intensity!.status).toBe("ok");
  // totalMessages = 10, peak active_users = 3 -> round2(10/3) = 3.33
  expect(intensity!.magnitude).toBe(round2(10 / 3));
  expect(intensity!.magnitude).toBe(3.33);
});

test("efficiency rounds to two decimals (10 credits / 3 messages = 3.33) and is non-negative", () => {
  const days: DailyTotal[] = [
    { date: dateFor(0), total_messages: 1, chat_conversations: 0, credits_used: 4, active_users: 1 },
    { date: dateFor(1), total_messages: 2, chat_conversations: 0, credits_used: 6, active_users: 1 },
  ];
  const cost = computeCostEfficiencyInsights(
    { dailyTotals: days, userMetrics: null },
    DEFAULT_INSIGHT_CONFIG,
  );
  const efficiency = findInsight(cost, EFFICIENCY_ID);
  expect(efficiency!.status).toBe("ok");
  // totalCredits = 10, totalMessages = 3 -> round2(10/3) = 3.33
  expect(efficiency!.magnitude).toBe(round2(10 / 3));
  expect(efficiency!.magnitude).toBe(3.33);
  expect(efficiency!.magnitude!).toBeGreaterThanOrEqual(0);
});

test("zero credits over positive messages gives a non-negative (zero) efficiency", () => {
  const days: DailyTotal[] = [
    { date: dateFor(0), total_messages: 5, chat_conversations: 0, credits_used: 0, active_users: 2 },
  ];
  const cost = computeCostEfficiencyInsights(
    { dailyTotals: days, userMetrics: null },
    DEFAULT_INSIGHT_CONFIG,
  );
  const efficiency = findInsight(cost, EFFICIENCY_ID);
  expect(efficiency!.status).toBe("ok");
  expect(efficiency!.magnitude).toBe(0);
  expect(efficiency!.magnitude!).toBeGreaterThanOrEqual(0);
});
