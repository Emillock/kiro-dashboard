/**
 * Feature: insights-section, Property 12: Stickiness value and bounds
 *
 * Property 12 (design.md): For all ranges with a positive total-day count,
 * Stickiness equals `active_days / total_days`, lies between 0 and 1 inclusive,
 * and the insight reports both the active-day count and total-day count used.
 *
 * Validates: Requirements 5.1
 *
 * The function under test is `computeEngagementInsights({ dailyTotals, userMetrics }, config)`
 * from lib/insights/engagement.ts. It emits a stickiness insight with id
 * `engagement-stickiness` whose `magnitude` is `round2(activeDays / totalDays)`
 * and whose `detail` carries `activeDays` and `totalDays`, where:
 *   - totalDays = dailyTotals.length, and
 *   - activeDays = count of days with `active_users > 0`.
 *
 * Stickiness does not consume `userMetrics`, so `userMetrics` is passed as `null`.
 *
 * ## Determinism note
 *
 * `active_users` values are INTEGERS, so the active-day count (a count of days
 * with `active_users > 0`) is exact and reproduced identically by the oracle. The
 * implementation rounds the ratio with `round2`, so the reported `magnitude` is
 * compared to the exact rational `activeDays / totalDays` within a small rounding
 * tolerance, while the raw counts in `detail` are asserted exactly. Because
 * `0 <= activeDays <= totalDays`, the exact ratio lies in `[0, 1]` and `round2`
 * preserves those bounds, so both the exact and reported values are checked
 * against `[0, 1]`.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeEngagementInsights } from "../lib/insights/engagement";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import { round2 } from "../lib/insights/math";
import type { DailyTotal } from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const STICKINESS_ID = "engagement-stickiness";

// `round2` rounds to two decimals, so the reported value differs from the exact
// rational ratio by at most half a unit in the last place plus float slack.
const ROUNDING_TOLERANCE = 5e-3 + 1e-9;

/**
 * A non-empty `DailyTotal[]` with INTEGER `active_users` drawn from a small range
 * (including zeros) so that "no active users" days and "active" days are both
 * common, exercising the full span of active-day counts from 0 to totalDays. The
 * other DailyTotal fields are irrelevant to stickiness and carry fixed values.
 */
const dailyTotalsArb = (): fc.Arbitrary<DailyTotal[]> =>
  fc
    .array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 31 })
    .map((activeUsersPerDay) =>
      activeUsersPerDay.map((active_users, i) => ({
        date: `2024-${String(i + 1).padStart(5, "0")}`,
        total_messages: 0,
        chat_conversations: 0,
        credits_used: 0,
        active_users,
      })),
    );

/** Independent oracle: the active-day count is the number of days with active_users > 0. */
function expectedActiveDays(days: DailyTotal[]): number {
  return days.filter((d) => d.active_users > 0).length;
}

// ── Property 12: stickiness equals active/total, in [0, 1], reporting both counts ─

test("Property 12: stickiness equals activeDays/totalDays, lies in [0, 1], and reports both counts", () => {
  fc.assert(
    fc.property(dailyTotalsArb(), (days) => {
      const insights = computeEngagementInsights(
        { dailyTotals: days, userMetrics: null },
        DEFAULT_INSIGHT_CONFIG,
      );
      const stickiness = insights.find((i) => i.id === STICKINESS_ID);

      // With >= 1 day the stickiness insight is always computed (status "ok").
      expect(stickiness).toBeDefined();
      expect(stickiness!.status).toBe("ok");

      const totalDays = days.length;
      const activeDays = expectedActiveDays(days);
      const exactRatio = activeDays / totalDays;

      // The insight reports both the active-day count and total-day count used.
      expect(stickiness!.detail).toBeDefined();
      expect(stickiness!.detail!.totalDays).toBe(totalDays);
      expect(stickiness!.detail!.activeDays).toBe(activeDays);

      // The magnitude equals round2(activeDays/totalDays).
      const magnitude = stickiness!.magnitude as number;
      expect(typeof magnitude).toBe("number");
      expect(magnitude).toBeCloseTo(round2(exactRatio), 9);
      expect(Math.abs(magnitude - exactRatio)).toBeLessThanOrEqual(
        ROUNDING_TOLERANCE,
      );

      // Bounds [0, 1] inclusive on both the exact ratio and the reported value.
      expect(exactRatio).toBeGreaterThanOrEqual(0);
      expect(exactRatio).toBeLessThanOrEqual(1);
      expect(magnitude).toBeGreaterThanOrEqual(0);
      expect(magnitude).toBeLessThanOrEqual(1);
    }),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

function fromActiveUsers(values: number[]): DailyTotal[] {
  return values.map((active_users, i) => ({
    date: `2024-${String(i + 1).padStart(5, "0")}`,
    total_messages: 0,
    chat_conversations: 0,
    credits_used: 0,
    active_users,
  }));
}

test("all days active yields stickiness of 1", () => {
  const days = fromActiveUsers([3, 1, 2, 4]);
  const stickiness = computeEngagementInsights(
    { dailyTotals: days, userMetrics: null },
    DEFAULT_INSIGHT_CONFIG,
  ).find((i) => i.id === STICKINESS_ID)!;
  expect(stickiness.status).toBe("ok");
  expect(stickiness.detail!.activeDays).toBe(4);
  expect(stickiness.detail!.totalDays).toBe(4);
  expect(stickiness.magnitude).toBe(1);
});

test("no active days yields stickiness of 0", () => {
  const days = fromActiveUsers([0, 0, 0]);
  const stickiness = computeEngagementInsights(
    { dailyTotals: days, userMetrics: null },
    DEFAULT_INSIGHT_CONFIG,
  ).find((i) => i.id === STICKINESS_ID)!;
  expect(stickiness.status).toBe("ok");
  expect(stickiness.detail!.activeDays).toBe(0);
  expect(stickiness.detail!.totalDays).toBe(3);
  expect(stickiness.magnitude).toBe(0);
});

test("partial activity yields the rounded active/total ratio", () => {
  // active on 1 of 4 days -> 0.25.
  const days = fromActiveUsers([2, 0, 0, 0]);
  const stickiness = computeEngagementInsights(
    { dailyTotals: days, userMetrics: null },
    DEFAULT_INSIGHT_CONFIG,
  ).find((i) => i.id === STICKINESS_ID)!;
  expect(stickiness.detail!.activeDays).toBe(1);
  expect(stickiness.detail!.totalDays).toBe(4);
  expect(stickiness.magnitude).toBe(round2(0.25));
});

test("empty range presents stickiness as insufficient_data with no magnitude", () => {
  const stickiness = computeEngagementInsights(
    { dailyTotals: [], userMetrics: null },
    DEFAULT_INSIGHT_CONFIG,
  ).find((i) => i.id === STICKINESS_ID)!;
  expect(stickiness.status).toBe("insufficient_data");
  expect(stickiness.magnitude).toBeUndefined();
});
