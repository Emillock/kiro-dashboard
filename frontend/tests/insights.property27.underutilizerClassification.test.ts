/**
 * Feature: insights-section, Property 27: Underutilizer classification
 *
 * Property 27 (design.md): For all users with a positive Allowance, the user is
 * reported as an underutilizer (a downgrade/reallocation candidate) if and only
 * if month-end consumption is strictly less than the configured percentage
 * (default 25%, `config.underutilizerPct`) of the Allowance.
 *
 * Validates: Requirements 10.3
 *
 * ## Function under test
 *
 * `computeCreditDepletionInsights(input, config)` from lib/insights/creditDepletion.ts.
 * The underutilizer insight has id `creditDepletion-underutilizers`:
 *   - WHEN `allowanceByTier` is `null`/absent -> status `unavailable`, no magnitude,
 *     `unavailableReason` populated (Requirement 10.5);
 *   - WHEN `allowanceByTier` is present but `userMetrics` is `null` -> status
 *     `insufficient_data`, no magnitude;
 *   - WHEN present -> status `ok`, with
 *       `detail.count`       = number of underutilizers,
 *       `detail.thresholdPct`= the configured `underutilizerPct`,
 *       `detail.userIds`     = the underutilizer user_ids joined by "," ASCENDING by user_id,
 *       `magnitude`          = count.
 *
 * Classification (per implementation): a user is an underutilizer iff
 *   - its resolved allowance is strictly positive (`allowance > 0`), AND
 *   - `consumed < allowance * pct / 100` (STRICT `<`),
 * where `consumed` is `user.credits_used` and the allowance is resolved as
 * `allowanceByTier[subscription_tier]`. Users whose tier is null, unmapped, or
 * whose allowance is <= 0 are EXCLUDED (never underutilizers).
 *
 * ## Determinism note
 *
 * Allowances are constrained to INTEGERS DIVISIBLE BY 4 (so the 25% default
 * threshold `allowance * 25 / 100` is itself an exact integer) and `credits_used`
 * is a non-negative INTEGER. This makes the strict-`<` boundary unambiguous: a
 * user consuming EXACTLY the threshold is NOT an underutilizer. Custom percentages
 * are paired with allowances divisible by an appropriate factor (or compared via
 * the SAME `allowance * pct / 100` expression) so the oracle and engine evaluate
 * bit-identical comparisons.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeCreditDepletionInsights } from "../lib/insights/creditDepletion";
import type { CreditDepletionInput } from "../lib/insights/creditDepletion";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import type {
  AggregateMetrics,
  Insight,
  InsightConfig,
  UserMetrics,
} from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const UNDERUTILIZER_ID = "creditDepletion-underutilizers";

// A fixed per-tier allowance map. Positive allowances are divisible by 4 so the
// default 25% threshold is an exact integer; `free` is zero and `trial` is
// negative (both excluded, never underutilizers); the unmapped `ghost` tier and
// a null tier are also excluded.
const ALLOWANCE_BY_TIER: Record<string, number> = {
  free: 0, // zero -> excluded
  trial: -200, // negative -> excluded
  pro: 400, // positive, /4 -> 25% = 100
  team: 1000, // positive, /4 -> 25% = 250
  enterprise: 2000, // positive, /4 -> 25% = 500
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
    overage_cap: 0,
    overage_credits_used: 0,
  };
}

/**
 * A set of users with DISTINCT, NON-SORTED ids so the engine's ascending sort of
 * userIds is genuinely exercised (a pre-sorted set would not detect a missing
 * sort). The id is derived from a shuffled index space; tiers cover null,
 * zero/negative-allowance, positive-allowance, and unmapped values; `credits_used`
 * is a non-negative integer spanning above and below the threshold.
 */
const userMetricsSet = (): fc.Arbitrary<UserMetrics[]> =>
  fc
    .array(
      fc.record({
        tier: fc.constantFrom(...TIERS),
        creditsUsed: fc.nat({ max: 2500 }),
      }),
      { minLength: 0, maxLength: 30 },
    )
    .chain((rows) =>
      // Assign DISTINCT ids drawn from a shuffled label pool so ordering varies.
      fc
        .shuffledSubarray(
          Array.from({ length: rows.length }, (_, i) => i),
          { minLength: rows.length, maxLength: rows.length },
        )
        .map((perm) =>
          rows.map((r, i) =>
            makeUser(`u${String(perm[i]).padStart(4, "0")}`, r.tier, r.creditsUsed),
          ),
        ),
    );

/**
 * A minimal aggregate carrying a `start_date` so the engine derives a non-null
 * Reset_Day (required before per-user depletion snapshots are built). The actual
 * date is irrelevant to the underutilizer classification.
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

// ── Oracle (independent of the engine) ───────────────────────────────────────

/**
 * The expected underutilizer user_ids, ASCENDING by user_id. A user qualifies
 * iff its tier resolves to a strictly positive allowance and its consumed credits
 * are strictly less than `allowance * pct / 100` (the SAME expression the engine
 * evaluates, preserving the strict `<`).
 */
function expectedUnderutilizerIds(
  users: UserMetrics[],
  pct: number,
): string[] {
  const ids: string[] = [];
  for (const u of users) {
    if (u.subscription_tier == null) continue;
    const allowance = ALLOWANCE_BY_TIER[u.subscription_tier];
    if (typeof allowance !== "number") continue;
    if (!(allowance > 0)) continue; // exclude zero/negative
    if (u.credits_used < (allowance * pct) / 100) {
      ids.push(u.user_id);
    }
  }
  return ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function getUnderutilizers(insights: Insight[]): Insight | undefined {
  return insights.find((i) => i.id === UNDERUTILIZER_ID);
}

function withPct(pct: number): InsightConfig {
  return { ...DEFAULT_INSIGHT_CONFIG, underutilizerPct: pct };
}

// ── Property 27a: classification matches the oracle (default 25%) ────────────

test("Property 27: underutilizers match the oracle iff consumed < 25% of a positive allowance", () => {
  fc.assert(
    fc.property(userMetricsSet(), (users) => {
      const input: CreditDepletionInput = {
        range: "month",
        aggregate: aggregateWithStart(),
        userMetrics: users,
        allowanceByTier: ALLOWANCE_BY_TIER,
      };
      const insight = getUnderutilizers(
        computeCreditDepletionInsights(input, DEFAULT_INSIGHT_CONFIG),
      );
      expect(insight).toBeDefined();
      expect(insight!.status).toBe("ok");

      const expectedIds = expectedUnderutilizerIds(
        users,
        DEFAULT_INSIGHT_CONFIG.underutilizerPct,
      );

      expect(insight!.detail!.userIds).toBe(expectedIds.join(","));
      expect(insight!.detail!.count).toBe(expectedIds.length);
      expect(insight!.magnitude).toBe(expectedIds.length);
      expect(insight!.detail!.thresholdPct).toBe(
        DEFAULT_INSIGHT_CONFIG.underutilizerPct,
      );
    }),
    { numRuns: RUNS },
  );
});

// ── Property 27b: classification matches the oracle for a CUSTOM percentage ──

test("Property 27: a custom underutilizerPct shifts the boundary and the oracle agrees", () => {
  fc.assert(
    fc.property(
      userMetricsSet(),
      // Percentages that keep `allowance * pct / 100` an exact integer for all
      // mapped positive allowances (400, 1000, 2000): pct must make each product
      // divisible by 100. pct in {0,5,10,...,100} satisfies this for these values.
      fc.integer({ min: 0, max: 20 }).map((k) => k * 5),
      (users, pct) => {
        const input: CreditDepletionInput = {
          range: "month",
          aggregate: aggregateWithStart(),
          userMetrics: users,
          allowanceByTier: ALLOWANCE_BY_TIER,
        };
        const insight = getUnderutilizers(
          computeCreditDepletionInsights(input, withPct(pct)),
        )!;
        expect(insight.status).toBe("ok");

        const expectedIds = expectedUnderutilizerIds(users, pct);
        expect(insight.detail!.userIds).toBe(expectedIds.join(","));
        expect(insight.detail!.count).toBe(expectedIds.length);
        expect(insight.magnitude).toBe(expectedIds.length);
        expect(insight.detail!.thresholdPct).toBe(pct);
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Property 27c: the strict-`<` boundary — consumed == threshold is NOT one ─

test("Property 27: a user consuming exactly the threshold is NOT an underutilizer (strict <)", () => {
  fc.assert(
    fc.property(
      // Pick a positive-allowance tier; its 25% threshold is an exact integer.
      fc.constantFrom("pro", "team", "enterprise"),
      (tier) => {
        const allowance = ALLOWANCE_BY_TIER[tier];
        const threshold = (allowance * DEFAULT_INSIGHT_CONFIG.underutilizerPct) / 100;

        // Three boundary users: just below, exactly at, and just above threshold.
        const below = makeUser("a-below", tier, threshold - 1);
        const exact = makeUser("b-exact", tier, threshold);
        const above = makeUser("c-above", tier, threshold + 1);

        const insight = getUnderutilizers(
          computeCreditDepletionInsights(
            {
              range: "month",
              aggregate: aggregateWithStart(),
              userMetrics: [above, exact, below],
              allowanceByTier: ALLOWANCE_BY_TIER,
            },
            DEFAULT_INSIGHT_CONFIG,
          ),
        )!;

        expect(insight.status).toBe("ok");
        // Only the strictly-below user qualifies; exact and above do not.
        expect(insight.detail!.userIds).toBe("a-below");
        expect(insight.detail!.count).toBe(1);
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Property 27d: zero/negative/unmapped/null-tier users are never reported ──

test("Property 27: users without a positive resolved allowance are never underutilizers", () => {
  fc.assert(
    fc.property(
      // Always-underutilizer positive users (consumed 0 < any positive threshold).
      fc.array(fc.constantFrom("pro", "team", "enterprise"), {
        minLength: 1,
        maxLength: 10,
      }),
      // Excluded users: zero/negative allowance, unmapped, or null tier, with
      // arbitrary low consumption that WOULD qualify if they were eligible.
      fc.array(fc.constantFrom("free", "trial", "ghost", null as unknown as string), {
        minLength: 0,
        maxLength: 12,
      }),
      (positives, excluded) => {
        const positiveUsers = positives.map((tier, i) =>
          makeUser(`p${String(i).padStart(4, "0")}`, tier, 0),
        );
        const excludedUsers = excluded.map((tier, i) =>
          makeUser(`x${String(i).padStart(4, "0")}`, tier, 0),
        );

        const insight = getUnderutilizers(
          computeCreditDepletionInsights(
            {
              range: "month",
              aggregate: aggregateWithStart(),
              userMetrics: [...excludedUsers, ...positiveUsers],
              allowanceByTier: ALLOWANCE_BY_TIER,
            },
            DEFAULT_INSIGHT_CONFIG,
          ),
        )!;

        // Only the positive-allowance users appear, sorted ascending by id.
        const expectedIds = positiveUsers
          .map((u) => u.user_id)
          .sort((a, b) => (a < b ? -1 : 1));
        expect(insight.detail!.userIds).toBe(expectedIds.join(","));
        expect(insight.detail!.count).toBe(positiveUsers.length);
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Property 27e: absent Allowance dependency -> unavailable, no value ───────

test("Property 27: a null allowanceByTier yields an unavailable insight with no magnitude", () => {
  fc.assert(
    fc.property(userMetricsSet(), (users) => {
      const insight = getUnderutilizers(
        computeCreditDepletionInsights(
          {
            range: "month",
            aggregate: aggregateWithStart(),
            userMetrics: users,
            allowanceByTier: null,
          },
          DEFAULT_INSIGHT_CONFIG,
        ),
      )!;
      expect(insight.status).toBe("unavailable");
      expect(insight.magnitude).toBeUndefined();
      expect(typeof insight.unavailableReason).toBe("string");
      expect((insight.unavailableReason as string).length).toBeGreaterThan(0);
    }),
    { numRuns: RUNS },
  );
});

// ── Property 27f: present allowance but null userMetrics -> insufficient_data ─

test("Property 27: present allowanceByTier with null userMetrics yields insufficient_data", () => {
  const insight = getUnderutilizers(
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

// ── Example-based edge cases ─────────────────────────────────────────────────

test("underutilizers reports only strictly-under users, ascending by user_id", () => {
  const users: UserMetrics[] = [
    makeUser("u3", "pro", 99), // 99 < 100 -> underutilizer
    makeUser("u1", "team", 250), // 250 == 250 (25% of 1000) -> NOT (strict <)
    makeUser("u2", "enterprise", 100), // 100 < 500 -> underutilizer
    makeUser("u0", "free", 0), // allowance 0 -> excluded
    makeUser("u4", null, 0), // null tier -> excluded
    makeUser("u5", "ghost", 0), // unmapped tier -> excluded
  ];
  const insight = getUnderutilizers(
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
  expect(insight.detail!.userIds).toBe("u2,u3"); // ascending by id
  expect(insight.detail!.count).toBe(2);
  expect(insight.magnitude).toBe(2);
  expect(insight.detail!.thresholdPct).toBe(25);
});

test("a custom 50% threshold widens the underutilizer set", () => {
  const users: UserMetrics[] = [
    makeUser("a", "pro", 150), // 150 < 200 (50% of 400) -> underutilizer
    makeUser("b", "pro", 200), // 200 == 200 -> NOT (strict <)
    makeUser("c", "pro", 99), // 99 < 200 -> underutilizer
  ];
  const insight = getUnderutilizers(
    computeCreditDepletionInsights(
      {
        range: "month",
        aggregate: aggregateWithStart(),
        userMetrics: users,
        allowanceByTier: ALLOWANCE_BY_TIER,
      },
      withPct(50),
    ),
  )!;
  expect(insight.status).toBe("ok");
  expect(insight.detail!.userIds).toBe("a,c");
  expect(insight.detail!.count).toBe(2);
  expect(insight.detail!.thresholdPct).toBe(50);
});

test("no underutilizers yields an empty userIds string and zero count", () => {
  const users: UserMetrics[] = [
    makeUser("a", "pro", 400), // fully consumed
    makeUser("b", "team", 1000), // fully consumed
  ];
  const insight = getUnderutilizers(
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
  expect(insight.detail!.userIds).toBe("");
  expect(insight.detail!.count).toBe(0);
  expect(insight.magnitude).toBe(0);
});
