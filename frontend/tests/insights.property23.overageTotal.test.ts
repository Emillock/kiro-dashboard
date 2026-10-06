/**
 * Feature: insights-section, Property 23: Overage total is the sum of per-user overage
 *
 * Property 23 (design.md): For all per-user overage spend sets, when overage data
 * is available the organization-wide overage total equals the sum of all per-user
 * overage spend values; when overage data is absent the overage insights have
 * `status` of `unavailable`.
 *
 * Validates: Requirements 9.5
 *
 * ## Function under test
 *
 * `computeCreditDepletionInsights(input, config)` from
 * `lib/insights/creditDepletion.ts`. The overage insight has the stable id
 * `creditDepletion-overage`. Per the implementation (Requirement 9.5,
 * Property 23):
 *
 *   - When `overageByUser` (a `Record<string, number>`) is provided, the insight
 *     has status `"ok"`, `magnitude === round2(sum of all per-user overage)`,
 *     `detail.orgTotal === round2(sum)`, and
 *     `detail.usersWithOverage === count of entries with value > 0`.
 *   - When `overageByUser` is `null`/absent, the insight has status
 *     `"unavailable"`, a populated `unavailableReason`, and NO `magnitude`
 *     (no value is fabricated — Requirements 9.5, 9.7, 10.5).
 *
 * ## Oracle and determinism
 *
 * The behavior under test is the SUMMATION and the available/absent branch, NOT
 * the rounding arithmetic (that is `round2`'s own concern). So the oracle sums
 * the per-user overage values INDEPENDENTLY and reuses the engine's own `round2`
 * helper applied to that independent sum, giving a bit-identical comparison
 * (`toBe`). Inputs are constrained to non-negative INTEGER overage values keyed
 * by DISTINCT user ids, so the floating-point sum is exact regardless of order
 * and the equality is exact.
 *
 * `aggregate` and `userMetrics` are `null`: the overage insight depends ONLY on
 * `overageByUser`, and this test inspects only that insight, so the other inputs
 * are irrelevant here.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeCreditDepletionInsights } from "../lib/insights/creditDepletion";
import type { CreditDepletionInput } from "../lib/insights/creditDepletion";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import { round2 } from "../lib/insights/math";
import type { Insight, RangeParam } from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const OVERAGE_ID = "creditDepletion-overage";

// ── Generators ───────────────────────────────────────────────────────────────

const rangeArb = (): fc.Arbitrary<RangeParam> =>
  fc.constantFrom<RangeParam>("week", "month");

/**
 * A `Record<string, number>` of per-user overage spend with DISTINCT keys and
 * non-negative INTEGER values (some zero, so `usersWithOverage` is exercised).
 * Keys are zero-padded so they are unique and order-independent.
 */
const overageByUserArb = (): fc.Arbitrary<Record<string, number>> =>
  fc
    .array(fc.nat({ max: 1_000_000 }), { minLength: 0, maxLength: 40 })
    .map((values) => {
      const record: Record<string, number> = {};
      values.forEach((value, i) => {
        record[`u${String(i).padStart(4, "0")}`] = value;
      });
      return record;
    });

/** Build a minimal input that only populates `overageByUser`. */
function inputWithOverage(
  range: RangeParam,
  overageByUser: Record<string, number> | null,
): CreditDepletionInput {
  return {
    range,
    aggregate: null,
    userMetrics: null,
    allowanceByTier: null,
    overageByUser,
  };
}

/** Extract the single overage insight from the engine output. */
function overageInsight(insights: Insight[]): Insight | undefined {
  return insights.find((ins) => ins.id === OVERAGE_ID);
}

// ── Property 23a: org overage total equals the sum of per-user overage ───────

test("Property 23: when overage data is available, the org total equals the sum of per-user overage", () => {
  fc.assert(
    fc.property(rangeArb(), overageByUserArb(), (range, overageByUser) => {
      const insights = computeCreditDepletionInsights(
        inputWithOverage(range, overageByUser),
        DEFAULT_INSIGHT_CONFIG,
      );
      const insight = overageInsight(insights);

      // The overage insight is always present and computed (status ok).
      expect(insight).toBeDefined();
      expect(insight!.category).toBe("creditDepletion");
      expect(insight!.status).toBe("ok");

      // Independent oracle: sum of all per-user overage values, then round2.
      const values = Object.values(overageByUser);
      const expectedTotal = round2(values.reduce((sum, v) => sum + v, 0));
      const expectedUsersWithOverage = values.filter((v) => v > 0).length;

      // magnitude and detail.orgTotal both equal round2(sum), exactly.
      expect(insight!.magnitude).toBe(expectedTotal);
      expect(insight!.detail!.orgTotal).toBe(expectedTotal);

      // usersWithOverage counts strictly-positive entries.
      expect(insight!.detail!.usersWithOverage).toBe(expectedUsersWithOverage);

      // No fabricated reason on an available insight.
      expect(insight!.unavailableReason).toBeUndefined();

      // Non-negativity: the sum of non-negative spend is itself non-negative.
      expect(insight!.magnitude as number).toBeGreaterThanOrEqual(0);
    }),
    { numRuns: RUNS },
  );
});

// ── Property 23b: absent overage data yields an `unavailable` insight ────────

test("Property 23: when overage data is absent, the overage insight is unavailable with no value", () => {
  fc.assert(
    fc.property(rangeArb(), (range) => {
      const insights = computeCreditDepletionInsights(
        inputWithOverage(range, null),
        DEFAULT_INSIGHT_CONFIG,
      );
      const insight = overageInsight(insights);

      expect(insight).toBeDefined();
      expect(insight!.status).toBe("unavailable");
      // A populated reason names the missing dependency...
      expect(typeof insight!.unavailableReason).toBe("string");
      expect((insight!.unavailableReason as string).length).toBeGreaterThan(0);
      // ...and NO value is fabricated.
      expect(insight!.magnitude).toBeUndefined();
      expect(insight!.detail).toBeUndefined();
    }),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("empty overage record yields a zero org total and zero users with overage", () => {
  const insights = computeCreditDepletionInsights(
    inputWithOverage("month", {}),
    DEFAULT_INSIGHT_CONFIG,
  );
  const insight = overageInsight(insights);
  expect(insight).toBeDefined();
  expect(insight!.status).toBe("ok");
  expect(insight!.magnitude).toBe(0);
  expect(insight!.detail!.orgTotal).toBe(0);
  expect(insight!.detail!.usersWithOverage).toBe(0);
});

test("a known overage set sums to the expected total and user count", () => {
  // 10 + 0 + 5 + 25 = 40 across 3 users with positive overage.
  const insights = computeCreditDepletionInsights(
    inputWithOverage("month", { a: 10, b: 0, c: 5, d: 25 }),
    DEFAULT_INSIGHT_CONFIG,
  );
  const insight = overageInsight(insights);
  expect(insight).toBeDefined();
  expect(insight!.magnitude).toBe(40);
  expect(insight!.detail!.orgTotal).toBe(40);
  expect(insight!.detail!.usersWithOverage).toBe(3);
});

test("decimal overage values are summed and rounded to two places", () => {
  // 1.1 + 2.22 + 3.333 = 6.653 -> round2 -> 6.65.
  const insights = computeCreditDepletionInsights(
    inputWithOverage("month", { a: 1.1, b: 2.22, c: 3.333 }),
    DEFAULT_INSIGHT_CONFIG,
  );
  const insight = overageInsight(insights);
  expect(insight).toBeDefined();
  expect(insight!.magnitude).toBe(round2(1.1 + 2.22 + 3.333));
  expect(insight!.detail!.usersWithOverage).toBe(3);
});

test("absent overage data (undefined) is treated the same as null", () => {
  const insights = computeCreditDepletionInsights(
    {
      range: "month",
      aggregate: null,
      userMetrics: null,
      // allowanceByTier and overageByUser intentionally omitted.
    },
    DEFAULT_INSIGHT_CONFIG,
  );
  const insight = overageInsight(insights);
  expect(insight).toBeDefined();
  expect(insight!.status).toBe("unavailable");
  expect(insight!.magnitude).toBeUndefined();
});
