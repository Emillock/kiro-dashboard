/**
 * Feature: insights-section, Property 25: Remaining balance and percent-consumed correctness with Allowance exclusion
 *
 * Property 25 (design.md): For all users with a positive Allowance, credits
 * remaining equals `Allowance - consumed`, the percentage of Allowance consumed
 * equals `consumed / Allowance * 100` and is greater than or equal to 0; any user
 * whose Allowance is zero or negative is excluded from the remaining-balance,
 * percent-consumed, and burn-rate-projection computations.
 *
 * Validates: Requirements 10.1, 10.6
 *
 * ## Function under test
 *
 * `computeCreditDepletionInsights(input, config)` from lib/insights/creditDepletion.ts.
 * The remaining-balance insight has id `creditDepletion-remaining-balance`:
 *   - WHEN `allowanceByTier` is `null`/absent -> status `unavailable`, no magnitude,
 *     `unavailableReason` populated (Requirement 10.5);
 *   - WHEN `allowanceByTier` is present but `userMetrics` is `null` -> status
 *     `insufficient_data`;
 *   - WHEN present and at least one user has a positive allowance -> status `ok`,
 *     with `detail.users` = count of eligible (positive-allowance) users,
 *     `detail.totalRemaining` = round2(sum of (allowance - consumed)),
 *     `detail.avgPercentConsumed` = round2(avg of max(0, consumed/allowance*100)),
 *     and `magnitude` = round2(totalRemaining);
 *   - WHEN no eligible positive-allowance user exists -> status `insufficient_data`.
 *
 * A user's allowance is resolved as `allowanceByTier[subscription_tier]` and a user
 * is EXCLUDED when its tier is null, its tier is not present in the map, or its
 * resolved allowance is <= 0 (Requirement 10.6). `consumed` is `user.credits_used`.
 *
 * ## Determinism note
 *
 * Allowances and `credits_used` are constrained to INTEGERS, so each
 * `allowance - consumed` term is an exact integer and the running sum is exact;
 * `round2` (the shared oracle) of an integer is that integer. The percent-consumed
 * average is reproduced with the EXACT same reduce order, operands, and division
 * order as the engine (engine iterates eligible users in input order), so the
 * `round2` results are bit-identical and comparable with `toBe`.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeCreditDepletionInsights } from "../lib/insights/creditDepletion";
import type { CreditDepletionInput } from "../lib/insights/creditDepletion";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import { round2 } from "../lib/insights/math";
import type {
  AggregateMetrics,
  Insight,
  UserMetrics,
} from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const REMAINING_ID = "creditDepletion-remaining-balance";

// A fixed per-tier allowance map: some tiers are positive (eligible), one is
// exactly zero, one is negative — both of which MUST be excluded (R10.6). The
// "ghost" tier used by some generated users is intentionally absent from the map
// so users carrying it resolve to an undefined allowance and are excluded too.
const ALLOWANCE_BY_TIER: Record<string, number> = {
  free: 0, // zero -> excluded (R10.6)
  trial: -100, // negative -> excluded (R10.6)
  pro: 500, // positive -> eligible
  team: 1000, // positive -> eligible
  enterprise: 2000, // positive -> eligible
};

const TIERS = [null, "free", "trial", "pro", "team", "enterprise", "ghost"];

// ── Generators ───────────────────────────────────────────────────────────────

/** Build minimal-but-valid per-user metrics; only tier + credits_used matter. */
function makeUser(
  userId: string,
  subscriptionTier: string | null,
  creditsUsed: number,
): UserMetrics {
  return {
    user_id: userId,
    label: `User ${userId}`,
    total_messages: 0,
    chat_conversations: 0,
    credits_used: creditsUsed,
    active_days: 0,
    model_messages: {},
    subscription_tier: subscriptionTier,
    adoption_score: 0,
    daily_breakdown: [],
  };
}

/**
 * A set of users with DISTINCT ids (so input order is well defined), each with a
 * tier drawn from the pool above (covering null, zero/negative-allowance,
 * positive-allowance, and unmapped tiers) and an INTEGER non-negative
 * `credits_used`.
 */
const userMetricsSet = (): fc.Arbitrary<UserMetrics[]> =>
  fc
    .array(
      fc.record({
        tier: fc.constantFrom(...TIERS),
        creditsUsed: fc.nat({ max: 5000 }),
      }),
      { minLength: 0, maxLength: 30 },
    )
    .map((rows) =>
      rows.map((r, i) =>
        makeUser(`u${String(i).padStart(4, "0")}`, r.tier, r.creditsUsed),
      ),
    );

/**
 * A minimal aggregate carrying a `start_date` so the engine can derive a non-null
 * Reset_Day (required before per-user depletion snapshots are built). The actual
 * date is irrelevant to remaining-balance values.
 */
function aggregateWithStart(): AggregateMetrics {
  return {
    range: "month",
    start_date: "2024-03-15",
    end_date: "2024-03-31",
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

// ── Oracle (independent of the engine, sharing only `round2`) ────────────────

interface Eligible {
  allowance: number;
  consumed: number;
}

/**
 * The eligible set: users whose tier is non-null, present in the map, and whose
 * resolved allowance is strictly positive — preserving INPUT ORDER, which is the
 * order the engine iterates (it builds depletion snapshots in user order, then
 * filters `allowance > 0`).
 */
function eligibleUsers(users: UserMetrics[]): Eligible[] {
  const out: Eligible[] = [];
  for (const u of users) {
    if (u.subscription_tier == null) continue;
    const allowance = ALLOWANCE_BY_TIER[u.subscription_tier];
    if (typeof allowance !== "number") continue;
    if (!(allowance > 0)) continue; // exclude zero/negative (R10.6)
    out.push({ allowance, consumed: u.credits_used });
  }
  return out;
}

function getRemaining(insights: Insight[]): Insight | undefined {
  return insights.find((i) => i.id === REMAINING_ID);
}

// ── Property 25: remaining balance + percent-consumed with exclusion ─────────

test("Property 25: remaining balance, percent-consumed, and positive-allowance exclusion match the oracle", () => {
  fc.assert(
    fc.property(userMetricsSet(), (users) => {
      const input: CreditDepletionInput = {
        range: "month",
        aggregate: aggregateWithStart(),
        userMetrics: users,
        allowanceByTier: ALLOWANCE_BY_TIER,
      };
      const insight = getRemaining(
        computeCreditDepletionInsights(input, DEFAULT_INSIGHT_CONFIG),
      );
      expect(insight).toBeDefined();

      const eligible = eligibleUsers(users);

      if (eligible.length === 0) {
        // No positive-allowance users -> insufficient_data, never a fabricated value.
        expect(insight!.status).toBe("insufficient_data");
        expect(insight!.magnitude).toBeUndefined();
        return;
      }

      // Expected aggregates, computed in the SAME order/operations as the engine.
      const expectedTotalRemaining = eligible.reduce(
        (sum, e) => sum + (e.allowance - e.consumed),
        0,
      );
      const expectedAvgPercentConsumed =
        eligible.reduce(
          (sum, e) => sum + Math.max(0, (e.consumed / e.allowance) * 100),
          0,
        ) / eligible.length;

      expect(insight!.status).toBe("ok");
      // Eligible count excludes zero/negative/unmapped/null-tier users (R10.6).
      expect(insight!.detail!.users).toBe(eligible.length);
      // Remaining balance = Allowance - consumed, summed (R10.1).
      expect(insight!.detail!.totalRemaining).toBe(
        round2(expectedTotalRemaining),
      );
      expect(insight!.magnitude).toBe(round2(expectedTotalRemaining));
      // Average percent-consumed = consumed / Allowance * 100 (R10.1) and >= 0.
      expect(insight!.detail!.avgPercentConsumed).toBe(
        round2(expectedAvgPercentConsumed),
      );
      expect(insight!.detail!.avgPercentConsumed as number).toBeGreaterThanOrEqual(
        0,
      );

      // Exclusion invariant: the eligible count never includes any user whose
      // resolved allowance is zero, negative, unmapped, or whose tier is null.
      const excludedCount = users.length - eligible.length;
      expect((insight!.detail!.users as number) + excludedCount).toBe(
        users.length,
      );
    }),
    { numRuns: RUNS },
  );
});

// ── Property 25: zero/negative-allowance users are always excluded ───────────

test("Property 25: users with zero or negative allowance never affect the totals", () => {
  fc.assert(
    fc.property(
      // A mix that always includes some positive-allowance users plus arbitrary
      // numbers of zero/negative-allowance users.
      fc.array(
        fc.record({ tier: fc.constantFrom("pro", "team"), creditsUsed: fc.nat({ max: 5000 }) }),
        { minLength: 1, maxLength: 12 },
      ),
      fc.array(
        fc.record({ tier: fc.constantFrom("free", "trial"), creditsUsed: fc.nat({ max: 5000 }) }),
        { minLength: 0, maxLength: 12 },
      ),
      (positives, excluded) => {
        const positiveUsers = positives.map((r, i) =>
          makeUser(`p${String(i).padStart(4, "0")}`, r.tier, r.creditsUsed),
        );
        const excludedUsers = excluded.map((r, i) =>
          makeUser(`x${String(i).padStart(4, "0")}`, r.tier, r.creditsUsed),
        );

        const withExcluded: CreditDepletionInput = {
          range: "month",
          aggregate: aggregateWithStart(),
          userMetrics: [...positiveUsers, ...excludedUsers],
          allowanceByTier: ALLOWANCE_BY_TIER,
        };
        const withoutExcluded: CreditDepletionInput = {
          ...withExcluded,
          userMetrics: positiveUsers,
        };

        const a = getRemaining(
          computeCreditDepletionInsights(withExcluded, DEFAULT_INSIGHT_CONFIG),
        )!;
        const b = getRemaining(
          computeCreditDepletionInsights(withoutExcluded, DEFAULT_INSIGHT_CONFIG),
        )!;

        // Adding zero/negative-allowance users changes nothing: same count,
        // same remaining balance, same average percent-consumed.
        expect(a.status).toBe("ok");
        expect(b.status).toBe("ok");
        expect(a.detail!.users).toBe(b.detail!.users);
        expect(a.detail!.users).toBe(positiveUsers.length);
        expect(a.detail!.totalRemaining).toBe(b.detail!.totalRemaining);
        expect(a.detail!.avgPercentConsumed).toBe(b.detail!.avgPercentConsumed);
        expect(a.magnitude).toBe(b.magnitude);
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Property 25: absent Allowance dependency -> unavailable, no value ────────

test("Property 25: a null allowanceByTier yields an unavailable insight with no magnitude", () => {
  fc.assert(
    fc.property(userMetricsSet(), (users) => {
      const input: CreditDepletionInput = {
        range: "month",
        aggregate: aggregateWithStart(),
        userMetrics: users,
        allowanceByTier: null,
      };
      const insight = getRemaining(
        computeCreditDepletionInsights(input, DEFAULT_INSIGHT_CONFIG),
      )!;
      expect(insight.status).toBe("unavailable");
      expect(insight.magnitude).toBeUndefined();
      expect(typeof insight.unavailableReason).toBe("string");
      expect((insight.unavailableReason as string).length).toBeGreaterThan(0);
    }),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("remaining balance sums Allowance - consumed across eligible users only", () => {
  const users: UserMetrics[] = [
    makeUser("a", "pro", 100), // allowance 500 -> remaining 400, 20% consumed
    makeUser("b", "team", 250), // allowance 1000 -> remaining 750, 25% consumed
    makeUser("z", "free", 10), // allowance 0 -> excluded
    makeUser("n", null, 999), // null tier -> excluded
    makeUser("g", "ghost", 999), // unmapped tier -> excluded
  ];
  const insight = getRemaining(
    computeCreditDepletionInsights(
      {
        range: "month",
        aggregate: aggregateWithStart(),
        userMetrics: users,
        allowanceByTier: ALLOWANCE_BY_TIER,
      },
      DEFAULT_INSIGHT_CONFIG,
    ),
  )!;
  expect(insight.status).toBe("ok");
  expect(insight.detail!.users).toBe(2);
  expect(insight.detail!.totalRemaining).toBe(1150); // 400 + 750
  expect(insight.magnitude).toBe(1150);
  expect(insight.detail!.avgPercentConsumed).toBe(22.5); // (20 + 25) / 2
});

test("all users excluded (zero/negative allowance) yields insufficient_data", () => {
  const users: UserMetrics[] = [
    makeUser("a", "free", 100), // allowance 0 -> excluded
    makeUser("b", "trial", 50), // allowance -100 -> excluded
  ];
  const insight = getRemaining(
    computeCreditDepletionInsights(
      {
        range: "month",
        aggregate: aggregateWithStart(),
        userMetrics: users,
        allowanceByTier: ALLOWANCE_BY_TIER,
      },
      DEFAULT_INSIGHT_CONFIG,
    ),
  )!;
  expect(insight.status).toBe("insufficient_data");
  expect(insight.magnitude).toBeUndefined();
});

test("present allowance but null userMetrics yields insufficient_data", () => {
  const insight = getRemaining(
    computeCreditDepletionInsights(
      {
        range: "month",
        aggregate: aggregateWithStart(),
        userMetrics: null,
        allowanceByTier: ALLOWANCE_BY_TIER,
      },
      DEFAULT_INSIGHT_CONFIG,
    ),
  )!;
  expect(insight.status).toBe("insufficient_data");
  expect(insight.magnitude).toBeUndefined();
});
