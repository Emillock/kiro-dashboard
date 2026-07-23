/**
 * Feature: insights-section, Property 18: High-cost user selection, ordering, and cap
 *
 * Property 18 (design.md): For all user sets, the high-cost list includes only
 * users with total_messages > 0, is ordered by descending Credit_Efficiency, and
 * contains at most the configured limit (default 10, config.highCostUserLimit)
 * entries.
 *
 * Validates: Requirements 7.3
 *
 * ## Function under test
 *
 * `computeCostEfficiencyInsights({ dailyTotals, userMetrics }, config)` from
 * lib/insights/costEfficiency.ts. The high-cost insights have ids
 * `costEfficiency-high-cost-<userId>`, a `magnitude` of
 * `round2(credits_used / total_messages)`, and a `detail` carrying
 * `{ rank, userId, creditsUsed, totalMessages, creditEfficiency }`.
 *
 * Per the implementation (Requirement 7.3, Property 18):
 *   - only users with `total_messages > 0` qualify (zero-message users are excluded);
 *   - qualifying users are sorted by descending Credit_Efficiency, ties broken by
 *     ascending `userId`;
 *   - the list is sliced to `config.highCostUserLimit` entries.
 *
 * ## Determinism note
 *
 * Efficiency ties are common (e.g. several users at the same credits/messages
 * ratio), and the implementation breaks ties by ascending `userId`. The oracle
 * here mirrors that tie-break EXACTLY. Inputs are constrained to INTEGER
 * `total_messages` / `credits_used` with DISTINCT user ids, and the oracle reuses
 * the SAME `round2` helper applied to the SAME operands in the SAME division
 * order as the engine, so the rounded efficiencies are bit-identical and the
 * ordering/comparison is exact (`toBe`/`toEqual`).
 *
 * `dailyTotals` is passed as `[]`: the high-cost ranking depends only on
 * `userMetrics`, and this test inspects only the high-cost insights, so the
 * aggregate-driven insights are irrelevant here.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeCostEfficiencyInsights } from "../lib/insights/costEfficiency";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import { round2 } from "../lib/insights/math";
import type { Insight, InsightConfig, UserMetrics } from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const HIGH_COST_PREFIX = "costEfficiency-high-cost-";

// ── Generators ───────────────────────────────────────────────────────────────

const nonNegInt = (max = 100000): fc.Arbitrary<number> => fc.nat({ max });

interface UserSpec {
  totalMessages: number;
  creditsUsed: number;
}

/** Build a minimal, valid UserMetrics from a unique id and integer metrics. */
function userMetricsFrom(userId: string, spec: UserSpec): UserMetrics {
  return {
    user_id: userId,
    label: `User ${userId}`,
    total_messages: spec.totalMessages,
    chat_conversations: 0,
    credits_used: spec.creditsUsed,
    active_days: 0,
    model_messages: {},
    subscription_tier: null,
    adoption_score: 0,
    daily_breakdown: [],
    overage_cap: 0,
    overage_credits_used: 0,
  };
}

/**
 * A set of UserMetrics with DISTINCT user ids. Some users are forced to have
 * `total_messages === 0` (so we can confirm they are excluded). The ids are
 * zero-padded so lexical ordering is well defined and deterministic; the
 * generator shuffles the assignment of specs to ids so input order never
 * coincides with the expected output order by accident.
 */
const userMetricsSet = (): fc.Arbitrary<UserMetrics[]> =>
  fc
    .array(
      fc.record({
        // A mix of zero and positive message counts; zeros must be excluded.
        totalMessages: fc.oneof(
          fc.constant(0),
          fc.integer({ min: 1, max: 100000 }),
        ),
        creditsUsed: nonNegInt(),
      }),
      { minLength: 0, maxLength: 40 },
    )
    .map((specs) =>
      specs.map((spec, i) =>
        userMetricsFrom(`u${String(i).padStart(4, "0")}`, spec),
      ),
    );

// ── Oracle (independent of the engine, sharing only `round2`) ────────────────

interface ExpectedEntry {
  userId: string;
  efficiency: number;
}

/**
 * Compute the expected high-cost ranking independently:
 *   1. keep only users with total_messages > 0,
 *   2. efficiency = round2(credits_used / total_messages),
 *   3. sort by descending efficiency, ties by ascending userId,
 *   4. slice to the configured limit.
 */
function expectedHighCost(
  users: UserMetrics[],
  config: InsightConfig,
): ExpectedEntry[] {
  return users
    .filter((u) => u.total_messages > 0)
    .map((u) => ({
      userId: u.user_id,
      efficiency: round2(u.credits_used / u.total_messages),
    }))
    .sort((a, b) => {
      const byEfficiency = b.efficiency - a.efficiency; // descending
      if (byEfficiency !== 0) return byEfficiency;
      if (a.userId < b.userId) return -1;
      if (a.userId > b.userId) return 1;
      return 0;
    })
    .slice(0, config.highCostUserLimit);
}

/** Extract the high-cost insights from the engine output, in emitted order. */
function highCostInsights(insights: Insight[]): Insight[] {
  return insights.filter((ins) => ins.id.startsWith(HIGH_COST_PREFIX));
}

// ── Property 18: selection, ordering, and cap (default limit 10) ─────────────

test("Property 18: high-cost users match the oracle set, order, and cap (default limit)", () => {
  fc.assert(
    fc.property(userMetricsSet(), (users) => {
      const insights = computeCostEfficiencyInsights(
        { dailyTotals: [], userMetrics: users },
        DEFAULT_INSIGHT_CONFIG,
      );
      const emitted = highCostInsights(insights);
      const expected = expectedHighCost(users, DEFAULT_INSIGHT_CONFIG);

      // Cap: at most the configured limit entries (default 10).
      expect(emitted.length).toBeLessThanOrEqual(
        DEFAULT_INSIGHT_CONFIG.highCostUserLimit,
      );
      expect(emitted.length).toBe(expected.length);

      // Selection + ordering: emitted users equal the oracle exactly, in order.
      const emittedIds = emitted.map((ins) => ins.detail!.userId);
      const expectedIds = expected.map((e) => e.userId);
      expect(emittedIds).toEqual(expectedIds);

      emitted.forEach((ins, index) => {
        // id is keyed by the user id.
        expect(ins.id).toBe(`${HIGH_COST_PREFIX}${expected[index].userId}`);
        // magnitude is the round2 efficiency, matching the oracle exactly.
        expect(ins.magnitude).toBe(expected[index].efficiency);
        // detail carries the 1-based rank and the matching efficiency.
        expect(ins.detail!.rank).toBe(index + 1);
        expect(ins.detail!.creditEfficiency).toBe(expected[index].efficiency);
        expect(ins.status).toBe("ok");

        // Exclusion invariant: every emitted user had total_messages > 0, which
        // the engine reports in detail.totalMessages.
        expect(ins.detail!.totalMessages as number).toBeGreaterThan(0);
      });

      // Ordering invariant restated directly on the emitted list: efficiencies
      // are non-increasing, and equal efficiencies are ordered by ascending id.
      for (let i = 1; i < emitted.length; i++) {
        const prev = emitted[i - 1];
        const cur = emitted[i];
        const prevEff = prev.magnitude!;
        const curEff = cur.magnitude!;
        expect(prevEff).toBeGreaterThanOrEqual(curEff);
        if (prevEff === curEff) {
          expect(
            (prev.detail!.userId as string) < (cur.detail!.userId as string),
          ).toBe(true);
        }
      }

      // Excluded-user invariant: no user with total_messages === 0 appears.
      const zeroIds = new Set(
        users.filter((u) => u.total_messages === 0).map((u) => u.user_id),
      );
      emittedIds.forEach((id) => {
        expect(zeroIds.has(id as string)).toBe(false);
      });
    }),
    { numRuns: RUNS },
  );
});

// ── Property 18: cap is exercised with a small custom limit ──────────────────

test("Property 18: a small custom highCostUserLimit caps the emitted list", () => {
  const customLimit = 3;
  const config: InsightConfig = {
    ...DEFAULT_INSIGHT_CONFIG,
    highCostUserLimit: customLimit,
  };

  fc.assert(
    fc.property(
      // Force MANY qualifying users so the cap actually bites most of the time.
      fc
        .array(
          fc.record({
            totalMessages: fc.integer({ min: 1, max: 100000 }),
            creditsUsed: nonNegInt(),
          }),
          { minLength: 1, maxLength: 30 },
        )
        .map((specs) =>
          specs.map((spec, i) =>
            userMetricsFrom(`u${String(i).padStart(4, "0")}`, spec),
          ),
        ),
      (users) => {
        const insights = computeCostEfficiencyInsights(
          { dailyTotals: [], userMetrics: users },
          config,
        );
        const emitted = highCostInsights(insights);
        const expected = expectedHighCost(users, config);

        // Cap holds at the custom limit.
        expect(emitted.length).toBeLessThanOrEqual(customLimit);
        expect(emitted.length).toBe(
          Math.min(users.length, customLimit),
        );
        expect(emitted.length).toBe(expected.length);

        const emittedIds = emitted.map((ins) => ins.detail!.userId);
        const expectedIds = expected.map((e) => e.userId);
        expect(emittedIds).toEqual(expectedIds);
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("zero-message users are excluded from the high-cost list", () => {
  const users: UserMetrics[] = [
    userMetricsFrom("a", { totalMessages: 0, creditsUsed: 100 }), // excluded
    userMetricsFrom("b", { totalMessages: 10, creditsUsed: 50 }), // 5.0
    userMetricsFrom("c", { totalMessages: 0, creditsUsed: 0 }), // excluded
  ];
  const insights = computeCostEfficiencyInsights(
    { dailyTotals: [], userMetrics: users },
    DEFAULT_INSIGHT_CONFIG,
  );
  const emitted = highCostInsights(insights);
  expect(emitted.map((i) => i.detail!.userId)).toEqual(["b"]);
  expect(emitted[0].magnitude).toBe(5);
});

test("ties on efficiency are ordered by ascending user id", () => {
  // All three have efficiency 2.0; expected order is ascending id: a, b, c.
  const users: UserMetrics[] = [
    userMetricsFrom("c", { totalMessages: 5, creditsUsed: 10 }),
    userMetricsFrom("a", { totalMessages: 2, creditsUsed: 4 }),
    userMetricsFrom("b", { totalMessages: 1, creditsUsed: 2 }),
  ];
  const insights = computeCostEfficiencyInsights(
    { dailyTotals: [], userMetrics: users },
    DEFAULT_INSIGHT_CONFIG,
  );
  const emitted = highCostInsights(insights);
  expect(emitted.map((i) => i.detail!.userId)).toEqual(["a", "b", "c"]);
  emitted.forEach((ins) => expect(ins.magnitude).toBe(2));
});

test("descending efficiency order with a clear ranking", () => {
  const users: UserMetrics[] = [
    userMetricsFrom("low", { totalMessages: 10, creditsUsed: 10 }), // 1.0
    userMetricsFrom("high", { totalMessages: 2, creditsUsed: 20 }), // 10.0
    userMetricsFrom("mid", { totalMessages: 4, creditsUsed: 20 }), // 5.0
  ];
  const insights = computeCostEfficiencyInsights(
    { dailyTotals: [], userMetrics: users },
    DEFAULT_INSIGHT_CONFIG,
  );
  const emitted = highCostInsights(insights);
  expect(emitted.map((i) => i.detail!.userId)).toEqual(["high", "mid", "low"]);
  expect(emitted.map((i) => i.magnitude)).toEqual([10, 5, 1]);
});

test("null userMetrics omits high-cost insights entirely", () => {
  const insights = computeCostEfficiencyInsights(
    { dailyTotals: [], userMetrics: null },
    DEFAULT_INSIGHT_CONFIG,
  );
  expect(highCostInsights(insights)).toHaveLength(0);
});
