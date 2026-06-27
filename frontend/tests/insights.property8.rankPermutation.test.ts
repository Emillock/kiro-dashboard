/**
 * Feature: insights-section, Property 8: Rank assignment is a contiguous permutation
 *
 * Property 8 (design.md): For all sub-period rankings, the assigned ranks form a
 * contiguous sequence starting at 1 with no duplicate ranks among distinct users
 * (ties resolved deterministically).
 *
 * Validates: Requirements 4.1
 *
 * The function under test is `computeAdoptionInsights(users, config)` from
 * lib/insights/adoption.ts. Rank-mover insights expose `detail.precedingRank` and
 * `detail.currentRank` per emitted user (id `adoption-rank-mover-<userId>`), but
 * only NON-ZERO-delta movers are emitted. To verify the FULL permutation we use
 * approach (a) from the task brief:
 *
 *   1. Reconstruct the preceding and current rank maps in the test using the SAME
 *      deterministic rule the implementation documents (sort by score descending,
 *      ties by ascending userId, assign 1..n) and assert each reconstruction is
 *      itself a contiguous permutation {1, 2, ..., n} with no gaps and no
 *      duplicates among distinct users.
 *   2. Cross-check the implementation against the reconstruction: for every
 *      EMITTED rank-mover insight, assert `detail.precedingRank` /
 *      `detail.currentRank` match the reconstructed ranks. This ties the
 *      contiguous-permutation property back to the implementation's own ranking.
 *
 * `adoption.ts` does not export its internal `assignRanks` helper, so approach
 * (b) (testing the helper directly) is not available; approach (a) is used.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeAdoptionInsights } from "../lib/insights/adoption";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import type { UserAdoptionInput } from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

/**
 * Independently reconstruct the contiguous 1-based ranking using the SAME
 * deterministic rule the implementation documents: sort by the selected score
 * descending, break ties by ascending `userId`, then assign 1..n. Because
 * `userId`s are distinct, the tie-break is a total order and the result is a
 * contiguous permutation of {1, ..., n}.
 */
function reconstructRanks(
  users: UserAdoptionInput[],
  score: (u: UserAdoptionInput) => number,
): Map<string, number> {
  const sorted = [...users].sort((a, b) => {
    const diff = score(b) - score(a); // descending score
    if (diff !== 0) return diff;
    if (a.userId < b.userId) return -1;
    if (a.userId > b.userId) return 1;
    return 0;
  });
  const ranks = new Map<string, number>();
  sorted.forEach((u, index) => ranks.set(u.userId, index + 1));
  return ranks;
}

/**
 * Assert that a reconstructed rank map over `n` distinct users is a contiguous
 * permutation {1, 2, ..., n}: exactly `n` ranks, every rank distinct, and the
 * set equals {1, ..., n} with no gaps.
 */
function assertContiguousPermutation(
  ranks: Map<string, number>,
  userCount: number,
): void {
  const rankValues = [...ranks.values()];

  // One rank per user.
  expect(rankValues).toHaveLength(userCount);

  // No duplicate ranks among distinct users.
  expect(new Set(rankValues).size).toBe(userCount);

  // The set of assigned ranks equals exactly {1, 2, ..., n}: contiguous,
  // starts at 1, no gaps.
  const expected = Array.from({ length: userCount }, (_, i) => i + 1);
  expect([...rankValues].sort((a, b) => a - b)).toEqual(expected);
}

/**
 * A set of adoption snapshots with DISTINCT userIds (>= 2 users) and INTEGER
 * scores. The small score range deliberately makes ties common (across both
 * sub-periods), exercising the deterministic tie-break. `userId`s are forced
 * distinct so "no duplicate ranks among distinct users" is meaningful.
 */
const adoptionUsers = (): fc.Arbitrary<UserAdoptionInput[]> =>
  fc
    .uniqueArray(
      fc.string({ minLength: 1, maxLength: 6 }).filter((s) => s.trim() !== ""),
      { minLength: 2, maxLength: 25 },
    )
    .chain((ids) =>
      fc.tuple(
        ...ids.map((userId) =>
          fc.record({
            userId: fc.constant(userId),
            // Integer scores (with ties) avoid float ambiguity in ranking.
            precedingScoreOrActivity: fc.integer({ min: 0, max: 8 }),
            currentScoreOrActivity: fc.integer({ min: 0, max: 8 }),
            adoptionScore: fc.integer({ min: 0, max: 100 }),
          }),
        ),
      ),
    );

// ── Property 8: each reconstructed sub-period ranking is a contiguous permutation ──

test("Property 8: preceding and current rankings are each a contiguous permutation 1..n", () => {
  fc.assert(
    fc.property(adoptionUsers(), (users) => {
      const n = users.length;

      const precedingRanks = reconstructRanks(
        users,
        (u) => u.precedingScoreOrActivity,
      );
      const currentRanks = reconstructRanks(
        users,
        (u) => u.currentScoreOrActivity,
      );

      assertContiguousPermutation(precedingRanks, n);
      assertContiguousPermutation(currentRanks, n);
    }),
    { numRuns: RUNS },
  );
});

// ── Property 8: emitted rank-mover insights agree with the contiguous ranking ──

test("Property 8: every emitted rank-mover's preceding/current rank matches the contiguous permutation", () => {
  fc.assert(
    fc.property(adoptionUsers(), (users) => {
      const precedingRanks = reconstructRanks(
        users,
        (u) => u.precedingScoreOrActivity,
      );
      const currentRanks = reconstructRanks(
        users,
        (u) => u.currentScoreOrActivity,
      );

      const insights = computeAdoptionInsights(users, DEFAULT_INSIGHT_CONFIG);
      const movers = insights.filter((i) =>
        i.id.startsWith("adoption-rank-mover-"),
      );

      for (const mover of movers) {
        const userId = mover.detail?.userId as string;
        expect(userId).toBeDefined();

        const expectedPreceding = precedingRanks.get(userId);
        const expectedCurrent = currentRanks.get(userId);
        expect(expectedPreceding).toBeDefined();
        expect(expectedCurrent).toBeDefined();

        // The implementation's ranks for this user match the independently
        // reconstructed contiguous permutation.
        expect(mover.detail?.precedingRank).toBe(expectedPreceding);
        expect(mover.detail?.currentRank).toBe(expectedCurrent);

        // Both ranks lie within the contiguous range [1, n].
        expect(mover.detail?.precedingRank as number).toBeGreaterThanOrEqual(1);
        expect(mover.detail?.precedingRank as number).toBeLessThanOrEqual(
          users.length,
        );
        expect(mover.detail?.currentRank as number).toBeGreaterThanOrEqual(1);
        expect(mover.detail?.currentRank as number).toBeLessThanOrEqual(
          users.length,
        );
      }
    }),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

const cfg = DEFAULT_INSIGHT_CONFIG;

test("all-tied scores assign distinct contiguous ranks by ascending userId", () => {
  // Every score is identical, so ranking is driven entirely by the userId
  // tie-break. Ranks must still be a contiguous permutation 1..n.
  const users: UserAdoptionInput[] = [
    { userId: "c", precedingScoreOrActivity: 5, currentScoreOrActivity: 5, adoptionScore: 5 },
    { userId: "a", precedingScoreOrActivity: 5, currentScoreOrActivity: 5, adoptionScore: 5 },
    { userId: "b", precedingScoreOrActivity: 5, currentScoreOrActivity: 5, adoptionScore: 5 },
  ];
  const precedingRanks = reconstructRanks(users, (u) => u.precedingScoreOrActivity);
  assertContiguousPermutation(precedingRanks, users.length);
  // Ascending userId tie-break => a=1, b=2, c=3.
  expect(precedingRanks.get("a")).toBe(1);
  expect(precedingRanks.get("b")).toBe(2);
  expect(precedingRanks.get("c")).toBe(3);
});

test("distinct scores produce a strict contiguous ranking and matching mover detail", () => {
  const users: UserAdoptionInput[] = [
    // preceding ranks by score desc: u3(9)=1, u2(5)=2, u1(1)=3
    // current ranks by score desc:   u1(9)=1, u2(5)=2, u3(1)=3
    { userId: "u1", precedingScoreOrActivity: 1, currentScoreOrActivity: 9, adoptionScore: 10 },
    { userId: "u2", precedingScoreOrActivity: 5, currentScoreOrActivity: 5, adoptionScore: 20 },
    { userId: "u3", precedingScoreOrActivity: 9, currentScoreOrActivity: 1, adoptionScore: 30 },
  ];
  const insights = computeAdoptionInsights(users, cfg);
  const u1Mover = insights.find((i) => i.id === "adoption-rank-mover-u1");
  const u3Mover = insights.find((i) => i.id === "adoption-rank-mover-u3");

  // u1 climbed from rank 3 to rank 1; u3 slipped from rank 1 to rank 3.
  expect(u1Mover?.detail?.precedingRank).toBe(3);
  expect(u1Mover?.detail?.currentRank).toBe(1);
  expect(u3Mover?.detail?.precedingRank).toBe(1);
  expect(u3Mover?.detail?.currentRank).toBe(3);
});

test("fewer than two users yields no insights (no ranking to verify)", () => {
  expect(computeAdoptionInsights([], cfg)).toEqual([]);
  expect(
    computeAdoptionInsights(
      [{ userId: "only", precedingScoreOrActivity: 1, currentScoreOrActivity: 2, adoptionScore: 3 }],
      cfg,
    ),
  ).toEqual([]);
});
