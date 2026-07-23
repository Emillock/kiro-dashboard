/**
 * Feature: insights-section, Property 26: Burn-rate projection ordering and indeterminacy
 *
 * Property 26 (design.md): For all not-yet-depleted users with a positive
 * Allowance, a higher daily burn rate relative to the SAME remaining balance
 * yields an earlier-or-equal projected depletion date; a user with zero
 * trailing-window consumption has an indeterminate projection with no projected
 * depletion date.
 *
 * Validates: Requirements 10.2, 10.7
 *
 * ## Functions under test
 *
 *   - `projectDepletionDate(remaining, dailyRate, fromDate)` from
 *     `lib/insights/creditDepletion.ts` — the pure projection helper. Returns
 *     `fromDate` advanced by `remaining / dailyRate` days, or `null`
 *     (indeterminate) when `dailyRate <= 0` (Requirement 10.7) or any input is
 *     non-finite.
 *   - `computeCreditDepletionInsights(input, config)` — emits the burn-rate
 *     projection insight (id `creditDepletion-burn-rate-projection`) whose
 *     `detail.indeterminate` counts not-yet-depleted users with zero
 *     trailing-window consumption (Requirement 10.7) and whose `detail.projected`
 *     counts those with a positive rate and a projected date (Requirement 10.2).
 *
 * ## Determinism notes
 *
 * - Ordering: the projection offset `remaining / dailyRate` decreases
 *   monotonically as `dailyRate` grows for a fixed `remaining > 0` and
 *   `fromDate`, so a higher rate maps to an earlier-or-equal instant. The helper
 *   formats the instant to a `YYYY-MM-DD` calendar date, so the general property
 *   asserts earlier-OR-equal (two close instants can land on the same calendar
 *   day). A dedicated STRICT case constructs rates/remaining whose offsets differ
 *   by at least two whole days, which guarantees distinct calendar days and hence
 *   a strictly earlier date for the higher rate.
 * - Inputs are constrained to keep the projected year well within four digits, so
 *   `YYYY-MM-DD` strings stay fixed-width and compare correctly when parsed to
 *   UTC epochs.
 * - Engine-level: zero-consumption daily series produce a trailing rate of exactly
 *   0, so the engine routes them to the indeterminate branch with no projected
 *   date; positive integer series with cumulative below the Allowance stay
 *   not-yet-depleted with a positive rate, so they are projected.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import {
  computeCreditDepletionInsights,
  projectDepletionDate,
  type CreditDepletionInput,
} from "../lib/insights/creditDepletion";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import type {
  AggregateMetrics,
  DailyTotal,
  Insight,
  UserMetrics,
} from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const PROJECTION_ID = "creditDepletion-burn-rate-projection";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a `YYYY-MM-DD` produced by the helper into a UTC epoch (ms). */
function toMs(dateStr: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  expect(m).not.toBeNull();
  return Date.UTC(Number(m![1]), Number(m![2]) - 1, Number(m![3]));
}

/**
 * A valid `YYYY-MM-DD` anchor date. Year/month/day are constrained so every date
 * is well-formed (days 1..28) and the projected result stays within four-digit
 * years even after large offsets.
 */
const fromDateArb = (): fc.Arbitrary<string> =>
  fc
    .record({
      y: fc.integer({ min: 2000, max: 2100 }),
      mo: fc.integer({ min: 1, max: 12 }),
      d: fc.integer({ min: 1, max: 28 }),
    })
    .map(
      ({ y, mo, d }) =>
        `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    );

// ── Property 26a: ordering / monotonicity (earlier-or-equal) ─────────────────

test("Property 26: a higher burn rate yields an earlier-or-equal projected date for the same remaining balance", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 1_000_000 }), // remaining > 0
      fc.integer({ min: 1, max: 10_000 }), // r1 >= 1
      fc.integer({ min: 1, max: 10_000 }), // r2 >= 1
      fromDateArb(),
      (remaining, ra, rb, fromDate) => {
        const r1 = Math.min(ra, rb);
        const r2 = Math.max(ra, rb); // r1 <= r2, both > 0

        const dLow = projectDepletionDate(remaining, r1, fromDate);
        const dHigh = projectDepletionDate(remaining, r2, fromDate);

        // Both rates are positive and inputs finite -> both projections defined.
        expect(dLow).not.toBeNull();
        expect(dHigh).not.toBeNull();

        // Higher rate (r2) depletes sooner: earlier-or-equal calendar date.
        expect(toMs(dHigh as string)).toBeLessThanOrEqual(toMs(dLow as string));
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Property 26b: STRICT ordering when offsets differ by >= 2 whole days ─────

test("Property 26: a strictly higher burn rate yields a strictly earlier date when offsets differ by more than a day", () => {
  fc.assert(
    fc.property(
      // remaining large enough that remaining*(1 - 1/r2) >= 2 days for r2 >= 2.
      fc.integer({ min: 100, max: 1_000_000 }),
      fc.integer({ min: 2, max: 365 }), // r2 >= 2 (strictly greater than r1 = 1)
      fromDateArb(),
      (remaining, r2, fromDate) => {
        const r1 = 1; // r1 < r2
        // Offset difference in days: remaining/1 - remaining/r2 = remaining*(r2-1)/r2.
        // For r2 >= 2 and remaining >= 100 this is >= 50 days -> distinct days.
        const offsetDiffDays = remaining - remaining / r2;
        expect(offsetDiffDays).toBeGreaterThan(1);

        const dLow = projectDepletionDate(remaining, r1, fromDate);
        const dHigh = projectDepletionDate(remaining, r2, fromDate);

        expect(dLow).not.toBeNull();
        expect(dHigh).not.toBeNull();
        // Strictly earlier because the instants are at least two days apart.
        expect(toMs(dHigh as string)).toBeLessThan(toMs(dLow as string));
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Property 26c: indeterminacy for non-positive rates (Requirement 10.7) ────

test("Property 26: a non-positive daily rate (including zero) yields no projected date", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -1_000_000, max: 1_000_000 }),
      fc.integer({ min: -10_000, max: 0 }), // dailyRate <= 0
      fromDateArb(),
      (remaining, dailyRate, fromDate) => {
        expect(projectDepletionDate(remaining, dailyRate, fromDate)).toBeNull();
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Property 26d: indeterminacy for non-finite inputs ────────────────────────

test("Property 26: non-finite remaining or rate yields no projected date", () => {
  const nonFinite = fc.constantFrom(
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  );
  fc.assert(
    fc.property(
      nonFinite,
      fc.integer({ min: 1, max: 10_000 }),
      fromDateArb(),
      (remaining, rate, fromDate) => {
        // Non-finite remaining -> null even with a positive rate.
        expect(projectDepletionDate(remaining, rate, fromDate)).toBeNull();
      },
    ),
    { numRuns: RUNS },
  );

  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1_000_000 }),
      nonFinite,
      fromDateArb(),
      (remaining, rate, fromDate) => {
        // Non-finite rate -> null.
        expect(projectDepletionDate(remaining, rate, fromDate)).toBeNull();
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases for the helper ──────────────────────────────────

test("projectDepletionDate advances fromDate by remaining/dailyRate whole days", () => {
  // 100 remaining at 10/day -> 10 days after 2024-03-01 -> 2024-03-11.
  expect(projectDepletionDate(100, 10, "2024-03-01")).toBe("2024-03-11");
  // 0 remaining -> same day (already depleted boundary), still a defined date.
  expect(projectDepletionDate(0, 10, "2024-03-01")).toBe("2024-03-01");
});

test("projectDepletionDate returns null for a malformed anchor date", () => {
  expect(projectDepletionDate(100, 10, "not-a-date")).toBeNull();
});

// ── Property 26e: engine-level indeterminate vs projected accounting ─────────

const RESET_DAY = "2024-03-01";
const dateFor = (i: number): string =>
  `2024-03-${String(i + 1).padStart(2, "0")}`;

/** Build a contiguous March `DailyTotal[]` from integer credits_used values. */
function seriesFrom(credits: number[]): DailyTotal[] {
  return credits.map((c, i) => ({
    date: dateFor(i),
    total_messages: 0,
    chat_conversations: 0,
    credits_used: c,
    active_users: 0,
  }));
}

function makeUser(
  userId: string,
  tier: string,
  credits: number[],
): UserMetrics {
  return {
    user_id: userId,
    label: `User ${userId}`,
    total_messages: 0,
    chat_conversations: 0,
    credits_used: credits.reduce((a, b) => a + b, 0),
    active_days: credits.length,
    model_messages: {},
    subscription_tier: tier,
    adoption_score: 0,
    daily_breakdown: seriesFrom(credits),
    overage_cap: 0,
    overage_credits_used: 0,
  };
}

function aggregateWithStart(): AggregateMetrics {
  return {
    range: "month",
    start_date: RESET_DAY,
    end_date: dateFor(27),
    total_messages: 0,
    total_chat_conversations: 0,
    total_credits_used: 0,
    active_user_count: 0,
    avg_messages_per_user: 0,
    avg_conversations_per_user: 0,
    model_distribution: {},
    daily_totals: [],
  };
}

function getProjection(insights: Insight[]): Insight | undefined {
  return insights.find((i) => i.id === PROJECTION_ID);
}

// Generators for the two kinds of not-yet-depleted user (allowance fixed > sums).
const ALLOWANCE = 1000;

// Zero trailing-window consumption -> indeterminate (Requirement 10.7).
const zeroSeries = (): fc.Arbitrary<number[]> =>
  fc.array(fc.constant(0), { minLength: 1, maxLength: 10 });

// Positive integer series with cumulative well below ALLOWANCE -> projected.
const positiveSeries = (): fc.Arbitrary<number[]> =>
  fc
    .array(fc.nat({ max: 5 }), { minLength: 1, maxLength: 10 })
    .map((xs) => {
      const out = [...xs];
      out[0] += 1; // guarantee a positive trailing rate
      return out; // max sum <= 5*10 + 1 = 51 < ALLOWANCE
    });

test("Property 26: the engine counts zero-consumption users as indeterminate and positive-rate users as projected", () => {
  fc.assert(
    fc.property(
      fc.array(zeroSeries(), { minLength: 0, maxLength: 6 }),
      fc.array(positiveSeries(), { minLength: 0, maxLength: 6 }),
      (zeroUsers, positiveUsers) => {
        const allowanceByTier: Record<string, number> = {};
        const users: UserMetrics[] = [];

        zeroUsers.forEach((credits, i) => {
          const tier = `z${i}`;
          allowanceByTier[tier] = ALLOWANCE;
          users.push(makeUser(`z${String(i).padStart(3, "0")}`, tier, credits));
        });
        positiveUsers.forEach((credits, i) => {
          const tier = `p${i}`;
          allowanceByTier[tier] = ALLOWANCE;
          users.push(makeUser(`p${String(i).padStart(3, "0")}`, tier, credits));
        });

        const input: CreditDepletionInput = {
          range: "month",
          aggregate: aggregateWithStart(),
          userMetrics: users,
          allowanceByTier,
        };
        const insight = getProjection(
          computeCreditDepletionInsights(input, DEFAULT_INSIGHT_CONFIG),
        );
        expect(insight).toBeDefined();
        expect(insight!.status).toBe("ok");

        const expectedIndeterminate = zeroUsers.length;
        const expectedProjected = positiveUsers.length;

        // All generated users are not-yet-depleted with a positive allowance.
        expect(insight!.detail!.candidates).toBe(
          expectedIndeterminate + expectedProjected,
        );
        // Zero trailing consumption -> indeterminate, no projected date (R10.7).
        expect(insight!.detail!.indeterminate).toBe(expectedIndeterminate);
        // Positive rate -> projected with a date (R10.2).
        expect(insight!.detail!.projected).toBe(expectedProjected);

        // earliestProjected is populated iff at least one user is projected.
        if (expectedProjected > 0) {
          expect((insight!.detail!.earliestProjected as string).length).toBe(10);
        } else {
          expect(insight!.detail!.earliestProjected).toBe("");
        }
      },
    ),
    { numRuns: RUNS },
  );
});
