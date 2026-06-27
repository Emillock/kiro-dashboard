/**
 * Feature: insights-section, Property 9: Below-average adoption share is bounded and correct
 *
 * Property 9 (design.md): For all non-empty user sets, the distribution-health
 * share equals `count(adoption_score < mean) / userCount` and lies between 0 and
 * 1 inclusive.
 *
 * Validates: Requirements 4.4
 *
 * The function under test is `computeAdoptionInsights(users, config)` from
 * lib/insights/adoption.ts. It emits a distribution-health insight with id
 * `adoption-distribution-health` whose `magnitude` is `round2(belowAverageShare)`
 * and whose `detail` carries `belowAverageCount`, `userCount`, `meanAdoptionScore`,
 * and `share` (the latter `round2(belowAverageShare)`). Adoption insights require
 * at least two users (Requirement 4.6); fewer than two yields an empty array and
 * no distribution-health insight.
 *
 * ## Determinism note
 *
 * The implementation rounds (`round2`) and uses a STRICT `< mean` comparison.
 * To avoid float-boundary ambiguity (a score landing exactly on a non-integer
 * mean), this test generates INTEGER `adoptionScore` values. With integer scores
 * the only way a score can equal the mean is when the mean is itself an integer,
 * in which case the comparison is an exact integer/float comparison. The oracle
 * computes the mean identically (`sum / userCount`), so the below-average count is
 * reproduced exactly. The expected share is the exact rational `count / userCount`;
 * it is compared to the reported (rounded) `share`/`magnitude` within a small
 * rounding tolerance, and bounds `[0, 1]` are asserted on both.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeAdoptionInsights } from "../lib/insights/adoption";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import { round2 } from "../lib/insights/math";
import type { UserAdoptionInput } from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const DISTRIBUTION_ID = "adoption-distribution-health";

// `round2` rounds to two decimals, so the reported share differs from the exact
// rational share by at most half a unit in the last place plus float slack.
const ROUNDING_TOLERANCE = 5e-3 + 1e-9;

/**
 * Generate a non-empty set of per-user adoption snapshots with DISTINCT user
 * identifiers and INTEGER adoption scores. The userId is derived from the array
 * index to guarantee uniqueness (a leaderboard requires distinct users). The
 * preceding/current activity fields are irrelevant to the distribution-health
 * share, so they carry arbitrary non-negative integers.
 */
const userSet = (): fc.Arbitrary<UserAdoptionInput[]> =>
  fc
    .array(
      fc.record({
        adoptionScore: fc.integer({ min: 0, max: 1000 }),
        precedingScoreOrActivity: fc.nat({ max: 1000 }),
        currentScoreOrActivity: fc.nat({ max: 1000 }),
      }),
      { minLength: 2, maxLength: 40 },
    )
    .map((rows) =>
      rows.map((r, i) => ({
        userId: `user-${String(i).padStart(3, "0")}`,
        precedingScoreOrActivity: r.precedingScoreOrActivity,
        currentScoreOrActivity: r.currentScoreOrActivity,
        adoptionScore: r.adoptionScore,
      })),
    );

/**
 * Independent oracle: compute the below-average share directly from the scores,
 * mirroring the implementation's mean (`sum / count`) and strict `< mean`
 * comparison so integer scores reproduce the count exactly.
 */
function expectedShare(users: UserAdoptionInput[]): {
  belowAverageCount: number;
  userCount: number;
  share: number;
} {
  const userCount = users.length;
  const mean =
    users.reduce((sum, u) => sum + u.adoptionScore, 0) / userCount;
  const belowAverageCount = users.filter((u) => u.adoptionScore < mean).length;
  return { belowAverageCount, userCount, share: belowAverageCount / userCount };
}

// ── Property 9: the reported share is correct and bounded ────────────────────

test("Property 9: distribution-health share equals count(score < mean)/userCount and lies in [0, 1]", () => {
  fc.assert(
    fc.property(userSet(), (users) => {
      const insights = computeAdoptionInsights(users, DEFAULT_INSIGHT_CONFIG);
      const dist = insights.find((i) => i.id === DISTRIBUTION_ID);

      // With >= 2 users the distribution-health insight is always present.
      expect(dist).toBeDefined();

      const oracle = expectedShare(users);

      // Correctness: the reported (rounded) share matches the exact rational
      // share within rounding tolerance.
      expect(dist!.detail).toBeDefined();
      const reportedShare = dist!.detail!.share as number;
      expect(typeof reportedShare).toBe("number");
      expect(reportedShare).toBeCloseTo(round2(oracle.share), 9);
      expect(Math.abs(reportedShare - oracle.share)).toBeLessThanOrEqual(
        ROUNDING_TOLERANCE,
      );

      // The magnitude carries the same rounded share.
      expect(dist!.magnitude).toBeCloseTo(round2(oracle.share), 9);

      // The supporting counts match the oracle exactly.
      expect(dist!.detail!.belowAverageCount).toBe(oracle.belowAverageCount);
      expect(dist!.detail!.userCount).toBe(oracle.userCount);

      // Bounds [0, 1] inclusive, on both the exact and the reported share.
      expect(oracle.share).toBeGreaterThanOrEqual(0);
      expect(oracle.share).toBeLessThanOrEqual(1);
      expect(reportedShare).toBeGreaterThanOrEqual(0);
      expect(reportedShare).toBeLessThanOrEqual(1);
      expect(dist!.magnitude!).toBeGreaterThanOrEqual(0);
      expect(dist!.magnitude!).toBeLessThanOrEqual(1);
    }),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("all-equal scores yield a zero below-average share (no score is strictly below the mean)", () => {
  const users: UserAdoptionInput[] = [
    { userId: "a", precedingScoreOrActivity: 0, currentScoreOrActivity: 0, adoptionScore: 5 },
    { userId: "b", precedingScoreOrActivity: 0, currentScoreOrActivity: 0, adoptionScore: 5 },
    { userId: "c", precedingScoreOrActivity: 0, currentScoreOrActivity: 0, adoptionScore: 5 },
  ];
  const dist = computeAdoptionInsights(users, DEFAULT_INSIGHT_CONFIG).find(
    (i) => i.id === DISTRIBUTION_ID,
  );
  expect(dist).toBeDefined();
  expect(dist!.detail!.belowAverageCount).toBe(0);
  expect(dist!.detail!.share).toBe(0);
  expect(dist!.magnitude).toBe(0);
});

test("one low outlier among high scores gives a 1/n share", () => {
  // scores [0, 9, 9, 9] -> mean 6.75 -> only the 0 is strictly below -> 1/4.
  const users: UserAdoptionInput[] = [
    { userId: "a", precedingScoreOrActivity: 0, currentScoreOrActivity: 0, adoptionScore: 0 },
    { userId: "b", precedingScoreOrActivity: 0, currentScoreOrActivity: 0, adoptionScore: 9 },
    { userId: "c", precedingScoreOrActivity: 0, currentScoreOrActivity: 0, adoptionScore: 9 },
    { userId: "d", precedingScoreOrActivity: 0, currentScoreOrActivity: 0, adoptionScore: 9 },
  ];
  const dist = computeAdoptionInsights(users, DEFAULT_INSIGHT_CONFIG).find(
    (i) => i.id === DISTRIBUTION_ID,
  );
  expect(dist).toBeDefined();
  expect(dist!.detail!.belowAverageCount).toBe(1);
  expect(dist!.detail!.share).toBe(round2(0.25));
  expect(dist!.magnitude).toBe(round2(0.25));
});

test("fewer than two users produces no distribution-health insight", () => {
  const single: UserAdoptionInput[] = [
    { userId: "solo", precedingScoreOrActivity: 1, currentScoreOrActivity: 2, adoptionScore: 3 },
  ];
  const insights = computeAdoptionInsights(single, DEFAULT_INSIGHT_CONFIG);
  expect(insights).toEqual([]);
  expect(insights.find((i) => i.id === DISTRIBUTION_ID)).toBeUndefined();
});
