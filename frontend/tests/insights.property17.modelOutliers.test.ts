/**
 * Feature: insights-section, Property 17: Per-user model outlier membership, ordering, and cap
 *
 * Property 17 (design.md): For all per-user model message sets, a user is reported
 * as a model outlier if and only if the user's total messages is at least the
 * configured minimum (default 5, `config.modelOutlierMinMessages`) AND the user's
 * dominant model differs from the overall dominant model; the result is ordered by
 * descending user message count and capped at the configured maximum (default 50,
 * `config.modelOutlierMaxUsers`).
 *
 * Validates: Requirements 6.5
 *
 * The function under test is `computeModelUsageInsights({ aggregate, userMetrics },
 * config)` from lib/insights/modelUsage.ts. Each per-user outlier insight has:
 *   - `id` equal to `modelUsage-outlier-<userId>`,
 *   - `status` `ok`,
 *   - `magnitude` equal to the user's message count,
 *   - `detail.user_id`, `detail.dominant_model`, `detail.overall_dominant_model`,
 *     and `detail.message_count`.
 * When per-user metrics are present but none qualify, a single
 * `modelUsage-outliers-none` insight is emitted instead of any outlier insight.
 *
 * The user's message count and dominant model are derived from
 * `UserMetrics.model_messages` (a `Record<string, number>`). The overall dominant
 * model comes from `aggregate.model_distribution` (highest share, lexicographic
 * tie-break).
 *
 * ## Determinism note
 *
 * All model_messages counts and the overall model_distribution counts are
 * generated as NON-NEGATIVE INTEGERS. With integer counts, per-model shares are
 * exact rationals `count / total`, so the model with the maximum integer count is
 * the dominant model and ties occur exactly when counts are equal — exercising the
 * lexicographic tie-break with no floating-point boundary ambiguity. User
 * identifiers are generated DISTINCT (index-based, zero-padded) so the
 * descending-count ordering's ascending-userId tie-break is well-defined and the
 * outlier user set is unambiguous. The overall distribution is given a guaranteed
 * positive total so an overall dominant model always exists.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeModelUsageInsights } from "../lib/insights/modelUsage";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import type {
  AggregateMetrics,
  InsightConfig,
  UserMetrics,
} from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

/** Fixed-width, zero-padded model ids so lexicographic order equals index order. */
const MODEL_POOL = ["model-000", "model-001", "model-002", "model-003"];

const OUTLIER_PREFIX = "modelUsage-outlier-";
const NONE_ID = "modelUsage-outliers-none";

/** Pad an index into a fixed-width, lexicographically sortable user id. */
function userId(index: number): string {
  return `user-${String(index).padStart(3, "0")}`;
}

/** Map a per-pool count array into a `model_messages`-style distribution. */
function distOf(counts: number[]): Record<string, number> {
  const dist: Record<string, number> = {};
  MODEL_POOL.forEach((model, i) => {
    dist[model] = counts[i] ?? 0;
  });
  return dist;
}

/** Sum of (non-negative) counts; equivalent to the engine's userMessageCount. */
function sum(counts: number[]): number {
  return counts.reduce((acc, c) => acc + (c > 0 ? c : 0), 0);
}

/**
 * Independent oracle for the dominant model of an integer distribution: the model
 * with the maximum count, ties broken by the lexicographically smallest id. Mirrors
 * the engine, where share = count/total is monotonic in count for a fixed total.
 */
function dominantByCount(dist: Record<string, number>): string {
  let best = "";
  let bestCount = -1;
  for (const model of Object.keys(dist).sort()) {
    if (dist[model] > bestCount) {
      bestCount = dist[model];
      best = model;
    }
  }
  return best;
}

/**
 * Build a minimal but complete `AggregateMetrics` carrying the supplied
 * `model_distribution`. Only `model_distribution` is read for the outlier
 * computation, so the remaining fields are inert and `daily_totals` is empty.
 */
function buildAggregate(
  modelDistribution: Record<string, number>,
): AggregateMetrics {
  return {
    range: "month",
    start_date: "2024-01-01",
    end_date: "2024-01-31",
    total_messages: 0,
    total_chat_conversations: 0,
    total_credits_used: 0,
    active_user_count: 0,
    avg_messages_per_user: 0,
    avg_conversations_per_user: 0,
    model_distribution: modelDistribution,
    daily_totals: [],
  };
}

/**
 * Build a minimal but complete `UserMetrics`. Only `user_id`, `label`, and
 * `model_messages` are read for the outlier computation; the remaining required
 * fields are filled with inert values.
 */
function buildUser(id: string, counts: number[]): UserMetrics {
  return {
    user_id: id,
    label: `User ${id}`,
    total_messages: sum(counts),
    chat_conversations: 0,
    credits_used: 0,
    active_days: 0,
    model_messages: distOf(counts),
    subscription_tier: null,
    adoption_score: 0,
    daily_breakdown: [],
    overage_cap: 0,
    overage_credits_used: 0,
  };
}

/** A per-pool array of small non-negative integer counts. */
const countsArb = (): fc.Arbitrary<number[]> =>
  fc.array(fc.integer({ min: 0, max: 6 }), {
    minLength: MODEL_POOL.length,
    maxLength: MODEL_POOL.length,
  });

/**
 * The overall `model_distribution`: small non-negative integer counts over the
 * pool with a guaranteed strictly-positive total so an overall dominant exists.
 */
const overallDistArb = (): fc.Arbitrary<Record<string, number>> =>
  countsArb().map((counts) => {
    const adjusted = counts.slice();
    if (sum(adjusted) === 0) {
      adjusted[0] = 1;
    }
    return distOf(adjusted);
  });

/** A scenario: an overall distribution plus a list of per-user count arrays. */
const scenarioArb = (maxUsers: number) =>
  fc.record({
    overall: overallDistArb(),
    users: fc.array(countsArb(), { minLength: 0, maxLength: maxUsers }),
  });

/**
 * Compute the expected, ordered list of outlier user ids for a scenario under the
 * given config. A user qualifies when message count >= min AND its dominant model
 * differs from the overall dominant; the list is ordered by descending message
 * count (ascending userId tie-break) and capped at the configured maximum.
 */
function expectedOutliers(
  overall: Record<string, number>,
  users: number[][],
  config: InsightConfig,
): { userId: string; count: number; dominant: string }[] {
  const overallDominant = dominantByCount(overall);
  const qualifying = users
    .map((counts, i) => ({
      userId: userId(i),
      count: sum(counts),
      dominant: dominantByCount(distOf(counts)),
    }))
    .filter(
      (u) =>
        u.count >= config.modelOutlierMinMessages &&
        u.dominant !== overallDominant,
    );

  qualifying.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });

  return qualifying.slice(0, config.modelOutlierMaxUsers);
}

/**
 * Run the engine for a scenario/config and assert the outlier insights match the
 * independently-computed expectation (membership, ordering, magnitude, detail,
 * cap) and the "none qualify" handling.
 */
function checkScenario(
  overall: Record<string, number>,
  users: number[][],
  config: InsightConfig,
): boolean {
  const insights = computeModelUsageInsights(
    {
      aggregate: buildAggregate(overall),
      userMetrics: users.map((counts, i) => buildUser(userId(i), counts)),
    },
    config,
  );

  const overallDominant = dominantByCount(overall);
  const expected = expectedOutliers(overall, users, config);

  const outliers = insights.filter((i) => i.id.startsWith(OUTLIER_PREFIX));
  const noneInsight = insights.find((i) => i.id === NONE_ID);

  // Cap: never more than the configured maximum.
  expect(outliers.length).toBeLessThanOrEqual(config.modelOutlierMaxUsers);

  if (expected.length === 0) {
    // No qualifying users: no outlier insights at all.
    expect(outliers.length).toBe(0);
    // When per-user metrics are present, a single "none" insight is emitted;
    // when there are no users at all, neither is emitted.
    if (users.length > 0) {
      expect(noneInsight).toBeDefined();
      expect(noneInsight!.status).toBe("ok");
      expect(noneInsight!.detail!.outlier_count).toBe(0);
    } else {
      expect(noneInsight).toBeUndefined();
    }
    return true;
  }

  // Qualifying users present: the "none" insight must NOT appear.
  expect(noneInsight).toBeUndefined();

  // Membership + ordering: emitted ids equal the expected ordered ids.
  const emittedIds = outliers.map((i) => i.id);
  const expectedIds = expected.map((e) => `${OUTLIER_PREFIX}${e.userId}`);
  expect(emittedIds).toEqual(expectedIds);

  // Ordering invariant: descending message count, ascending userId on ties.
  for (let i = 1; i < outliers.length; i++) {
    const prev = outliers[i - 1];
    const cur = outliers[i];
    const prevCount = prev.magnitude as number;
    const curCount = cur.magnitude as number;
    expect(prevCount).toBeGreaterThanOrEqual(curCount);
    if (prevCount === curCount) {
      const prevUser = prev.detail!.user_id as string;
      const curUser = cur.detail!.user_id as string;
      expect(prevUser < curUser).toBe(true);
    }
  }

  // Per-insight value + detail correctness against the oracle.
  outliers.forEach((insight, idx) => {
    const exp = expected[idx];
    expect(insight.status).toBe("ok");
    expect(insight.magnitude).toBe(exp.count);
    expect(insight.detail).toBeDefined();
    expect(insight.detail!.user_id).toBe(exp.userId);
    expect(insight.detail!.message_count).toBe(exp.count);
    expect(insight.detail!.dominant_model).toBe(exp.dominant);
    expect(insight.detail!.overall_dominant_model).toBe(overallDominant);
    // An outlier's dominant model genuinely differs from the overall dominant.
    expect(exp.dominant).not.toBe(overallDominant);
  });

  return true;
}

// ── Property 17 (default config): membership, ordering, and cap ───────────────

test("Property 17: outlier user set, descending-count ordering, and cap hold under the default config", () => {
  fc.assert(
    fc.property(scenarioArb(30), ({ overall, users }) => {
      return checkScenario(overall, users, DEFAULT_INSIGHT_CONFIG);
    }),
    { numRuns: RUNS },
  );
});

// ── Property 17 (custom small cap): the configured maximum is enforced ────────

test("Property 17: a custom small modelOutlierMaxUsers caps the outlier list", () => {
  const config: InsightConfig = {
    ...DEFAULT_INSIGHT_CONFIG,
    modelOutlierMaxUsers: 3,
  };
  fc.assert(
    fc.property(scenarioArb(30), ({ overall, users }) => {
      return checkScenario(overall, users, config);
    }),
    { numRuns: RUNS },
  );
});

// ── Property 17 (custom minimum): the message-count threshold is honored ──────

test("Property 17: a custom modelOutlierMinMessages threshold is honored", () => {
  const config: InsightConfig = {
    ...DEFAULT_INSIGHT_CONFIG,
    modelOutlierMinMessages: 10,
  };
  fc.assert(
    fc.property(scenarioArb(30), ({ overall, users }) => {
      return checkScenario(overall, users, config);
    }),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("a user below the minimum-message threshold is not an outlier", () => {
  // Overall dominant is model-000. User's dominant differs (model-001) but the
  // user has only 4 messages (< default min of 5), so they do not qualify.
  const insights = computeModelUsageInsights(
    {
      aggregate: buildAggregate({ "model-000": 10, "model-001": 1 }),
      userMetrics: [buildUser("user-000", [0, 4, 0, 0])],
    },
    DEFAULT_INSIGHT_CONFIG,
  );
  expect(insights.some((i) => i.id.startsWith(OUTLIER_PREFIX))).toBe(false);
  const none = insights.find((i) => i.id === NONE_ID);
  expect(none).toBeDefined();
  expect(none!.detail!.outlier_count).toBe(0);
});

test("a user whose dominant matches the overall dominant is not an outlier", () => {
  // Overall dominant is model-000; the user's dominant is also model-000.
  const insights = computeModelUsageInsights(
    {
      aggregate: buildAggregate({ "model-000": 10, "model-001": 1 }),
      userMetrics: [buildUser("user-000", [9, 0, 0, 0])],
    },
    DEFAULT_INSIGHT_CONFIG,
  );
  expect(insights.some((i) => i.id.startsWith(OUTLIER_PREFIX))).toBe(false);
  expect(insights.find((i) => i.id === NONE_ID)).toBeDefined();
});

test("qualifying outliers are ordered by descending message count", () => {
  // Overall dominant: model-000. All three users are dominated by model-001
  // (differs from overall), with message counts 6, 12, 8 respectively.
  const insights = computeModelUsageInsights(
    {
      aggregate: buildAggregate({ "model-000": 100, "model-001": 1 }),
      userMetrics: [
        buildUser("user-000", [0, 6, 0, 0]), // 6
        buildUser("user-001", [0, 12, 0, 0]), // 12
        buildUser("user-002", [0, 8, 0, 0]), // 8
      ],
    },
    DEFAULT_INSIGHT_CONFIG,
  );
  const outliers = insights.filter((i) => i.id.startsWith(OUTLIER_PREFIX));
  expect(outliers.map((i) => i.detail!.user_id)).toEqual([
    "user-001",
    "user-002",
    "user-000",
  ]);
  expect(outliers.map((i) => i.magnitude)).toEqual([12, 8, 6]);
});

test("equal message counts break ties by ascending user id", () => {
  // Two outliers tied at 7 messages; user-000 sorts before user-001.
  const insights = computeModelUsageInsights(
    {
      aggregate: buildAggregate({ "model-000": 100, "model-001": 1 }),
      userMetrics: [
        buildUser("user-001", [0, 7, 0, 0]),
        buildUser("user-000", [0, 7, 0, 0]),
      ],
    },
    DEFAULT_INSIGHT_CONFIG,
  );
  const outliers = insights.filter((i) => i.id.startsWith(OUTLIER_PREFIX));
  expect(outliers.map((i) => i.detail!.user_id)).toEqual([
    "user-000",
    "user-001",
  ]);
});

test("the outlier list is capped at the configured maximum", () => {
  // Five qualifying outliers, cap of 2 -> only the top 2 by count survive.
  const config: InsightConfig = {
    ...DEFAULT_INSIGHT_CONFIG,
    modelOutlierMaxUsers: 2,
  };
  const insights = computeModelUsageInsights(
    {
      aggregate: buildAggregate({ "model-000": 100, "model-001": 1 }),
      userMetrics: [
        buildUser("user-000", [0, 5, 0, 0]), // 5
        buildUser("user-001", [0, 9, 0, 0]), // 9
        buildUser("user-002", [0, 7, 0, 0]), // 7
        buildUser("user-003", [0, 6, 0, 0]), // 6
        buildUser("user-004", [0, 8, 0, 0]), // 8
      ],
    },
    config,
  );
  const outliers = insights.filter((i) => i.id.startsWith(OUTLIER_PREFIX));
  expect(outliers.length).toBe(2);
  expect(outliers.map((i) => i.detail!.user_id)).toEqual([
    "user-001",
    "user-004",
  ]);
});

test("present-but-none-qualify emits a single modelUsage-outliers-none insight", () => {
  const insights = computeModelUsageInsights(
    {
      aggregate: buildAggregate({ "model-000": 10, "model-001": 1 }),
      // Dominant matches overall (model-000), so no outliers qualify.
      userMetrics: [buildUser("user-000", [9, 0, 0, 0])],
    },
    DEFAULT_INSIGHT_CONFIG,
  );
  const none = insights.filter((i) => i.id === NONE_ID);
  expect(none.length).toBe(1);
  expect(none[0].status).toBe("ok");
  expect(none[0].detail!.outlier_count).toBe(0);
  expect(insights.some((i) => i.id.startsWith(OUTLIER_PREFIX))).toBe(false);
});

test("no per-user metrics emits neither outlier nor none insights", () => {
  const insights = computeModelUsageInsights(
    { aggregate: buildAggregate({ "model-000": 10 }), userMetrics: null },
    DEFAULT_INSIGHT_CONFIG,
  );
  expect(insights.some((i) => i.id.startsWith(OUTLIER_PREFIX))).toBe(false);
  expect(insights.find((i) => i.id === NONE_ID)).toBeUndefined();
});
