/**
 * Feature: insights-section, Property 24: Cap-hit rate bounds
 *
 * Property 24 (design.md): For all subscription tiers with at least one user,
 * the cap-hit rate equals the count of users in that tier whose cumulative
 * credits_used reached their Allowance divided by the total count of users in
 * that tier, and lies between 0 and 1 inclusive.
 *
 * Validates: Requirements 9.6
 *
 * ## Function under test
 *
 * `computeCreditDepletionInsights(input, config)` from
 * lib/insights/creditDepletion.ts. The cap-hit insight has id
 * `creditDepletion-cap-hit-by-tier`. When `allowanceByTier`, `userMetrics`, and a
 * derivable Reset_Day are all present, it is emitted with status `ok` and a
 * `detail` carrying one entry per tier, keyed `tier_<tier>`, whose value is
 * `round2(rate)` where `rate = hit / total`.
 *
 *   - When `allowanceByTier` is `null`/absent the insight is `unavailable`.
 *   - When the dependency is present but there is no per-user data (or no user
 *     has a known allowance) the insight is `insufficient_data`.
 *
 * ## How "reached Allowance" is determined
 *
 * The engine counts a user as having reached their allowance iff
 * `computeDaysToDepletion(daily_breakdown, allowance, resetDay)` is defined,
 * which (for a positive allowance and valid dates) happens iff the cumulative
 * sum of `credits_used` over the breakdown is `>= allowance`. Because
 * `credits_used` is generated as a NON-NEGATIVE INTEGER the cumulative series is
 * non-decreasing, so "reached at some point" is exactly "total sum >= allowance".
 * The oracle below mirrors that determination directly.
 *
 * ## Determinism note
 *
 * Inputs use INTEGER credits and INTEGER allowances (`allowance >= 1`, so the
 * degenerate non-positive-allowance branch never fires), contiguous dates inside
 * a single calendar month, and tiers drawn from a fixed pool that are always
 * present in `allowanceByTier`. The oracle reuses the SAME `round2` helper on the
 * SAME `hit / total` operands as the engine, so the reported per-tier rates are
 * bit-identical (`toEqual`).
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeCreditDepletionInsights } from "../lib/insights/creditDepletion";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import { round2 } from "../lib/insights/math";
import type {
  AggregateMetrics,
  DailyTotal,
  Insight,
  UserMetrics,
} from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const CAP_HIT_ID = "creditDepletion-cap-hit-by-tier";

/** Fixed reset month: every generated daily date falls inside March 2024. */
const RESET_START = "2024-03-01";
const RESET_END = "2024-03-31";

/** Tiers always present in the allowance map, so every user has a known allowance. */
const TIER_POOL = ["bronze", "silver", "gold", "platinum"] as const;

// ── Builders ─────────────────────────────────────────────────────────────────

/** Contiguous `YYYY-MM-DD` date inside March 2024 for day offset `i` (0-based). */
function dateAt(i: number): string {
  return `2024-03-${String(i + 1).padStart(2, "0")}`;
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

/** Build a minimal, valid UserMetrics for the given tier and daily credits. */
function buildUser(
  userId: string,
  tier: string,
  credits: number[],
): UserMetrics {
  const daily = makeDaily(credits);
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
    daily_breakdown: daily,
    overage_cap: 0,
    overage_credits_used: 0,
  };
}

/** Minimal aggregate whose `start_date` pins the Reset_Day to March 2024. */
function makeAggregate(): AggregateMetrics {
  return {
    range: "month",
    start_date: RESET_START,
    end_date: RESET_END,
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

// ── Generators ───────────────────────────────────────────────────────────────

interface Model {
  allowanceByTier: Record<string, number>;
  userMetrics: UserMetrics[];
}

/**
 * Generate a coherent model: a non-empty subset of tiers (each with a positive
 * integer Allowance) plus at least one user, every user assigned to one of those
 * tiers with an integer-credit daily breakdown. Daily length stays small so all
 * dates remain inside March.
 */
const modelArb: fc.Arbitrary<Model> = fc
  .uniqueArray(fc.constantFrom(...TIER_POOL), { minLength: 1, maxLength: 4 })
  .chain((tiers) =>
    fc
      .record({
        allowances: fc.array(fc.integer({ min: 1, max: 500 }), {
          minLength: tiers.length,
          maxLength: tiers.length,
        }),
        users: fc.array(
          fc.record({
            tier: fc.constantFrom(...tiers),
            credits: fc.array(fc.nat({ max: 200 }), {
              minLength: 0,
              maxLength: 15,
            }),
          }),
          { minLength: 1, maxLength: 30 },
        ),
      })
      .map(({ allowances, users }) => {
        const allowanceByTier: Record<string, number> = {};
        tiers.forEach((t, i) => {
          allowanceByTier[t] = allowances[i];
        });
        const userMetrics = users.map((u, idx) =>
          buildUser(`u${String(idx).padStart(3, "0")}`, u.tier, u.credits),
        );
        return { allowanceByTier, userMetrics };
      }),
  );

// ── Oracle (independent of the engine, sharing only `round2`) ────────────────

/**
 * Compute the expected per-tier cap-hit detail independently:
 *   - group users by tier,
 *   - a user "reached" their allowance iff sum(credits_used) >= allowance,
 *   - rate = hit / total, reported as round2(rate), keyed `tier_<tier>`.
 * Only tiers with at least one user appear.
 */
function expectedDetail(model: Model): Record<string, number> {
  const byTier = new Map<string, { hit: number; total: number }>();
  for (const u of model.userMetrics) {
    const tier = u.subscription_tier as string;
    const allowance = model.allowanceByTier[tier];
    const sum = u.daily_breakdown.reduce((a, d) => a + d.credits_used, 0);
    const bucket = byTier.get(tier) ?? { hit: 0, total: 0 };
    bucket.total += 1;
    if (sum >= allowance) {
      bucket.hit += 1;
    }
    byTier.set(tier, bucket);
  }
  const detail: Record<string, number> = {};
  for (const [tier, { hit, total }] of byTier) {
    detail[`tier_${tier}`] = round2(hit / total);
  }
  return detail;
}

/** Find the cap-hit-by-tier insight in the engine output. */
function capHit(insights: Insight[]): Insight | undefined {
  return insights.find((ins) => ins.id === CAP_HIT_ID);
}

// ── Property 24: per-tier cap-hit rate equals hit/total and is in [0, 1] ─────

test("Property 24: cap-hit rate per tier equals hit/total and lies in [0, 1]", () => {
  fc.assert(
    fc.property(modelArb, (model) => {
      const insights = computeCreditDepletionInsights(
        {
          range: "month",
          aggregate: makeAggregate(),
          userMetrics: model.userMetrics,
          allowanceByTier: model.allowanceByTier,
        },
        DEFAULT_INSIGHT_CONFIG,
      );

      const insight = capHit(insights);
      expect(insight).toBeDefined();
      expect(insight!.status).toBe("ok");

      const detail = insight!.detail as Record<string, number>;
      const expected = expectedDetail(model);

      // Detail keys/values match the oracle EXACTLY (same tiers, same rates).
      expect(detail).toEqual(expected);

      // Bounds invariant: every reported rate lies in [0, 1] inclusive.
      for (const value of Object.values(detail)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }

      // Only tiers with at least one user are reported.
      const tiersWithUsers = new Set(
        model.userMetrics.map((u) => `tier_${u.subscription_tier}`),
      );
      expect(new Set(Object.keys(detail))).toEqual(tiersWithUsers);
    }),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("all users in a tier reach their allowance -> rate 1; none -> rate 0", () => {
  const allowanceByTier = { bronze: 100, silver: 100 };
  const userMetrics: UserMetrics[] = [
    // bronze: both reach 100 -> rate 1
    buildUser("u0", "bronze", [60, 50]), // sum 110 >= 100
    buildUser("u1", "bronze", [100]), // sum 100 >= 100 (boundary)
    // silver: neither reaches 100 -> rate 0
    buildUser("u2", "silver", [10, 20]), // sum 30 < 100
    buildUser("u3", "silver", []), // sum 0 < 100
  ];
  const insights = computeCreditDepletionInsights(
    {
      range: "month",
      aggregate: makeAggregate(),
      userMetrics,
      allowanceByTier,
    },
    DEFAULT_INSIGHT_CONFIG,
  );
  const insight = capHit(insights)!;
  expect(insight.status).toBe("ok");
  expect(insight.detail).toEqual({ tier_bronze: 1, tier_silver: 0 });
});

test("partial cap-hit rounds to two decimals (1 of 3 -> 0.33)", () => {
  const allowanceByTier = { gold: 50 };
  const userMetrics: UserMetrics[] = [
    buildUser("u0", "gold", [50]), // reaches
    buildUser("u1", "gold", [10]), // misses
    buildUser("u2", "gold", [49]), // misses
  ];
  const insights = computeCreditDepletionInsights(
    {
      range: "month",
      aggregate: makeAggregate(),
      userMetrics,
      allowanceByTier,
    },
    DEFAULT_INSIGHT_CONFIG,
  );
  const insight = capHit(insights)!;
  expect(insight.status).toBe("ok");
  expect(insight.detail).toEqual({ tier_gold: round2(1 / 3) });
  expect(insight.detail!.tier_gold).toBe(0.33);
});

test("absent allowanceByTier renders the cap-hit insight unavailable", () => {
  const insights = computeCreditDepletionInsights(
    {
      range: "month",
      aggregate: makeAggregate(),
      userMetrics: [buildUser("u0", "bronze", [10])],
      allowanceByTier: null,
    },
    DEFAULT_INSIGHT_CONFIG,
  );
  const insight = capHit(insights)!;
  expect(insight.status).toBe("unavailable");
  expect(insight.unavailableReason).toBeTruthy();
  expect(insight.detail).toBeUndefined();
});

test("allowance present but no per-user data renders insufficient_data", () => {
  const insights = computeCreditDepletionInsights(
    {
      range: "month",
      aggregate: makeAggregate(),
      userMetrics: null,
      allowanceByTier: { bronze: 100 },
    },
    DEFAULT_INSIGHT_CONFIG,
  );
  const insight = capHit(insights)!;
  expect(insight.status).toBe("insufficient_data");
  expect(insight.detail).toBeUndefined();
});
