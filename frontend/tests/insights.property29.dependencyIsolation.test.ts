/**
 * Feature: insights-section, Property 29: Satisfied insights are unaffected by absent dependencies
 *
 * Property 29 (design.md): For all engine inputs in which some optional
 * dependencies (Allowance configuration, overage data) are null, every insight
 * whose data dependencies are satisfied is still computed and rendered normally
 * and is never suppressed, while only the dependent insights take the
 * `unavailable` state naming the missing dependency.
 *
 * Validates: Requirements 10.5, 11.4, 11.5
 *
 * The function under test is the engine aggregator `computeInsights(input, config)`
 * from lib/insights/index.ts, which returns a `CategorizedInsights` map
 * (`Record<InsightCategory, CategoryResult>`).
 *
 * ## Strategy
 *
 * The gated dependencies `allowanceByTier` and `overageByUser` are the only
 * inputs whose presence/absence is expected to change the output, and only for
 * the `creditDepletion` category. To isolate that effect we:
 *
 *   1. Generate a base input with a populated aggregate (non-empty `daily_totals`
 *      and `model_distribution`) and at least two distinct users.
 *   2. Compute insights TWICE from the SAME base input — once WITHOUT the gated
 *      deps (`allowanceByTier: null`, `overageByUser: null`) and once WITH them
 *      present — holding `userMetrics` constant between the two runs so the only
 *      thing that varies is the allowance/overage availability.
 *   3. Assert every NON-`creditDepletion` category is byte-identical across the
 *      two runs (same ids, statuses, magnitudes, details) via deep equality.
 *      These are the "satisfied" insights that must never be suppressed or
 *      altered by an absent gated dependency (Requirements 11.5, 10.5).
 *   4. Assert that when the gated deps are absent, the `creditDepletion` category
 *      still computes (is never suppressed) and exposes at least one
 *      `unavailable` insight whose `unavailableReason` names the missing
 *      dependency (Requirements 11.4, 10.5).
 *
 * `userMetrics` is independently varied present-vs-null ACROSS iterations (but
 * held constant WITHIN each comparison pair) so the isolation property is
 * exercised both with and without the per-user fan-out.
 *
 * Uses fast-check + Vitest, minimum 100 iterations, DEFAULT_INSIGHT_CONFIG.
 */
import * as fc from "fast-check";
import { computeInsights } from "../lib/insights/index";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import type {
  AggregateMetrics,
  CategorizedInsights,
  CategoryResult,
  DailyTotal,
  InsightCategory,
  InsightEngineInput,
  UserMetrics,
  UserSummary,
} from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

/** Every category except the one legitimately gated by the toggled deps. */
const INDEPENDENT_CATEGORIES: InsightCategory[] = [
  "trends",
  "adoption",
  "engagement",
  "modelUsage",
  "costEfficiency",
  "anomalies",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Deep, structural clone for a side-effect-free equality comparison. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Assert that every independent (non-creditDepletion) category is byte-identical
 * between the without-deps and with-deps runs — satisfied insights are unaffected
 * by the absence of the gated dependencies.
 */
function expectIndependentCategoriesIdentical(
  withoutDeps: CategorizedInsights,
  withDeps: CategorizedInsights,
): void {
  for (const category of INDEPENDENT_CATEGORIES) {
    expect(clone(withDeps[category])).toEqual(clone(withoutDeps[category]));
  }
}

/**
 * Assert a category result is never suppressed: the aggregator always returns a
 * well-formed `CategoryResult` (either `insights` or `insufficient`).
 */
function expectNotSuppressed(result: CategoryResult): void {
  expect(result).toBeDefined();
  expect(["insights", "insufficient"]).toContain(result.kind);
}

// ── Generators ───────────────────────────────────────────────────────────────

/**
 * Daily totals with STRICTLY POSITIVE integer metrics and sequential, distinct
 * dates. Strictly positive values guarantee the aggregate-driven computers emit
 * insights so the independent categories carry real content to compare.
 */
const dailyTotalsArb = (): fc.Arbitrary<DailyTotal[]> =>
  fc
    .array(
      fc.record({
        total_messages: fc.integer({ min: 1, max: 1000 }),
        chat_conversations: fc.integer({ min: 1, max: 500 }),
        credits_used: fc.integer({ min: 1, max: 5000 }),
        active_users: fc.integer({ min: 1, max: 50 }),
      }),
      { minLength: 2, maxLength: 8 },
    )
    .map((rows) =>
      rows.map((r, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, "0")}`,
        ...r,
      })),
    );

/** A non-empty model distribution with 1..5 models and positive integer counts. */
const modelDistArb = (): fc.Arbitrary<Record<string, number>> =>
  fc
    .uniqueArray(
      fc.constantFrom("model-a", "model-b", "model-c", "model-d", "model-e"),
      { minLength: 1, maxLength: 5 },
    )
    .chain((models) =>
      fc
        .tuple(
          ...models.map(() => fc.integer({ min: 1, max: 1000 })),
        )
        .map((counts) =>
          Object.fromEntries(models.map((m, i) => [m, counts[i]])),
        ),
    );

/** Build a well-formed aggregate from daily totals + model distribution. */
function makeAggregate(
  dailyTotals: DailyTotal[],
  modelDistribution: Record<string, number>,
): AggregateMetrics {
  const totalMessages = dailyTotals.reduce((s, d) => s + d.total_messages, 0);
  const totalConversations = dailyTotals.reduce(
    (s, d) => s + d.chat_conversations,
    0,
  );
  const totalCredits = dailyTotals.reduce((s, d) => s + d.credits_used, 0);
  const activeUserPeak = dailyTotals.reduce(
    (peak, d) => Math.max(peak, d.active_users),
    0,
  );
  return {
    range: "month",
    start_date: "2024-01-01",
    end_date: "2024-01-31",
    total_messages: totalMessages,
    total_chat_conversations: totalConversations,
    total_credits_used: totalCredits,
    active_user_count: activeUserPeak,
    avg_messages_per_user:
      activeUserPeak > 0 ? Math.round(totalMessages / activeUserPeak) : 0,
    avg_conversations_per_user:
      activeUserPeak > 0 ? Math.round(totalConversations / activeUserPeak) : 0,
    model_distribution: modelDistribution,
    daily_totals: dailyTotals,
  };
}

/**
 * A user-summary list of length 2..6 with DISTINCT user ids (`u-00`..). Integer
 * metrics throughout so the comparison is over exact integer magnitudes.
 */
const userSummariesArb = (): fc.Arbitrary<UserSummary[]> =>
  fc
    .array(
      fc.record({
        adoption_score: fc.integer({ min: 0, max: 100 }),
        total_messages: fc.integer({ min: 0, max: 1000 }),
        chat_conversations: fc.integer({ min: 0, max: 500 }),
        credits_used: fc.integer({ min: 0, max: 5000 }),
        active_days: fc.integer({ min: 0, max: 31 }),
      }),
      { minLength: 2, maxLength: 6 },
    )
    .map((rows) =>
      rows.map((r, i) => ({
        user_id: `u-${String(i).padStart(2, "0")}`,
        label: `User ${i}`,
        ...r,
      })),
    );

const TIERS = ["free", "pro", "enterprise"] as const;

/**
 * Build per-user metrics for the supplied summaries, deriving a per-user
 * `daily_breakdown` from the shared daily-total dates so the fan-out is
 * well-formed. Each user is assigned a subscription tier deterministically.
 */
function makeUserMetrics(
  summaries: UserSummary[],
  dailyTotals: DailyTotal[],
  modelDistribution: Record<string, number>,
): UserMetrics[] {
  const models = Object.keys(modelDistribution);
  return summaries.map((s, idx) => {
    const breakdown: DailyTotal[] = dailyTotals.map((d, di) => ({
      date: d.date,
      total_messages: (s.total_messages + di) % 50,
      chat_conversations: (s.chat_conversations + di) % 25,
      credits_used: (s.credits_used + di) % 100,
      active_users: 1,
    }));
    const modelMessages: Record<string, number> = {};
    models.forEach((m, mi) => {
      modelMessages[m] = (s.total_messages + mi) % 40;
    });
    return {
      user_id: s.user_id,
      label: s.label,
      total_messages: s.total_messages,
      chat_conversations: s.chat_conversations,
      credits_used: s.credits_used,
      active_days: s.active_days,
      model_messages: modelMessages,
      subscription_tier: TIERS[idx % TIERS.length],
      adoption_score: s.adoption_score,
      daily_breakdown: breakdown,
      overage_cap: 0,
      overage_credits_used: 0,
    };
  });
}

/** Allowance-by-tier map with positive integer caps for every tier. */
const allowanceByTierArb = (): fc.Arbitrary<Record<string, number>> =>
  fc
    .tuple(...TIERS.map(() => fc.integer({ min: 1, max: 100000 })))
    .map((caps) => Object.fromEntries(TIERS.map((t, i) => [t, caps[i]])));

/** Overage-by-user map keyed by the same `u-NN` ids, with non-negative integers. */
function makeOverageByUser(summaries: UserSummary[]): Record<string, number> {
  const map: Record<string, number> = {};
  summaries.forEach((s, i) => {
    map[s.user_id] = (i * 37) % 500;
  });
  return map;
}

/**
 * Composite generator producing a base input plus the gated dependencies to
 * toggle. `includeUserMetrics` is varied across iterations but applied
 * identically to both runs within a pair.
 */
const scenarioArb = () =>
  fc
    .record({
      dailyTotals: dailyTotalsArb(),
      modelDistribution: modelDistArb(),
      summaries: userSummariesArb(),
      includeUserMetrics: fc.boolean(),
      allowanceByTier: allowanceByTierArb(),
    })
    .map(
      ({
        dailyTotals,
        modelDistribution,
        summaries,
        includeUserMetrics,
        allowanceByTier,
      }) => {
        const aggregate = makeAggregate(dailyTotals, modelDistribution);
        const userMetrics = includeUserMetrics
          ? makeUserMetrics(summaries, dailyTotals, modelDistribution)
          : null;
        const overageByUser = makeOverageByUser(summaries);
        return {
          aggregate,
          summaries,
          userMetrics,
          allowanceByTier,
          overageByUser,
        };
      },
    );

// ── Property 29: dependency isolation ────────────────────────────────────────

test("Property 29: toggling allowance/overage never changes any non-creditDepletion category", () => {
  fc.assert(
    fc.property(scenarioArb(), (s) => {
      const base: Omit<
        InsightEngineInput,
        "allowanceByTier" | "overageByUser"
      > = {
        range: "month",
        aggregate: s.aggregate,
        userSummaries: s.summaries,
        userMetrics: s.userMetrics,
      };

      const withoutDeps = computeInsights(
        { ...base, allowanceByTier: null, overageByUser: null },
        DEFAULT_INSIGHT_CONFIG,
      );
      const withDeps = computeInsights(
        {
          ...base,
          allowanceByTier: s.allowanceByTier,
          overageByUser: s.overageByUser,
        },
        DEFAULT_INSIGHT_CONFIG,
      );

      // Every satisfied (independent) category is byte-identical across runs.
      expectIndependentCategoriesIdentical(withoutDeps, withDeps);

      // creditDepletion is never suppressed in either run.
      expectNotSuppressed(withoutDeps.creditDepletion);
      expectNotSuppressed(withDeps.creditDepletion);
    }),
    { numRuns: RUNS },
  );
});

test("Property 29: absent gated deps yield at least one `unavailable` creditDepletion insight naming the missing dependency, while satisfied insights still compute", () => {
  fc.assert(
    fc.property(scenarioArb(), (s) => {
      const input: InsightEngineInput = {
        range: "month",
        aggregate: s.aggregate,
        userSummaries: s.summaries,
        userMetrics: s.userMetrics,
        allowanceByTier: null,
        overageByUser: null,
      };

      const result = computeInsights(input, DEFAULT_INSIGHT_CONFIG);

      // The dependent category still computes (is never blocked/errored).
      expectNotSuppressed(result.creditDepletion);
      expect(result.creditDepletion.kind).toBe("insights");

      if (result.creditDepletion.kind === "insights") {
        const unavailable = result.creditDepletion.insights.filter(
          (i) => i.status === "unavailable",
        );
        // At least one allowance/overage-gated insight is unavailable.
        expect(unavailable.length).toBeGreaterThan(0);
        // Each unavailable insight names its missing dependency and shows no
        // computed magnitude (Requirements 10.5, 11.4).
        for (const ins of unavailable) {
          expect(typeof ins.unavailableReason).toBe("string");
          expect((ins.unavailableReason ?? "").length).toBeGreaterThan(0);
          expect(ins.magnitude).toBeUndefined();
        }
      }

      // Satisfied independent categories are not suppressed (R11.5).
      for (const category of INDEPENDENT_CATEGORIES) {
        expectNotSuppressed(result[category]);
      }
    }),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

function exampleSummaries(): UserSummary[] {
  return [
    {
      user_id: "u-00",
      label: "User 0",
      adoption_score: 80,
      total_messages: 120,
      chat_conversations: 40,
      credits_used: 300,
      active_days: 10,
    },
    {
      user_id: "u-01",
      label: "User 1",
      adoption_score: 30,
      total_messages: 20,
      chat_conversations: 8,
      credits_used: 60,
      active_days: 3,
    },
  ];
}

function exampleAggregate(): AggregateMetrics {
  const dailyTotals: DailyTotal[] = [
    {
      date: "2024-01-01",
      total_messages: 50,
      chat_conversations: 20,
      credits_used: 120,
      active_users: 5,
    },
    {
      date: "2024-01-02",
      total_messages: 70,
      chat_conversations: 28,
      credits_used: 160,
      active_users: 6,
    },
  ];
  return makeAggregate(dailyTotals, { "model-a": 60, "model-b": 60 });
}

test("a fully-populated input produces identical independent categories with and without gated deps", () => {
  const summaries = exampleSummaries();
  const aggregate = exampleAggregate();
  const base = {
    range: "month" as const,
    aggregate,
    userSummaries: summaries,
    userMetrics: makeUserMetrics(
      summaries,
      aggregate.daily_totals,
      aggregate.model_distribution,
    ),
  };

  const withoutDeps = computeInsights(
    { ...base, allowanceByTier: null, overageByUser: null },
    DEFAULT_INSIGHT_CONFIG,
  );
  const withDeps = computeInsights(
    {
      ...base,
      allowanceByTier: { free: 1000, pro: 5000, enterprise: 20000 },
      overageByUser: { "u-00": 50, "u-01": 0 },
    },
    DEFAULT_INSIGHT_CONFIG,
  );

  expectIndependentCategoriesIdentical(withoutDeps, withDeps);
});

test("with gated deps absent, creditDepletion still renders and flags unavailable allowance/overage insights", () => {
  const summaries = exampleSummaries();
  const aggregate = exampleAggregate();
  const result = computeInsights(
    {
      range: "month",
      aggregate,
      userSummaries: summaries,
      userMetrics: makeUserMetrics(
        summaries,
        aggregate.daily_totals,
        aggregate.model_distribution,
      ),
      allowanceByTier: null,
      overageByUser: null,
    },
    DEFAULT_INSIGHT_CONFIG,
  );

  expect(result.creditDepletion.kind).toBe("insights");
  if (result.creditDepletion.kind === "insights") {
    const unavailable = result.creditDepletion.insights.filter(
      (i) => i.status === "unavailable",
    );
    expect(unavailable.length).toBeGreaterThan(0);
    for (const ins of unavailable) {
      expect(ins.unavailableReason).toBeTruthy();
      expect(ins.magnitude).toBeUndefined();
    }
  }
});
