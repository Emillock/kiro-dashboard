/**
 * Feature: insights-section, Property 11: Whole-category insufficiency when minimum data is absent
 *
 * Property 11 (design.md): For all inputs where a category's minimum precondition
 * is unmet (fewer than two users for adoption, empty model_distribution for model
 * usage, zero daily totals for aggregate-driven categories), the category result
 * is the `insufficient` kind and its data-dependent sub-insights are suppressed
 * (no fabricated numeric values).
 *
 * Validates: Requirements 4.6, 6.6, 12.1
 *
 * The function under test is the engine aggregator `computeInsights(input, config)`
 * from lib/insights/index.ts, which returns a `CategorizedInsights` map
 * (`Record<InsightCategory, CategoryResult>`). Each `CategoryResult` is either
 * `{ kind: "insights"; insights: Insight[] }` or `{ kind: "insufficient"; reason }`.
 *
 * This test asserts the aggregator's whole-category insufficiency mapping:
 *   - adoption    -> `insufficient` when fewer than two users are present
 *                    (userSummaries with < 2 entries and userMetrics null);
 *                    `insights` with >= 2 users.
 *   - modelUsage  -> `insufficient` when aggregate.model_distribution is empty
 *                    (or aggregate is null); `insights` with a non-empty
 *                    distribution.
 *   - aggregate-driven categories (trends, engagement, costEfficiency, anomalies)
 *                 -> `insufficient` when aggregate.daily_totals is empty / the
 *                    aggregate is null; `insights` when daily totals are present.
 *
 * When a category is `insufficient` it carries a non-empty `reason` string and
 * exposes NO `insights` array (no fabricated numeric insights).
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property,
 * DEFAULT_INSIGHT_CONFIG.
 */
import * as fc from "fast-check";
import { computeInsights } from "../lib/insights/index";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import type {
  AggregateMetrics,
  CategoryResult,
  DailyTotal,
  InsightEngineInput,
  UserSummary,
} from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

// ── Assertion helpers ────────────────────────────────────────────────────────

/**
 * Assert a category result is the whole-category `insufficient` kind: it carries
 * a non-empty `reason` string and exposes NO `insights` array (data-dependent
 * sub-insights are suppressed — no fabricated numeric values, R12.1).
 */
function expectInsufficient(result: CategoryResult): void {
  expect(result.kind).toBe("insufficient");
  // No `insights` array is exposed when the category is insufficient.
  expect("insights" in result).toBe(false);
  if (result.kind === "insufficient") {
    expect(typeof result.reason).toBe("string");
    expect(result.reason.length).toBeGreaterThan(0);
  }
}

/** Assert a category result is the `insights` kind carrying an insights array. */
function expectInsights(result: CategoryResult): void {
  expect(result.kind).toBe("insights");
  if (result.kind === "insights") {
    expect(Array.isArray(result.insights)).toBe(true);
  }
}

// ── Input builders ───────────────────────────────────────────────────────────

/**
 * Build a minimal valid `AggregateMetrics` from the supplied daily totals and
 * model distribution. Only `daily_totals` (presence) and `model_distribution`
 * (presence) drive the preconditions under test; the scalar totals are derived
 * consistently so the value is well-formed.
 */
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
  const activeUserCount = dailyTotals.reduce(
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
    active_user_count: activeUserCount,
    avg_messages_per_user: 0,
    avg_conversations_per_user: 0,
    model_distribution: modelDistribution,
    daily_totals: dailyTotals,
  };
}

// ── Generators ───────────────────────────────────────────────────────────────

/**
 * Daily totals with STRICTLY POSITIVE metrics and sequential, distinct dates.
 * Strictly positive values guarantee the aggregate-driven computers (trends,
 * engagement, costEfficiency) emit at least one insight whenever any day is
 * present, so a non-empty daily-totals range maps to `insights` (not
 * `insufficient`). The array may be empty to exercise the zero-daily-totals
 * precondition.
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
      { maxLength: 6 },
    )
    .map((rows) =>
      rows.map((r, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, "0")}`,
        ...r,
      })),
    );

/**
 * A model distribution that may be empty (exercising the empty-distribution
 * precondition, R6.6) or carry up to five models with positive counts.
 */
const modelDistArb = (): fc.Arbitrary<Record<string, number>> =>
  fc.dictionary(
    fc.string({
      unit: fc.constantFrom(..."abcdefghij".split("")),
      minLength: 1,
      maxLength: 5,
    }),
    fc.integer({ min: 1, max: 1000 }),
    { maxKeys: 5 },
  );

/**
 * A user-summary list whose length ranges over 0..6 (exercising the fewer-than-
 * two-users precondition, R4.6, as well as the sufficient case). User ids are
 * derived from the index so the leaderboard always has distinct users.
 */
const userSummariesArb = (): fc.Arbitrary<UserSummary[]> =>
  fc
    .array(
      fc.record({
        adoption_score: fc.integer({ min: 0, max: 100 }),
        total_messages: fc.nat({ max: 1000 }),
        chat_conversations: fc.nat({ max: 500 }),
        credits_used: fc.nat({ max: 5000 }),
        active_days: fc.nat({ max: 31 }),
      }),
      { maxLength: 6 },
    )
    .map((rows) =>
      rows.map((r, i) => ({
        user_id: `u-${String(i).padStart(2, "0")}`,
        label: `User ${i}`,
        ...r,
      })),
    );

/**
 * The composite engine-input generator. Independently varies whether the
 * aggregate is present, the daily totals, the model distribution, and the user
 * summaries (possibly null), so every combination of the three preconditions is
 * exercised. `userMetrics` is held `null` throughout so adoption sufficiency
 * depends purely on `userSummaries` (matching the property's stated condition).
 */
const engineInputArb = (): fc.Arbitrary<InsightEngineInput> =>
  fc
    .record({
      aggregatePresent: fc.boolean(),
      dailyTotals: dailyTotalsArb(),
      modelDistribution: modelDistArb(),
      userSummaries: fc.option(userSummariesArb(), { nil: null }),
    })
    .map(({ aggregatePresent, dailyTotals, modelDistribution, userSummaries }) => ({
      range: "month" as const,
      aggregate: aggregatePresent
        ? makeAggregate(dailyTotals, modelDistribution)
        : null,
      userSummaries,
      userMetrics: null,
    }));

// ── Property 11: whole-category insufficiency mapping ────────────────────────

test("Property 11: each category maps to insufficient exactly when its minimum precondition is unmet, and carries no insights array when insufficient", () => {
  fc.assert(
    fc.property(engineInputArb(), (input) => {
      const aggregate = input.aggregate;
      const dailyTotals = aggregate?.daily_totals ?? [];
      const hasDailyTotals = dailyTotals.length > 0;
      const hasModelDist =
        aggregate !== null &&
        Object.keys(aggregate.model_distribution).length > 0;
      const userCount = input.userSummaries ? input.userSummaries.length : 0;
      const adoptionSufficient = userCount >= 2;

      const result = computeInsights(input, DEFAULT_INSIGHT_CONFIG);

      // ── Adoption: insufficient when fewer than two users (R4.6) ───────────
      if (adoptionSufficient) {
        expectInsights(result.adoption);
      } else {
        expectInsufficient(result.adoption);
      }

      // ── Model usage: insufficient when distribution is empty (R6.6) ───────
      if (hasModelDist) {
        expectInsights(result.modelUsage);
      } else {
        expectInsufficient(result.modelUsage);
      }

      // ── Aggregate-driven: insufficient when no daily totals (Property 11) ─
      for (const category of [
        result.trends,
        result.engagement,
        result.costEfficiency,
        result.anomalies,
      ]) {
        if (hasDailyTotals) {
          expectInsights(category);
        } else {
          expectInsufficient(category);
        }
      }
    }),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("an entirely empty input makes every minimum-precondition category insufficient", () => {
  const input: InsightEngineInput = {
    range: "month",
    aggregate: null,
    userSummaries: null,
    userMetrics: null,
  };
  const result = computeInsights(input, DEFAULT_INSIGHT_CONFIG);

  expectInsufficient(result.adoption);
  expectInsufficient(result.modelUsage);
  expectInsufficient(result.trends);
  expectInsufficient(result.engagement);
  expectInsufficient(result.costEfficiency);
  expectInsufficient(result.anomalies);
});

test("exactly one user makes adoption insufficient (fewer than two users)", () => {
  const input: InsightEngineInput = {
    range: "month",
    aggregate: makeAggregate(
      [
        {
          date: "2024-01-01",
          total_messages: 10,
          chat_conversations: 4,
          credits_used: 20,
          active_users: 2,
        },
      ],
      { "model-a": 10 },
    ),
    userSummaries: [
      {
        user_id: "solo",
        label: "Solo",
        adoption_score: 50,
        total_messages: 10,
        chat_conversations: 4,
        credits_used: 20,
        active_days: 1,
      },
    ],
    userMetrics: null,
  };
  const result = computeInsights(input, DEFAULT_INSIGHT_CONFIG);

  expectInsufficient(result.adoption);
  // The other satisfied categories still compute.
  expectInsights(result.modelUsage);
  expectInsights(result.trends);
});

test("an empty model distribution makes only modelUsage insufficient while daily-totals categories still compute", () => {
  const dailyTotals: DailyTotal[] = [
    {
      date: "2024-01-01",
      total_messages: 12,
      chat_conversations: 5,
      credits_used: 30,
      active_users: 3,
    },
    {
      date: "2024-01-02",
      total_messages: 18,
      chat_conversations: 7,
      credits_used: 40,
      active_users: 4,
    },
  ];
  const input: InsightEngineInput = {
    range: "month",
    aggregate: makeAggregate(dailyTotals, {}),
    userSummaries: null,
    userMetrics: null,
  };
  const result = computeInsights(input, DEFAULT_INSIGHT_CONFIG);

  expectInsufficient(result.modelUsage);
  expectInsights(result.trends);
  expectInsights(result.engagement);
  expectInsights(result.costEfficiency);
  expectInsights(result.anomalies);
});

test("two or more users with a non-empty distribution and daily totals produce insights across categories", () => {
  const dailyTotals: DailyTotal[] = [
    {
      date: "2024-01-01",
      total_messages: 12,
      chat_conversations: 5,
      credits_used: 30,
      active_users: 3,
    },
    {
      date: "2024-01-02",
      total_messages: 20,
      chat_conversations: 8,
      credits_used: 50,
      active_users: 5,
    },
  ];
  const summaries: UserSummary[] = [
    {
      user_id: "a",
      label: "A",
      adoption_score: 80,
      total_messages: 30,
      chat_conversations: 12,
      credits_used: 60,
      active_days: 2,
    },
    {
      user_id: "b",
      label: "B",
      adoption_score: 40,
      total_messages: 10,
      chat_conversations: 5,
      credits_used: 20,
      active_days: 1,
    },
  ];
  const input: InsightEngineInput = {
    range: "month",
    aggregate: makeAggregate(dailyTotals, { "model-a": 25, "model-b": 7 }),
    userSummaries: summaries,
    userMetrics: null,
  };
  const result = computeInsights(input, DEFAULT_INSIGHT_CONFIG);

  expectInsights(result.adoption);
  expectInsights(result.modelUsage);
  expectInsights(result.trends);
  expectInsights(result.engagement);
  expectInsights(result.costEfficiency);
  expectInsights(result.anomalies);
});
