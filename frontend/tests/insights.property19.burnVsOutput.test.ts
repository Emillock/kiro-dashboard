/**
 * Feature: insights-section, Property 19: Burn-vs-output warning trigger correctness
 *
 * Property 19 (design.md): For all sub-period pairs with positive credits_used
 * and total_messages baselines, the burn-vs-output warning is present if and
 * only if the credits_used growth rate exceeds the total_messages growth rate.
 *
 * Validates: Requirements 7.4, 7.6
 *
 * Function under test: `computeCostEfficiencyInsights({ dailyTotals, userMetrics:
 * null }, config)` from lib/insights/costEfficiency.ts. The burn-vs-output
 * insight has id `costEfficiency-burn-vs-output`. The implementation:
 *
 *   - splits the daily totals into a preceding half (first floor(n/2) days) and
 *     a current half (the rest) via `splitAndAggregate`, summing `total_messages`
 *     and `credits_used` across each half;
 *   - computes `growthRate(currentCredits, precedingCredits)` and
 *     `growthRate(currentMessages, precedingMessages)`;
 *   - when either growth rate is `null` (a preceding baseline that is zero or
 *     negative), emits `insufficient_data` (Requirement 7.6);
 *   - otherwise emits `anomaly` (warning present) when creditsGrowth >
 *     messagesGrowth, else `ok` (no warning) — Requirement 7.4.
 *
 * ## Determinism note
 *
 * The test reuses the SAME `growthRate` helper from lib/insights/math as the
 * oracle, applied to the SAME integer sums divided in the SAME order, so the
 * engine and the oracle cannot diverge on the comparison. Inputs are constrained
 * to INTEGER non-negative values. The split is made deterministic by choosing the
 * current-half length to be either equal to the preceding length or one greater,
 * so `floor(n/2)` lands exactly the generated preceding days in the preceding
 * half.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeCostEfficiencyInsights } from "../lib/insights/costEfficiency";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import { growthRate } from "../lib/insights/math";
import type { DailyTotal, Insight } from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const BURN_ID = "costEfficiency-burn-vs-output";

// A deterministic, unique, ordered date string for a given index. The
// burn-vs-output computation does not use dates, so any unique string works.
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

// ── Oracle helpers (independent of the engine, sharing only `growthRate`) ────

function sumField(days: DailyTotal[], key: keyof DailyValues): number {
  return days.reduce((acc, d) => acc + (d[key] as number), 0);
}

/**
 * Build a range whose preceding half is exactly `precedingDays` and whose current
 * half is exactly `currentDays`. Choosing the current length to be the preceding
 * length or one greater guarantees `floor(n/2) === precedingDays.length`, so
 * `splitAndAggregate` reproduces this exact split.
 */
function buildRange(
  precedingDays: DailyValues[],
  currentDays: DailyValues[],
): DailyTotal[] {
  const days: DailyTotal[] = [];
  precedingDays.forEach((v, i) => days.push(dayFrom(i, v)));
  currentDays.forEach((v, j) => days.push(dayFrom(precedingDays.length + j, v)));
  return days;
}

/**
 * Generator producing a (preceding, current) day pair where the preceding half
 * has STRICTLY POSITIVE baselines for BOTH credits_used and total_messages: a
 * seed preceding day carries `credits_used >= 1` and `total_messages >= 1`, so
 * both preceding sums are positive regardless of the remaining days.
 *
 * The current length is constrained to `p` or `p + 1` (p = preceding length) so
 * the engine's `floor(n/2)` split matches the constructed split exactly.
 */
const positiveBaselineRange = (): fc.Arbitrary<DailyTotal[]> =>
  fc
    .record({
      seedCredits: fc.integer({ min: 1, max: 100000 }),
      seedMessages: fc.integer({ min: 1, max: 100000 }),
      seedActive: nonNegInt(),
      seedConversations: nonNegInt(),
      precedingRest: fc.array(dailyValues(), { minLength: 0, maxLength: 10 }),
      oddMiddle: fc.boolean(),
      currentVals: fc.array(dailyValues(), { minLength: 11, maxLength: 11 }),
    })
    .map(
      ({
        seedCredits,
        seedMessages,
        seedActive,
        seedConversations,
        precedingRest,
        oddMiddle,
        currentVals,
      }) => {
        const precedingDays: DailyValues[] = [
          {
            total_messages: seedMessages,
            chat_conversations: seedConversations,
            credits_used: seedCredits,
            active_users: seedActive,
          },
          ...precedingRest,
        ];
        const p = precedingDays.length;
        const c = oddMiddle ? p + 1 : p;
        const currentDays = currentVals.slice(0, c);
        return buildRange(precedingDays, currentDays);
      },
    );

// ── Property 19a: trigger correctness on positive baselines ──────────────────
//
// When both preceding baselines are positive, both growth rates are defined and
// the warning (status "anomaly") is present iff creditsGrowth > messagesGrowth;
// otherwise the insight is "ok" with no warning.

test("Property 19: burn-vs-output warning is present iff credits growth exceeds messages growth", () => {
  fc.assert(
    fc.property(positiveBaselineRange(), (days) => {
      const insights = computeCostEfficiencyInsights(
        { dailyTotals: days, userMetrics: null },
        DEFAULT_INSIGHT_CONFIG,
      );
      const burn = findInsight(insights, BURN_ID);
      expect(burn).toBeDefined();

      // Independently reproduce the engine's split: first floor(n/2) days are
      // the preceding half, the rest are the current half.
      const mid = Math.floor(days.length / 2);
      const preceding = days.slice(0, mid);
      const current = days.slice(mid);

      const preCredits = sumField(preceding, "credits_used");
      const preMessages = sumField(preceding, "total_messages");
      const curCredits = sumField(current, "credits_used");
      const curMessages = sumField(current, "total_messages");

      // Generator guarantees positive preceding baselines.
      expect(preCredits).toBeGreaterThan(0);
      expect(preMessages).toBeGreaterThan(0);

      const creditsGrowth = growthRate(curCredits, preCredits);
      const messagesGrowth = growthRate(curMessages, preMessages);
      expect(creditsGrowth).not.toBeNull();
      expect(messagesGrowth).not.toBeNull();

      const warningExpected = (creditsGrowth as number) > (messagesGrowth as number);

      if (warningExpected) {
        // Warning present.
        expect(burn!.status).toBe("anomaly");
      } else {
        // No warning.
        expect(burn!.status).toBe("ok");
        expect(burn!.status).not.toBe("insufficient_data");
      }
    }),
    { numRuns: RUNS },
  );
});

// ── Property 19b: zero/negative preceding baseline -> insufficient_data ──────
//
// Requirement 7.6: if the preceding baseline for credits_used OR total_messages
// is zero or negative, the burn-vs-output insight is insufficient_data and
// carries no fabricated magnitude. Non-negative integer inputs mean a zero sum
// is the zero-baseline case.

test("Property 19: a zero preceding baseline yields insufficient_data with no magnitude", () => {
  fc.assert(
    fc.property(
      // p preceding days, each forced to have a zero baseline on at least one of
      // the two metrics; `whichZero` selects which metric(s) are zeroed.
      fc.integer({ min: 1, max: 10 }),
      fc.boolean(), // odd middle day goes to current
      fc.constantFrom("credits", "messages", "both"),
      fc.array(dailyValues(), { minLength: 0, maxLength: 10 }),
      fc.array(dailyValues(), { minLength: 11, maxLength: 11 }),
      (p, oddMiddle, whichZero, precedingRest, currentVals) => {
        // Build p preceding days; zero out the chosen metric on EVERY preceding
        // day so the corresponding preceding sum is exactly 0.
        const precedingDays: DailyValues[] = [];
        for (let i = 0; i < p; i++) {
          const base = precedingRest[i] ?? {
            total_messages: 0,
            chat_conversations: 0,
            credits_used: 0,
            active_users: 0,
          };
          precedingDays.push({
            ...base,
            credits_used:
              whichZero === "credits" || whichZero === "both"
                ? 0
                : base.credits_used,
            total_messages:
              whichZero === "messages" || whichZero === "both"
                ? 0
                : base.total_messages,
          });
        }
        const c = oddMiddle ? p + 1 : p;
        const currentDays = currentVals.slice(0, c);
        const days = buildRange(precedingDays, currentDays);

        const insights = computeCostEfficiencyInsights(
          { dailyTotals: days, userMetrics: null },
          DEFAULT_INSIGHT_CONFIG,
        );
        const burn = findInsight(insights, BURN_ID);
        expect(burn).toBeDefined();
        expect(burn!.status).toBe("insufficient_data");
        expect(burn!.magnitude).toBeUndefined();
        expect(burn).not.toHaveProperty("magnitude");
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("warning fires when credits outpace messages (credits +100% vs messages +0%)", () => {
  // preceding: credits 10, messages 10 ; current: credits 20, messages 10
  // creditsGrowth = 1.0, messagesGrowth = 0.0 -> warning present.
  const days: DailyTotal[] = [
    { date: dateFor(0), total_messages: 10, chat_conversations: 0, credits_used: 10, active_users: 1 },
    { date: dateFor(1), total_messages: 10, chat_conversations: 0, credits_used: 20, active_users: 1 },
  ];
  const insights = computeCostEfficiencyInsights(
    { dailyTotals: days, userMetrics: null },
    DEFAULT_INSIGHT_CONFIG,
  );
  const burn = findInsight(insights, BURN_ID);
  expect(burn!.status).toBe("anomaly");
});

test("no warning when messages outpace credits (credits +0% vs messages +100%)", () => {
  // preceding: credits 10, messages 10 ; current: credits 10, messages 20
  // creditsGrowth = 0.0, messagesGrowth = 1.0 -> no warning (ok).
  const days: DailyTotal[] = [
    { date: dateFor(0), total_messages: 10, chat_conversations: 0, credits_used: 10, active_users: 1 },
    { date: dateFor(1), total_messages: 20, chat_conversations: 0, credits_used: 10, active_users: 1 },
  ];
  const insights = computeCostEfficiencyInsights(
    { dailyTotals: days, userMetrics: null },
    DEFAULT_INSIGHT_CONFIG,
  );
  const burn = findInsight(insights, BURN_ID);
  expect(burn!.status).toBe("ok");
});

test("equal growth produces no warning (credits +50% == messages +50%)", () => {
  // preceding: credits 10, messages 10 ; current: credits 15, messages 15
  // creditsGrowth = messagesGrowth = 0.5 -> not strictly greater -> ok.
  const days: DailyTotal[] = [
    { date: dateFor(0), total_messages: 10, chat_conversations: 0, credits_used: 10, active_users: 1 },
    { date: dateFor(1), total_messages: 15, chat_conversations: 0, credits_used: 15, active_users: 1 },
  ];
  const insights = computeCostEfficiencyInsights(
    { dailyTotals: days, userMetrics: null },
    DEFAULT_INSIGHT_CONFIG,
  );
  const burn = findInsight(insights, BURN_ID);
  expect(burn!.status).toBe("ok");
});

test("zero preceding credits baseline yields insufficient_data", () => {
  const days: DailyTotal[] = [
    { date: dateFor(0), total_messages: 10, chat_conversations: 0, credits_used: 0, active_users: 1 },
    { date: dateFor(1), total_messages: 10, chat_conversations: 0, credits_used: 20, active_users: 1 },
  ];
  const insights = computeCostEfficiencyInsights(
    { dailyTotals: days, userMetrics: null },
    DEFAULT_INSIGHT_CONFIG,
  );
  const burn = findInsight(insights, BURN_ID);
  expect(burn!.status).toBe("insufficient_data");
  expect(burn!.magnitude).toBeUndefined();
});
