/**
 * Feature: insights-section, Property 20: Anomaly flag threshold correctness and no false positives
 *
 * Property 20 (design.md): For all sub-period pairs with positive baselines and
 * any threshold, an activity-drop flag (for active_users or total_messages) and a
 * per-user cost-spike flag are present if and only if the computed
 * decrease/increase percentage is STRICTLY GREATER THAN the configured threshold;
 * a change exactly equal to the threshold produces no flag, and no flag is
 * produced when the metric did not decrease (resp. increase).
 *
 * Validates: Requirements 8.1, 8.2, 8.5
 *
 * Function under test: `computeAnomalyInsights({ dailyTotals, userMetrics }, config)`
 * from `lib/insights/anomalies.ts`.
 *
 *   - Activity-drop flags (org level): ids `anomalies-activity-drop-active_users`
 *     and `anomalies-activity-drop-total_messages`, status `"anomaly"`. The
 *     org-level metrics are aggregated over the two sub-periods via
 *     `splitAndAggregate`: `activeUsersPeak` = max `active_users` per half,
 *     `total_messages` = sum per half. The decrease percentage is
 *     `(baseline - current) / baseline * 100` and a flag is present iff that
 *     value is strictly greater than `config.activityDropThresholdPct`.
 *
 *   - Per-user cost-spike flag: id `anomalies-cost-spike-<userId>`, status
 *     `"anomaly"`. Built from `UserMetrics.daily_breakdown` split into the two
 *     sub-periods; credits-per-message is computed per half and the increase
 *     percentage `(cur - pre) / pre * 100` is flagged iff it is strictly greater
 *     than `config.costSpikeThresholdPct`.
 *
 * ## Oracle and the floating-point boundary
 *
 * The threshold comparison is the behavior under test, NOT the percentage
 * arithmetic (that is Property 2). So the oracle reuses the engine's own
 * `percentageChange` / `round2` helpers applied to the SAME baseline/current
 * operands, then INDEPENDENTLY applies the strict `>` rule and checks the
 * engine's observable output (the presence/absence, status, and magnitude of the
 * flag). This catches `>=`-vs-`>` mistakes, sign errors, wrong metric wiring, and
 * missing flags without coupling to the exact float value of a percentage.
 *
 * For the exact-equal boundary the test uses percentages that are EXACTLY
 * representable in IEEE-754 so `(baseline - current) / baseline * 100` is bit
 * exact and `threshold === computedPercentage` is a true equality. A 30% decrease
 * is deliberately AVOIDED because `(-30/100) * 100` evaluates to
 * `30.000000000000004`, not `30`; instead 50% (`baseline=100, current=50`) and
 * 25% (`baseline=100, current=75`) are used, where `0.5 * 100` and `0.25 * 100`
 * are exact. The cost-spike boundary likewise uses cpm values `1.0 -> 1.5`
 * (an exact 50% rise).
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeAnomalyInsights } from "../lib/insights/anomalies";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import { percentageChange, round2 } from "../lib/insights/math";
import { splitAndAggregate } from "../lib/insights/subperiods";
import type { DailyTotal, InsightConfig, UserMetrics } from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const ACTIVE_USERS_ID = "anomalies-activity-drop-active_users";
const TOTAL_MESSAGES_ID = "anomalies-activity-drop-total_messages";
const costSpikeId = (userId: string): string => `anomalies-cost-spike-${userId}`;

// A deterministic, unique, ordered date string for a given index. The engine
// never reads the date for these flags, so any unique ordered string works.
const dateFor = (i: number): string => `2024-01-${String(i + 1).padStart(4, "0")}`;

const nonNegInt = (max = 100000): fc.Arbitrary<number> => fc.nat({ max });

interface DayValues {
  total_messages: number;
  chat_conversations: number;
  credits_used: number;
  active_users: number;
}

const dayValuesArb = (): fc.Arbitrary<DayValues> =>
  fc.record({
    total_messages: nonNegInt(),
    chat_conversations: nonNegInt(),
    credits_used: nonNegInt(),
    active_users: nonNegInt(),
  });

const dayFrom = (i: number, v: DayValues): DailyTotal => ({ date: dateFor(i), ...v });

const makeDay = (
  i: number,
  partial: Partial<DayValues>,
): DailyTotal => ({
  date: dateFor(i),
  total_messages: 0,
  chat_conversations: 0,
  credits_used: 0,
  active_users: 0,
  ...partial,
});

/** A `UserMetrics` whose only meaningful field for anomalies is `daily_breakdown`. */
function makeUser(userId: string, dailyBreakdown: DailyTotal[]): UserMetrics {
  return {
    user_id: userId,
    label: `User ${userId}`,
    total_messages: 0,
    chat_conversations: 0,
    credits_used: 0,
    active_days: dailyBreakdown.length,
    model_messages: {},
    subscription_tier: "pro",
    adoption_score: 0,
    daily_breakdown: dailyBreakdown,
  };
}

const withConfig = (overrides: Partial<InsightConfig>): InsightConfig => ({
  ...DEFAULT_INSIGHT_CONFIG,
  ...overrides,
});

const thresholdArb = (): fc.Arbitrary<number> =>
  fc.double({ min: 0, max: 1000, noNaN: true });

// ── Property 20a: activity-drop iff decrease% strictly exceeds threshold ──────
//
// A range guaranteed to have POSITIVE org-level baselines: the first day (always
// in the `preceding` half, since floor(n/2) >= 1 for n >= 2) carries
// active_users >= 1 and total_messages >= 1, so the preceding peak active_users
// and summed total_messages are both > 0.

const positiveBaselineRange = (): fc.Arbitrary<DailyTotal[]> =>
  fc
    .record({
      seed: fc.record({
        total_messages: fc.integer({ min: 1, max: 100000 }),
        chat_conversations: nonNegInt(),
        credits_used: nonNegInt(),
        active_users: fc.integer({ min: 1, max: 100000 }),
      }),
      rest: fc.array(dayValuesArb(), { minLength: 1, maxLength: 13 }),
    })
    .map(({ seed, rest }) => {
      const days: DailyTotal[] = [dayFrom(0, seed)];
      rest.forEach((v, j) => days.push(dayFrom(j + 1, v)));
      return days;
    });

test("Property 20: activity-drop flags are present iff the decrease% strictly exceeds the threshold (both metrics)", () => {
  fc.assert(
    fc.property(positiveBaselineRange(), thresholdArb(), (days, threshold) => {
      const config = withConfig({ activityDropThresholdPct: threshold });
      const insights = computeAnomalyInsights(
        { dailyTotals: days, userMetrics: null },
        config,
      );

      const { preceding, current } = splitAndAggregate(days);

      // Both org-level baselines are guaranteed positive by the generator.
      const checks: Array<{ id: string; baseline: number; cur: number; key: string }> = [
        {
          id: ACTIVE_USERS_ID,
          baseline: preceding.activeUsersPeak,
          cur: current.activeUsersPeak,
          key: "active_users",
        },
        {
          id: TOTAL_MESSAGES_ID,
          baseline: preceding.totalMessages,
          cur: current.totalMessages,
          key: "total_messages",
        },
      ];

      for (const { id, baseline, cur, key } of checks) {
        expect(baseline).toBeGreaterThan(0); // generator guarantee
        const pct = percentageChange(cur, baseline);
        expect(pct).not.toBeNull();
        const decreasePct = -(pct as number);
        const expectedFlag = decreasePct > threshold;

        const insight = insights.find((i) => i.id === id);
        expect(!!insight).toBe(expectedFlag);

        if (expectedFlag) {
          expect(insight!.category).toBe("anomalies");
          expect(insight!.status).toBe("anomaly");
          expect(insight!.magnitude).toBe(round2(decreasePct));
          expect(insight!.detail!.metric).toBe(key);
          expect(insight!.detail!.baseline).toBe(baseline);
          expect(insight!.detail!.current).toBe(cur);
          expect(insight!.detail!.threshold).toBe(threshold);
          // A flagged decrease is strictly positive (no false positive on a rise).
          expect(decreasePct).toBeGreaterThan(0);
        }
      }
    }),
    { numRuns: RUNS },
  );
});

// ── Property 20b: per-user cost-spike iff increase% strictly exceeds threshold ─
//
// Each user gets a daily_breakdown of length >= 2 of non-negative integers, so
// both sub-periods are populated. The baseline credits-per-message is positive
// iff the preceding half has both positive messages and positive credits; the
// engine omits the flag otherwise (Requirement 8.4), which the oracle mirrors.

const userArb = (): fc.Arbitrary<UserMetrics> =>
  fc
    .array(dayValuesArb(), { minLength: 2, maxLength: 14 })
    .map((values) => values.map((v, i) => dayFrom(i, v)));

test("Property 20: per-user cost-spike flags are present iff the credits-per-message increase% strictly exceeds the threshold", () => {
  fc.assert(
    fc.property(
      fc.array(userArb(), { minLength: 1, maxLength: 8 }),
      thresholdArb(),
      (breakdowns, threshold) => {
        const users = breakdowns.map((bd, i) =>
          makeUser(`user-${String(i).padStart(3, "0")}`, bd),
        );
        const config = withConfig({ costSpikeThresholdPct: threshold });
        const insights = computeAnomalyInsights(
          { dailyTotals: [], userMetrics: users },
          config,
        );

        for (const user of users) {
          const { preceding, current } = splitAndAggregate(user.daily_breakdown);

          // Oracle for the baseline credits-per-message guard (Requirement 8.4).
          const baselineCpm =
            preceding.totalMessages > 0
              ? preceding.creditsUsed / preceding.totalMessages
              : null;

          const insight = insights.find((i) => i.id === costSpikeId(user.user_id));

          if (baselineCpm === null || baselineCpm <= 0) {
            // No meaningful baseline -> never a flag.
            expect(insight).toBeUndefined();
            continue;
          }

          const currentCpm =
            current.totalMessages > 0
              ? current.creditsUsed / current.totalMessages
              : 0;
          const pct = percentageChange(currentCpm, baselineCpm);
          expect(pct).not.toBeNull();
          const expectedFlag = (pct as number) > threshold;

          expect(!!insight).toBe(expectedFlag);
          if (expectedFlag) {
            expect(insight!.category).toBe("anomalies");
            expect(insight!.status).toBe("anomaly");
            expect(insight!.magnitude).toBe(round2(pct as number));
            expect(insight!.detail!.user_id).toBe(user.user_id);
          }
        }
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Exact-boundary example tests (deterministic) ─────────────────────────────
//
// These pin the strict-`>` semantics at an EXACTLY representable percentage. With
// a 2-day range the `preceding` half is [day0] and the `current` half is [day1],
// so the org-level baseline/current equal day0/day1 directly.

// active_users: 100 -> 50 is an exact 50% decrease ((-0.5) * 100 === -50).
function twoDayRange(
  baseline: Partial<DayValues>,
  current: Partial<DayValues>,
): DailyTotal[] {
  return [makeDay(0, baseline), makeDay(1, current)];
}

test("activity-drop: a decrease exactly equal to the threshold produces NO flag (50% == 50)", () => {
  const days = twoDayRange(
    { active_users: 100, total_messages: 100 },
    { active_users: 50, total_messages: 50 },
  );
  const insights = computeAnomalyInsights(
    { dailyTotals: days, userMetrics: null },
    withConfig({ activityDropThresholdPct: 50 }),
  );
  expect(insights.find((i) => i.id === ACTIVE_USERS_ID)).toBeUndefined();
  expect(insights.find((i) => i.id === TOTAL_MESSAGES_ID)).toBeUndefined();
});

test("activity-drop: a decrease strictly above the threshold produces a flag with the exact magnitude", () => {
  const days = twoDayRange(
    { active_users: 100, total_messages: 100 },
    { active_users: 50, total_messages: 50 },
  );
  const insights = computeAnomalyInsights(
    { dailyTotals: days, userMetrics: null },
    withConfig({ activityDropThresholdPct: 49 }),
  );
  const active = insights.find((i) => i.id === ACTIVE_USERS_ID);
  const messages = insights.find((i) => i.id === TOTAL_MESSAGES_ID);
  expect(active).toBeDefined();
  expect(active!.status).toBe("anomaly");
  expect(active!.magnitude).toBe(50);
  expect(messages).toBeDefined();
  expect(messages!.magnitude).toBe(50);
});

test("activity-drop: a decrease strictly below the threshold produces NO flag (25% < 30)", () => {
  // 100 -> 75 is an exact 25% decrease ((-0.25) * 100 === -25).
  const days = twoDayRange(
    { active_users: 100, total_messages: 100 },
    { active_users: 75, total_messages: 75 },
  );
  const insights = computeAnomalyInsights(
    { dailyTotals: days, userMetrics: null },
    withConfig({ activityDropThresholdPct: 30 }),
  );
  expect(insights.find((i) => i.id === ACTIVE_USERS_ID)).toBeUndefined();
  expect(insights.find((i) => i.id === TOTAL_MESSAGES_ID)).toBeUndefined();
});

test("activity-drop: no flag when the metric did not decrease (current >= baseline)", () => {
  // A rise (50 -> 80) and a flat case (60 -> 60) both yield no flag even at a 0% threshold.
  const rising = twoDayRange(
    { active_users: 50, total_messages: 50 },
    { active_users: 80, total_messages: 80 },
  );
  const flat = twoDayRange(
    { active_users: 60, total_messages: 60 },
    { active_users: 60, total_messages: 60 },
  );
  const cfg = withConfig({ activityDropThresholdPct: 0 });

  const risingInsights = computeAnomalyInsights(
    { dailyTotals: rising, userMetrics: null },
    cfg,
  );
  expect(risingInsights.find((i) => i.id === ACTIVE_USERS_ID)).toBeUndefined();
  expect(risingInsights.find((i) => i.id === TOTAL_MESSAGES_ID)).toBeUndefined();

  const flatInsights = computeAnomalyInsights(
    { dailyTotals: flat, userMetrics: null },
    cfg,
  );
  expect(flatInsights.find((i) => i.id === ACTIVE_USERS_ID)).toBeUndefined();
  expect(flatInsights.find((i) => i.id === TOTAL_MESSAGES_ID)).toBeUndefined();
});

// cost-spike: baseline cpm 1.0 (10 credits / 10 messages) -> current cpm 1.5
// (15 credits / 10 messages) is an exact 50% rise ((0.5) * 100 === 50).
const COST_SPIKE_USER = "user-000";

function costSpikeUser(
  baseline: Partial<DayValues>,
  current: Partial<DayValues>,
): UserMetrics {
  return makeUser(COST_SPIKE_USER, [makeDay(0, baseline), makeDay(1, current)]);
}

test("cost-spike: an increase exactly equal to the threshold produces NO flag (50% == 50)", () => {
  const user = costSpikeUser(
    { total_messages: 10, credits_used: 10 }, // cpm 1.0
    { total_messages: 10, credits_used: 15 }, // cpm 1.5
  );
  const insights = computeAnomalyInsights(
    { dailyTotals: [], userMetrics: [user] },
    withConfig({ costSpikeThresholdPct: 50 }),
  );
  expect(insights.find((i) => i.id === costSpikeId(COST_SPIKE_USER))).toBeUndefined();
});

test("cost-spike: an increase strictly above the threshold produces a flag with the exact magnitude", () => {
  const user = costSpikeUser(
    { total_messages: 10, credits_used: 10 }, // cpm 1.0
    { total_messages: 10, credits_used: 15 }, // cpm 1.5
  );
  const insights = computeAnomalyInsights(
    { dailyTotals: [], userMetrics: [user] },
    withConfig({ costSpikeThresholdPct: 49 }),
  );
  const flag = insights.find((i) => i.id === costSpikeId(COST_SPIKE_USER));
  expect(flag).toBeDefined();
  expect(flag!.status).toBe("anomaly");
  expect(flag!.magnitude).toBe(50);
});

test("cost-spike: no flag when credits-per-message did not increase (current <= baseline)", () => {
  // cpm 1.0 -> 0.5 is a decrease; no flag even at a 0% threshold.
  const user = costSpikeUser(
    { total_messages: 10, credits_used: 10 }, // cpm 1.0
    { total_messages: 10, credits_used: 5 }, // cpm 0.5
  );
  const insights = computeAnomalyInsights(
    { dailyTotals: [], userMetrics: [user] },
    withConfig({ costSpikeThresholdPct: 0 }),
  );
  expect(insights.find((i) => i.id === costSpikeId(COST_SPIKE_USER))).toBeUndefined();
});
