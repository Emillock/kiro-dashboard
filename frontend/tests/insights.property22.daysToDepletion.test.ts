/**
 * Feature: insights-section, Property 22: Days_To_Depletion correctness, bounds, and early-burner membership
 *
 * Property 22 (design.md): For all per-user daily credit series within a month
 * and a positive Allowance, cumulative credits_used is non-decreasing day over
 * day; `Days_To_Depletion` is the 1-based index of the first day on which
 * cumulative credits_used is greater than or equal to the Allowance and lies
 * between 1 and the number of days in the month inclusive; if the Allowance is
 * never reached the value is undefined and the user is excluded from the
 * early-burner insight; a user appears in the early-burner insight if and only if
 * a defined `Days_To_Depletion` is less than or equal to the configured threshold
 * (default 7, `config.earlyBurnerThresholdDays`).
 *
 * Validates: Requirements 9.2, 9.3, 9.4
 *
 * Functions under test:
 *   - `computeDaysToDepletion(dailyBreakdown, allowance, resetDay)` from
 *     `lib/insights/creditDepletion.ts` — the pure first-crossing helper.
 *   - `computeCreditDepletionInsights(input, config)` — emits the early-burner
 *     insight (id `creditDepletion-early-burner`) whose `detail.userIds` is the
 *     comma-joined list of qualifying user ids.
 *
 * ## Test construction
 *
 * Both layers are exercised with a CONTIGUOUS daily series of INTEGER
 * `credits_used` starting at a known Reset_Day (`2024-03-01`) with consecutive
 * calendar dates. Because the series starts exactly on the Reset_Day and is
 * contiguous, the engine's date-relative day index (`diffDays + 1`) equals the
 * position of the depletion day within the series, so the first-crossing 1-based
 * index is unambiguous. Series length is capped at 28 days so every date stays
 * inside March, keeping the bound the number-of-days-in-month.
 *
 * The oracle independently accumulates the integer series and finds the first
 * index whose running sum reaches the allowance; integer credits make the
 * `>= allowance` crossing exact (no floating-point boundary ambiguity).
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import {
  computeCreditDepletionInsights,
  computeDaysToDepletion,
  type CreditDepletionInput,
} from "../lib/insights/creditDepletion";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import type {
  AggregateMetrics,
  DailyTotal,
  UserMetrics,
} from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const RESET_DAY = "2024-03-01";
const MAX_DAYS = 28; // keep every date inside March (>= the month day-count bound)

/** Contiguous March date for a 0-based offset from the Reset_Day. */
const dateFor = (i: number): string => `2024-03-${String(i + 1).padStart(2, "0")}`;

/** Build a contiguous `DailyTotal[]` from a list of integer credits_used values. */
function seriesFrom(credits: number[]): DailyTotal[] {
  return credits.map((c, i) => ({
    date: dateFor(i),
    total_messages: 0,
    chat_conversations: 0,
    credits_used: c,
    active_users: 0,
  }));
}

/** Oracle: first 1-based index where the cumulative integer sum reaches allowance. */
function expectedDaysToDepletion(
  credits: number[],
  allowance: number,
): number | undefined {
  if (!(allowance > 0)) {
    return undefined;
  }
  let cumulative = 0;
  for (let i = 0; i < credits.length; i += 1) {
    cumulative += credits[i];
    if (cumulative >= allowance) {
      return i + 1; // 1-based
    }
  }
  return undefined;
}

// A non-empty contiguous series of non-negative integer credits.
const creditsSeries = (): fc.Arbitrary<number[]> =>
  fc.array(fc.nat({ max: 50 }), { minLength: 1, maxLength: MAX_DAYS });

const positiveAllowance = (): fc.Arbitrary<number> =>
  fc.integer({ min: 1, max: 400 });

// ── Property 22a: computeDaysToDepletion first-crossing, bounds, undefined ───

test("Property 22: computeDaysToDepletion equals the first-crossing 1-based index and is bounded", () => {
  fc.assert(
    fc.property(creditsSeries(), positiveAllowance(), (credits, allowance) => {
      const series = seriesFrom(credits);
      const actual = computeDaysToDepletion(series, allowance, RESET_DAY);
      const expected = expectedDaysToDepletion(credits, allowance);

      expect(actual).toBe(expected);

      if (expected === undefined) {
        // Allowance never reached -> undefined (Requirement 9.4).
        const cumulativeTotal = credits.reduce((a, b) => a + b, 0);
        expect(cumulativeTotal < allowance).toBe(true);
      } else {
        // Bounds: 1 <= Days_To_Depletion <= number of days (Requirement 9.2).
        expect(actual).toBeGreaterThanOrEqual(1);
        expect(actual).toBeLessThanOrEqual(series.length);
        expect(actual).toBeLessThanOrEqual(MAX_DAYS);
      }
    }),
    { numRuns: RUNS },
  );
});

test("Property 22: a non-positive allowance yields undefined (no fabricated value)", () => {
  fc.assert(
    fc.property(
      creditsSeries(),
      fc.integer({ min: -100, max: 0 }),
      (credits, allowance) => {
        const series = seriesFrom(credits);
        expect(computeDaysToDepletion(series, allowance, RESET_DAY)).toBeUndefined();
      },
    ),
    { numRuns: RUNS },
  );
});

test("Property 22: cumulative credits_used is non-decreasing day over day", () => {
  fc.assert(
    fc.property(creditsSeries(), (credits) => {
      // credits_used are non-negative, so the running cumulative never decreases.
      let cumulative = 0;
      for (const c of credits) {
        const next = cumulative + c;
        expect(next).toBeGreaterThanOrEqual(cumulative);
        cumulative = next;
      }
    }),
    { numRuns: RUNS },
  );
});

// ── Property 22b: early-burner membership via computeCreditDepletionInsights ─

interface UserSpec {
  credits: number[];
  allowance: number;
}

// Several users, each with their own contiguous series and a per-tier allowance.
const userSpecs = (): fc.Arbitrary<UserSpec[]> =>
  fc.array(
    fc.record({ credits: creditsSeries(), allowance: positiveAllowance() }),
    { minLength: 1, maxLength: 8 },
  );

function buildInput(specs: UserSpec[]): {
  input: CreditDepletionInput;
  userIds: string[];
} {
  const allowanceByTier: Record<string, number> = {};
  const userMetrics: UserMetrics[] = specs.map((spec, i) => {
    const tier = `tier${i}`;
    allowanceByTier[tier] = spec.allowance;
    return {
      user_id: `u${String(i).padStart(3, "0")}`,
      label: `User ${i}`,
      total_messages: 0,
      chat_conversations: 0,
      credits_used: spec.credits.reduce((a, b) => a + b, 0),
      active_days: spec.credits.length,
      model_messages: {},
      subscription_tier: tier,
      adoption_score: 0,
      daily_breakdown: seriesFrom(spec.credits),
    };
  });

  // Provide aggregate.start_date so deriveResetDay yields the March reset day.
  const aggregate: AggregateMetrics = {
    range: "month",
    start_date: RESET_DAY,
    end_date: dateFor(MAX_DAYS - 1),
    total_messages: 0,
    total_chat_conversations: 0,
    total_credits_used: 0,
    active_user_count: userMetrics.length,
    avg_messages_per_user: 0,
    avg_conversations_per_user: 0,
    model_distribution: {},
    daily_totals: [],
  };

  return {
    input: { range: "month", aggregate, userMetrics, allowanceByTier },
    userIds: userMetrics.map((u) => u.user_id),
  };
}

const earlyBurnerId = "creditDepletion-early-burner";

function earlyBurnerDetail(
  specs: UserSpec[],
  thresholdDays: number,
): { count: number; userIds: string } {
  const { input } = buildInput(specs);
  const config = { ...DEFAULT_INSIGHT_CONFIG, earlyBurnerThresholdDays: thresholdDays };
  const insights = computeCreditDepletionInsights(input, config);
  const burner = insights.find((i) => i.id === earlyBurnerId);
  expect(burner).toBeDefined();
  expect(burner?.status).toBe("ok");
  return {
    count: Number(burner?.detail?.count),
    userIds: String(burner?.detail?.userIds ?? ""),
  };
}

test("Property 22: a user is in the early-burner insight iff defined Days_To_Depletion <= threshold", () => {
  fc.assert(
    fc.property(userSpecs(), fc.integer({ min: 1, max: MAX_DAYS }), (specs, threshold) => {
      const { userIds } = buildInput(specs);

      // Oracle membership: defined dtd and <= threshold, ordered by (days, userId).
      const expectedMembers = specs
        .map((spec, i) => ({
          userId: userIds[i],
          dtd: expectedDaysToDepletion(spec.credits, spec.allowance),
        }))
        .filter((m) => m.dtd !== undefined && (m.dtd as number) <= threshold)
        .sort((a, b) => {
          const byDays = (a.dtd as number) - (b.dtd as number);
          if (byDays !== 0) return byDays;
          return a.userId < b.userId ? -1 : 1;
        })
        .map((m) => m.userId);

      const actual = earlyBurnerDetail(specs, threshold);
      const actualMembers = actual.userIds === "" ? [] : actual.userIds.split(",");

      expect(actualMembers).toEqual(expectedMembers);
      expect(actual.count).toBe(expectedMembers.length);

      // Excluded users: those never depleted are never present (Requirement 9.4).
      for (let i = 0; i < specs.length; i += 1) {
        const dtd = expectedDaysToDepletion(specs[i].credits, specs[i].allowance);
        if (dtd === undefined) {
          expect(actualMembers).not.toContain(userIds[i]);
        }
      }
    }),
    { numRuns: RUNS },
  );
});

test("Property 22: the default early-burner threshold is 7 days", () => {
  expect(DEFAULT_INSIGHT_CONFIG.earlyBurnerThresholdDays).toBe(7);

  fc.assert(
    fc.property(userSpecs(), (specs) => {
      const { userIds } = buildInput(specs);
      const expectedMembers = specs
        .map((spec, i) => ({
          userId: userIds[i],
          dtd: expectedDaysToDepletion(spec.credits, spec.allowance),
        }))
        .filter((m) => m.dtd !== undefined && (m.dtd as number) <= 7)
        .map((m) => m.userId);

      const actual = earlyBurnerDetail(specs, 7);
      const actualMembers = actual.userIds === "" ? [] : actual.userIds.split(",");
      // Order-independent membership check for the default-threshold case.
      expect([...actualMembers].sort()).toEqual([...expectedMembers].sort());
    }),
    { numRuns: RUNS },
  );
});
