/**
 * Feature: insights-section, Property 28: Depletion-timing trend chronological ordering
 *
 * Property 28 (design.md): For all sets of at least two months of depletion data,
 * the depletion-timing trend reports the average Days_To_Depletion per month
 * ordered chronologically from earliest to latest; when fewer than two months are
 * available the insight is `unavailable`.
 *
 * Validates: Requirements 10.4
 *
 * ## Function under test
 *
 * `computeCreditDepletionInsights(input, config)` from lib/insights/creditDepletion.ts.
 * The depletion-timing-trend insight has id `creditDepletion-depletion-timing-trend`.
 *
 * ## IMPLEMENTATION LIMITATION (why this test asserts the unavailable contract)
 *
 * `CreditDepletionInput` carries a SINGLE reporting `range`, and the engine derives
 * the Reset_Day as the first day of the ONE calendar month covering that range (see
 * `deriveResetDay` in creditDepletion.ts). A single range therefore provides only
 * ONE calendar month of depletion data, so the ">= 2 consecutive months"
 * precondition of Requirement 10.4 is NEVER satisfiable from this input shape.
 *
 * Accordingly, the engine ALWAYS emits the depletion-timing-trend insight as
 * status `unavailable` with an `unavailableReason` naming the multi-month
 * requirement (the `MULTI_MONTH_REASON` constant in creditDepletion.ts) and never
 * fabricates a magnitude/value. This is consistent with Requirement 10.4 ("fewer
 * than two months -> unavailable") and Requirement 10.5 (no fabricated value for an
 * unavailable insight).
 *
 * This test asserts that ACTUAL implemented behavior across a wide variety of valid
 * inputs. The chronological (earliest-to-latest) ordering branch of Property 28 is
 * currently UNREACHABLE because multi-month depletion data cannot be supplied
 * through `CreditDepletionInput`. If/when a multi-month depletion data source is
 * added, this test MUST be extended to assert that the reported average
 * Days_To_Depletion per month is ordered chronologically from earliest to latest.
 *
 * ## Determinism note
 *
 * The depletion-timing-trend insight is independent of every other input field —
 * it is emitted unconditionally as `unavailable`. The generators below vary the
 * range, aggregate, per-user metrics, and both gated dependencies
 * (`allowanceByTier`, `overageByUser`) precisely to demonstrate that NO combination
 * of inputs flips it away from the unavailable contract.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeCreditDepletionInsights } from "../lib/insights/creditDepletion";
import type { CreditDepletionInput } from "../lib/insights/creditDepletion";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import type {
  AggregateMetrics,
  DailyTotal,
  Insight,
  RangeParam,
  UserMetrics,
} from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const TREND_ID = "creditDepletion-depletion-timing-trend";

/** Tiers used to vary user/allowance shape; some are absent from the map below. */
const TIERS = [null, "free", "pro", "team", "enterprise", "ghost"] as const;

// ── Builders ─────────────────────────────────────────────────────────────────

/** Contiguous `YYYY-MM-DD` date inside March 2024 for day offset `i` (0-based). */
function dateAt(i: number): string {
  return `2024-03-${String((i % 28) + 1).padStart(2, "0")}`;
}

/** Build a daily breakdown of integer credits over contiguous March dates. */
function makeDaily(credits: number[]): DailyTotal[] {
  return credits.map((c, i) => ({
    date: dateAt(i),
    total_messages: 0,
    chat_conversations: 0,
    credits_used: c,
    active_users: 0,
  }));
}

/** Build a minimal, valid UserMetrics. */
function buildUser(
  userId: string,
  tier: string | null,
  credits: number[],
): UserMetrics {
  return {
    user_id: userId,
    label: `User ${userId}`,
    total_messages: 0,
    chat_conversations: 0,
    credits_used: credits.reduce((a, c) => a + c, 0),
    active_days: 0,
    model_messages: {},
    subscription_tier: tier,
    adoption_score: 0,
    daily_breakdown: makeDaily(credits),
    overage_cap: 0,
    overage_credits_used: 0,
  };
}

// ── Generators ───────────────────────────────────────────────────────────────

const rangeArb: fc.Arbitrary<RangeParam> = fc.constantFrom("week", "month");

/** An aggregate that may or may not carry a `start_date` (varying Reset_Day). */
const aggregateArb: fc.Arbitrary<AggregateMetrics | null> = fc.option(
  fc
    .record({
      withStart: fc.boolean(),
      daily: fc.array(fc.nat({ max: 500 }), { minLength: 0, maxLength: 10 }),
    })
    .map(({ withStart, daily }) => ({
      range: "month" as RangeParam,
      start_date: withStart ? "2024-03-01" : "",
      end_date: "2024-03-31",
      total_messages: 0,
      total_chat_conversations: 0,
      total_credits_used: 0,
      active_user_count: 0,
      avg_messages_per_user: 0,
      avg_conversations_per_user: 0,
      model_distribution: {},
      daily_totals: makeDaily(daily),
    })),
  { nil: null },
);

/** A possibly-null list of varied users (distinct ids, varied tiers/credits). */
const userMetricsArb: fc.Arbitrary<UserMetrics[] | null> = fc.option(
  fc
    .array(
      fc.record({
        tier: fc.constantFrom(...TIERS),
        credits: fc.array(fc.nat({ max: 300 }), { minLength: 0, maxLength: 12 }),
      }),
      { minLength: 0, maxLength: 20 },
    )
    .map((rows) =>
      rows.map((r, i) =>
        buildUser(`u${String(i).padStart(3, "0")}`, r.tier, r.credits),
      ),
    ),
  { nil: null },
);

/** A possibly-null per-tier allowance map (gated dependency). */
const allowanceArb: fc.Arbitrary<Record<string, number> | null> = fc.option(
  fc
    .record({
      free: fc.integer({ min: -100, max: 0 }),
      pro: fc.integer({ min: 1, max: 1000 }),
      team: fc.integer({ min: 1, max: 2000 }),
      enterprise: fc.integer({ min: 1, max: 5000 }),
    })
    .map((m) => ({ ...m })),
  { nil: null },
);

/** A possibly-null per-user overage map (gated dependency). */
const overageArb: fc.Arbitrary<Record<string, number> | null> = fc.option(
  fc
    .array(fc.nat({ max: 1000 }), { minLength: 0, maxLength: 10 })
    .map((vals) => {
      const map: Record<string, number> = {};
      vals.forEach((v, i) => {
        map[`u${String(i).padStart(3, "0")}`] = v;
      });
      return map;
    }),
  { nil: null },
);

/** A fully-varied CreditDepletionInput spanning all the engine's input axes. */
const inputArb: fc.Arbitrary<CreditDepletionInput> = fc.record({
  range: rangeArb,
  aggregate: aggregateArb,
  userMetrics: userMetricsArb,
  allowanceByTier: allowanceArb,
  overageByUser: overageArb,
});

function getTrend(insights: Insight[]): Insight | undefined {
  return insights.find((i) => i.id === TREND_ID);
}

// ── Property 28: depletion-timing trend is always unavailable from a single range ──

test("Property 28: depletion-timing trend is present and unavailable with no fabricated value for all inputs", () => {
  fc.assert(
    fc.property(inputArb, (input) => {
      const insight = getTrend(
        computeCreditDepletionInsights(input, DEFAULT_INSIGHT_CONFIG),
      );

      // The insight is always emitted (every insight is computed independently).
      expect(insight).toBeDefined();

      // A single range provides only one calendar month, so the >= 2 consecutive
      // months precondition (R10.4) is never met -> status `unavailable` (R10.5).
      expect(insight!.status).toBe("unavailable");

      // No fabricated value is presented for an unavailable insight (R10.4, R10.5).
      expect(insight!.magnitude).toBeUndefined();

      // The missing-dependency reason is populated and non-empty (R10.5).
      expect(typeof insight!.unavailableReason).toBe("string");
      expect((insight!.unavailableReason as string).length).toBeGreaterThan(0);

      // The reason names the multi-month requirement so the user understands why.
      expect((insight!.unavailableReason as string).toLowerCase()).toContain(
        "month",
      );
    }),
    { numRuns: RUNS },
  );
});

// ── Property 28: independence from the gated dependencies ────────────────────

test("Property 28: supplying allowance and overage data never makes the trend computable", () => {
  fc.assert(
    fc.property(
      rangeArb,
      userMetricsArb,
      (range, userMetrics) => {
        const allowanceByTier = { pro: 500, team: 1000, enterprise: 2000 };
        const overageByUser = { "u000": 10, "u001": 0 };
        const input: CreditDepletionInput = {
          range,
          aggregate: {
            range: "month",
            start_date: "2024-03-01",
            end_date: "2024-03-31",
            total_messages: 0,
            total_chat_conversations: 0,
            total_credits_used: 0,
            active_user_count: 0,
            avg_messages_per_user: 0,
            avg_conversations_per_user: 0,
            model_distribution: {},
            daily_totals: [],
          },
          userMetrics,
          allowanceByTier,
          overageByUser,
        };
        const insight = getTrend(
          computeCreditDepletionInsights(input, DEFAULT_INSIGHT_CONFIG),
        )!;
        // Even with BOTH gated dependencies present, the trend stays unavailable
        // because multi-month data cannot be supplied through a single range.
        expect(insight.status).toBe("unavailable");
        expect(insight.magnitude).toBeUndefined();
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("trend is unavailable for a fully-populated single-month input", () => {
  const input: CreditDepletionInput = {
    range: "month",
    aggregate: {
      range: "month",
      start_date: "2024-03-01",
      end_date: "2024-03-31",
      total_messages: 0,
      total_chat_conversations: 0,
      total_credits_used: 0,
      active_user_count: 0,
      avg_messages_per_user: 0,
      avg_conversations_per_user: 0,
      model_distribution: {},
      daily_totals: [],
    },
    userMetrics: [
      buildUser("u000", "pro", [100, 200, 300]),
      buildUser("u001", "team", [50]),
    ],
    allowanceByTier: { pro: 500, team: 1000 },
    overageByUser: { u000: 25 },
  };
  const insight = getTrend(
    computeCreditDepletionInsights(input, DEFAULT_INSIGHT_CONFIG),
  )!;
  expect(insight.id).toBe(TREND_ID);
  expect(insight.status).toBe("unavailable");
  expect(insight.magnitude).toBeUndefined();
  expect(insight.unavailableReason).toBeTruthy();
});

test("trend is unavailable even with all gated dependencies absent", () => {
  const input: CreditDepletionInput = {
    range: "week",
    aggregate: null,
    userMetrics: null,
    allowanceByTier: null,
    overageByUser: null,
  };
  const insight = getTrend(
    computeCreditDepletionInsights(input, DEFAULT_INSIGHT_CONFIG),
  )!;
  expect(insight.status).toBe("unavailable");
  expect(insight.magnitude).toBeUndefined();
  expect(insight.detail).toBeUndefined();
});
