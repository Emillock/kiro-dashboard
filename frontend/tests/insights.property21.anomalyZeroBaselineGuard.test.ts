/**
 * Feature: insights-section, Property 21: Anomaly guard on zero baselines and insufficient sub-periods
 *
 * Property 21 (design.md): For all inputs where the baseline sub-period has zero
 * active_users, zero total_messages, zero output for the evaluated user, or where
 * fewer than two sub-periods exist, NO anomaly flag derived from that comparison
 * is produced.
 *
 * Validates: Requirements 8.4
 *
 * Function under test: `computeAnomalyInsights({ dailyTotals, userMetrics }, config)`
 * from `lib/insights/anomalies.ts`.
 *
 *   - Activity-drop flag ids: `anomalies-activity-drop-active_users`,
 *     `anomalies-activity-drop-total_messages`.
 *   - Per-user cost-spike flag id: `anomalies-cost-spike-<userId>`.
 *
 * ## Split semantics mirrored by the generators
 *
 * The engine derives the two sub-periods via `splitAndAggregate` ->
 * `splitRange`: for a list of length `n`, `preceding` receives the first
 * `floor(n / 2)` days and `current` the remaining `ceil(n / 2)`. To control the
 * baseline (preceding) half exactly, the generators emit a `preceding` list of
 * length `p >= 1` and a `current` list of length `p` or `p + 1`; in both cases
 * `floor(n / 2) === p`, so the first `p` days are exactly the `preceding` half.
 * This lets a test force the targeted baseline metric to zero while leaving the
 * `current` half non-zero, then assert the corresponding flag is ABSENT.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeAnomalyInsights } from "../lib/insights/anomalies";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
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

const makeDay = (i: number, partial: Partial<DayValues>): DailyTotal => ({
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
    overage_cap: 0,
    overage_credits_used: 0,
  };
}

const withConfig = (overrides: Partial<InsightConfig>): InsightConfig => ({
  ...DEFAULT_INSIGHT_CONFIG,
  ...overrides,
});

// Vary the threshold across the full configurable range (incl. 0) to prove the
// guard holds independently of the threshold (Requirement 8.4 takes precedence
// over the threshold comparison of 8.1/8.2).
const thresholdArb = (): fc.Arbitrary<number> =>
  fc.double({ min: 0, max: 1000, noNaN: true });

/**
 * Emit a `preceding`/`current` split whose first `p` days are exactly the
 * `preceding` half under `splitRange`. `preceding` has length `p >= 1` and
 * `current` has length `p` or `p + 1`, so `floor((p + c) / 2) === p`.
 */
const splitArb = (): fc.Arbitrary<{ preceding: DayValues[]; current: DayValues[] }> =>
  fc
    .integer({ min: 1, max: 7 })
    .chain((p) =>
      fc.record({
        preceding: fc.array(dayValuesArb(), { minLength: p, maxLength: p }),
        current: fc.boolean().chain((extra) =>
          fc.array(dayValuesArb(), {
            minLength: extra ? p + 1 : p,
            maxLength: extra ? p + 1 : p,
          }),
        ),
      }),
    );

/** Build a `DailyTotal[]` range from a preceding/current split. */
function buildRange(
  preceding: DayValues[],
  current: DayValues[],
): DailyTotal[] {
  const days: DailyTotal[] = [];
  preceding.forEach((v, i) => days.push(dayFrom(i, v)));
  current.forEach((v, j) => days.push(dayFrom(preceding.length + j, v)));
  return days;
}

// ── Property 21a: fewer than two days -> no activity-drop flags ───────────────

test("Property 21: fewer than two daily totals produces no activity-drop flags", () => {
  fc.assert(
    fc.property(
      fc.array(dayValuesArb(), { minLength: 0, maxLength: 1 }),
      thresholdArb(),
      (values, threshold) => {
        const days = values.map((v, i) => dayFrom(i, v));
        const insights = computeAnomalyInsights(
          { dailyTotals: days, userMetrics: null },
          withConfig({ activityDropThresholdPct: threshold }),
        );
        expect(insights.find((i) => i.id === ACTIVE_USERS_ID)).toBeUndefined();
        expect(insights.find((i) => i.id === TOTAL_MESSAGES_ID)).toBeUndefined();
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Property 21b: zero active_users baseline -> no active_users drop flag ──────

test("Property 21: a preceding sub-period with zero active_users yields no active_users drop flag", () => {
  fc.assert(
    fc.property(splitArb(), thresholdArb(), ({ preceding, current }, threshold) => {
      // Force the baseline (preceding) active_users to 0 on every preceding day,
      // so the aggregated baseline peak is 0 (zero denominator, Requirement 8.4).
      const precedingZero = preceding.map((v) => ({ ...v, active_users: 0 }));
      const days = buildRange(precedingZero, current);

      // Generator + transform guarantee the baseline peak is exactly zero.
      expect(splitAndAggregate(days).preceding.activeUsersPeak).toBe(0);

      const insights = computeAnomalyInsights(
        { dailyTotals: days, userMetrics: null },
        withConfig({ activityDropThresholdPct: threshold }),
      );
      expect(insights.find((i) => i.id === ACTIVE_USERS_ID)).toBeUndefined();
    }),
    { numRuns: RUNS },
  );
});

// ── Property 21c: zero total_messages baseline -> no total_messages drop flag ─

test("Property 21: a preceding sub-period with zero total_messages yields no total_messages drop flag", () => {
  fc.assert(
    fc.property(splitArb(), thresholdArb(), ({ preceding, current }, threshold) => {
      const precedingZero = preceding.map((v) => ({ ...v, total_messages: 0 }));
      const days = buildRange(precedingZero, current);

      expect(splitAndAggregate(days).preceding.totalMessages).toBe(0);

      const insights = computeAnomalyInsights(
        { dailyTotals: days, userMetrics: null },
        withConfig({ activityDropThresholdPct: threshold }),
      );
      expect(insights.find((i) => i.id === TOTAL_MESSAGES_ID)).toBeUndefined();
    }),
    { numRuns: RUNS },
  );
});

// ── Property 21d: per-user zero message output baseline -> no cost-spike flag ─

test("Property 21: a user whose preceding sub-period has zero total_messages yields no cost-spike flag", () => {
  fc.assert(
    fc.property(
      fc.array(splitArb(), { minLength: 1, maxLength: 6 }),
      thresholdArb(),
      (splits, threshold) => {
        const users = splits.map(({ preceding, current }, i) => {
          // Zero message output in the baseline half => baseline credits-per-message
          // is undefined (zero denominator, Requirement 8.4).
          const precedingZero = preceding.map((v) => ({ ...v, total_messages: 0 }));
          const breakdown = buildRange(precedingZero, current);
          return makeUser(`user-${String(i).padStart(3, "0")}`, breakdown);
        });

        const insights = computeAnomalyInsights(
          { dailyTotals: [], userMetrics: users },
          withConfig({ costSpikeThresholdPct: threshold }),
        );

        for (const user of users) {
          // Generator guarantees the baseline half has zero messages.
          expect(splitAndAggregate(user.daily_breakdown).preceding.totalMessages).toBe(0);
          expect(insights.find((i) => i.id === costSpikeId(user.user_id))).toBeUndefined();
        }
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Property 21e: per-user fewer than two days -> no cost-spike flag ──────────

test("Property 21: a user with fewer than two daily-breakdown entries yields no cost-spike flag", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.array(dayValuesArb(), { minLength: 0, maxLength: 1 }),
        { minLength: 1, maxLength: 6 },
      ),
      thresholdArb(),
      (breakdowns, threshold) => {
        const users = breakdowns.map((values, i) =>
          makeUser(
            `user-${String(i).padStart(3, "0")}`,
            values.map((v, j) => dayFrom(j, v)),
          ),
        );

        const insights = computeAnomalyInsights(
          { dailyTotals: [], userMetrics: users },
          withConfig({ costSpikeThresholdPct: threshold }),
        );

        for (const user of users) {
          expect(insights.find((i) => i.id === costSpikeId(user.user_id))).toBeUndefined();
        }
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Deterministic boundary examples ───────────────────────────────────────────
//
// With a 2-day range the preceding half is [day0] and the current half is [day1].

test("activity-drop: zero baseline produces no flag even when the current half is large", () => {
  // Baseline metrics are zero; current half is non-zero. No flag for either metric.
  const days = [
    makeDay(0, { active_users: 0, total_messages: 0, credits_used: 5 }),
    makeDay(1, { active_users: 999, total_messages: 999, credits_used: 5 }),
  ];
  const insights = computeAnomalyInsights(
    { dailyTotals: days, userMetrics: null },
    withConfig({ activityDropThresholdPct: 0 }),
  );
  expect(insights.find((i) => i.id === ACTIVE_USERS_ID)).toBeUndefined();
  expect(insights.find((i) => i.id === TOTAL_MESSAGES_ID)).toBeUndefined();
});

test("activity-drop: a single day produces no activity-drop flags", () => {
  const days = [makeDay(0, { active_users: 100, total_messages: 100 })];
  const insights = computeAnomalyInsights(
    { dailyTotals: days, userMetrics: null },
    withConfig({ activityDropThresholdPct: 0 }),
  );
  expect(insights.find((i) => i.id === ACTIVE_USERS_ID)).toBeUndefined();
  expect(insights.find((i) => i.id === TOTAL_MESSAGES_ID)).toBeUndefined();
});

test("cost-spike: zero message output in the baseline half produces no flag", () => {
  // Preceding half has 0 messages (baseline cpm undefined); current half spends credits.
  const user = makeUser("user-000", [
    makeDay(0, { total_messages: 0, credits_used: 50 }),
    makeDay(1, { total_messages: 10, credits_used: 500 }),
  ]);
  const insights = computeAnomalyInsights(
    { dailyTotals: [], userMetrics: [user] },
    withConfig({ costSpikeThresholdPct: 0 }),
  );
  expect(insights.find((i) => i.id === costSpikeId("user-000"))).toBeUndefined();
});

test("cost-spike: a single daily-breakdown entry produces no flag", () => {
  const user = makeUser("user-000", [makeDay(0, { total_messages: 10, credits_used: 100 })]);
  const insights = computeAnomalyInsights(
    { dailyTotals: [], userMetrics: [user] },
    withConfig({ costSpikeThresholdPct: 0 }),
  );
  expect(insights.find((i) => i.id === costSpikeId("user-000"))).toBeUndefined();
});
