/**
 * Feature: insights-section, Property 7: Rank_Delta value, ordering, and cap
 *
 * Property 7 (design.md): For all user sets present in both sub-periods, each
 * `Rank_Delta` equals `preceding_rank − current_rank`; the rank-mover list
 * contains only users with non-zero delta, is ordered by descending absolute
 * delta with ties broken by ascending user identifier, and contains at most 10
 * entries (`config.rankMoverLimit`).
 *
 * Validates: Requirements 4.1, 4.2, 4.3
 *
 * The function under test is `computeAdoptionInsights(users, config)` from
 * lib/insights/adoption.ts. It emits one rank-mover insight per non-zero-delta
 * user with id `adoption-rank-mover-<userId>`, status "increase" (improved) or
 * "decrease" (slipped), `magnitude` = rankDelta, and a `detail` carrying
 * `precedingRank`, `currentRank`, and `rankDelta`.
 *
 * The test independently recomputes the expected ranks from the per-user
 * snapshots (descending score, rank 1 highest, ties broken by ascending userId,
 * contiguous 1..n) so the oracle never reuses the implementation's logic.
 *
 * To avoid floating-point tie ambiguity, scores are INTEGERS and userIds are
 * DISTINCT. Generators include cases with more than 10 movers to exercise the
 * cap.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeAdoptionInsights } from "../lib/insights/adoption";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import type { InsightConfig, UserAdoptionInput } from "../lib/insights/types";

const RUNS = 300; // >= 100 iterations required for property tests

const MOVER_PREFIX = "adoption-rank-mover-";

// ── Independent rank oracle ──────────────────────────────────────────────────

/**
 * Assign a contiguous 1-based rank to each user, ordered by `score` descending
 * (rank 1 is the highest score) with ties broken by ascending `userId`. This
 * mirrors the requirement definition directly from the snapshots and is derived
 * independently of the implementation under test.
 */
function expectedRanks(
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
  sorted.forEach((u, i) => ranks.set(u.userId, i + 1));
  return ranks;
}

interface ExpectedMover {
  userId: string;
  precedingRank: number;
  currentRank: number;
  rankDelta: number;
}

/**
 * Recompute the expected rank-mover list: per-user Rank_Delta = preceding_rank −
 * current_rank, keeping only non-zero deltas, ordered by descending |delta| with
 * ties broken by ascending userId, capped at `config.rankMoverLimit`.
 */
function expectedMovers(
  users: UserAdoptionInput[],
  config: InsightConfig,
): ExpectedMover[] {
  const pre = expectedRanks(users, (u) => u.precedingScoreOrActivity);
  const cur = expectedRanks(users, (u) => u.currentScoreOrActivity);
  return users
    .map((u) => {
      const precedingRank = pre.get(u.userId)!;
      const currentRank = cur.get(u.userId)!;
      return {
        userId: u.userId,
        precedingRank,
        currentRank,
        rankDelta: precedingRank - currentRank,
      };
    })
    .filter((m) => m.rankDelta !== 0)
    .sort((a, b) => {
      const byMag = Math.abs(b.rankDelta) - Math.abs(a.rankDelta);
      if (byMag !== 0) return byMag;
      if (a.userId < b.userId) return -1;
      if (a.userId > b.userId) return 1;
      return 0;
    })
    .slice(0, config.rankMoverLimit);
}

// ── Generators ───────────────────────────────────────────────────────────────

/**
 * Generate >= 2 users with DISTINCT userIds and INTEGER preceding/current
 * scores. `maxUsers` defaults large enough to frequently produce more than 10
 * movers, exercising the cap. Distinct, zero-padded ids give a well-defined
 * ascending-userId tie-break order, and the small integer score range makes
 * rank ties (and therefore tie-broken orderings) common.
 */
function userSet(maxUsers = 22): fc.Arbitrary<UserAdoptionInput[]> {
  return fc
    .integer({ min: 2, max: maxUsers })
    .chain((n) =>
      fc.tuple(
        ...Array.from({ length: n }, () =>
          fc.record({
            precedingScoreOrActivity: fc.integer({ min: 0, max: 30 }),
            currentScoreOrActivity: fc.integer({ min: 0, max: 30 }),
            adoptionScore: fc.integer({ min: 0, max: 100 }),
          }),
        ),
      ),
    )
    .map((records) =>
      records.map((r, i) => ({
        userId: `user-${String(i).padStart(3, "0")}`,
        ...r,
      })),
    );
}

/** Locate every emitted rank-mover insight, preserving emission order. */
function emittedMovers(users: UserAdoptionInput[], config: InsightConfig) {
  return computeAdoptionInsights(users, config).filter((ins) =>
    ins.id.startsWith(MOVER_PREFIX),
  );
}

// ── Property 7: Rank_Delta value, ordering, and cap ──────────────────────────

test("Property 7: each emitted mover's magnitude equals preceding_rank − current_rank", () => {
  fc.assert(
    fc.property(userSet(), (users) => {
      const config = DEFAULT_INSIGHT_CONFIG;
      const movers = emittedMovers(users, config);
      const expectedByUser = new Map(
        expectedMovers(users, config).map((m) => [m.userId, m]),
      );

      for (const ins of movers) {
        const userId = ins.id.slice(MOVER_PREFIX.length);
        const exp = expectedByUser.get(userId);
        expect(exp).toBeDefined();
        // magnitude equals the independently recomputed Rank_Delta.
        expect(ins.magnitude).toBe(exp!.rankDelta);
        // detail carries preceding/current ranks and the same delta.
        expect(ins.detail).toMatchObject({
          precedingRank: exp!.precedingRank,
          currentRank: exp!.currentRank,
          rankDelta: exp!.rankDelta,
        });
        // status reflects direction: positive delta = improved (increase).
        expect(ins.status).toBe(exp!.rankDelta > 0 ? "increase" : "decrease");
      }
    }),
    { numRuns: RUNS },
  );
});

test("Property 7: only users with non-zero delta are present", () => {
  fc.assert(
    fc.property(userSet(), (users) => {
      const config = DEFAULT_INSIGHT_CONFIG;
      const movers = emittedMovers(users, config);
      for (const ins of movers) {
        expect(ins.magnitude).not.toBe(0);
        expect(ins.magnitude).toBeDefined();
      }
    }),
    { numRuns: RUNS },
  );
});

test("Property 7: movers are ordered by descending |delta|, ties broken by ascending userId", () => {
  fc.assert(
    fc.property(userSet(), (users) => {
      const config = DEFAULT_INSIGHT_CONFIG;
      const movers = emittedMovers(users, config);
      for (let i = 1; i < movers.length; i++) {
        const prev = movers[i - 1];
        const curr = movers[i];
        const prevMag = Math.abs(prev.magnitude as number);
        const currMag = Math.abs(curr.magnitude as number);
        const prevId = prev.id.slice(MOVER_PREFIX.length);
        const currId = curr.id.slice(MOVER_PREFIX.length);
        // Descending absolute magnitude, with ascending userId on ties.
        expect(prevMag).toBeGreaterThanOrEqual(currMag);
        if (prevMag === currMag) {
          expect(prevId < currId).toBe(true);
        }
      }
    }),
    { numRuns: RUNS },
  );
});

test("Property 7: at most config.rankMoverLimit movers are emitted", () => {
  fc.assert(
    fc.property(userSet(), (users) => {
      const config = DEFAULT_INSIGHT_CONFIG;
      const movers = emittedMovers(users, config);
      expect(movers.length).toBeLessThanOrEqual(config.rankMoverLimit);
    }),
    { numRuns: RUNS },
  );
});

test("Property 7: emitted movers match the independent oracle exactly (value, order, and cap)", () => {
  fc.assert(
    fc.property(userSet(), (users) => {
      const config = DEFAULT_INSIGHT_CONFIG;
      const movers = emittedMovers(users, config);
      const expected = expectedMovers(users, config);

      expect(movers.length).toBe(expected.length);
      movers.forEach((ins, i) => {
        expect(ins.id).toBe(`${MOVER_PREFIX}${expected[i].userId}`);
        expect(ins.magnitude).toBe(expected[i].rankDelta);
      });
    }),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("a user moving from rank 7 to rank 2 has a Rank_Delta of +5", () => {
  // 7 users; user-000 is lowest preceding (rank 7) and highest current (rank 1)?
  // Construct explicit scores so user-000 goes preceding rank 7 -> current rank 2.
  const users: UserAdoptionInput[] = [
    // preceding scores (descending => rank): give user-000 the smallest preceding.
    { userId: "user-000", precedingScoreOrActivity: 1, currentScoreOrActivity: 60, adoptionScore: 0 },
    { userId: "user-001", precedingScoreOrActivity: 2, currentScoreOrActivity: 99, adoptionScore: 0 },
    { userId: "user-002", precedingScoreOrActivity: 3, currentScoreOrActivity: 50, adoptionScore: 0 },
    { userId: "user-003", precedingScoreOrActivity: 4, currentScoreOrActivity: 40, adoptionScore: 0 },
    { userId: "user-004", precedingScoreOrActivity: 5, currentScoreOrActivity: 30, adoptionScore: 0 },
    { userId: "user-005", precedingScoreOrActivity: 6, currentScoreOrActivity: 20, adoptionScore: 0 },
    { userId: "user-006", precedingScoreOrActivity: 7, currentScoreOrActivity: 10, adoptionScore: 0 },
  ];
  // preceding ranks: user-006=1 ... user-000=7. current ranks: user-001=1, user-000=2, ...
  const movers = emittedMovers(users, DEFAULT_INSIGHT_CONFIG);
  const u000 = movers.find((m) => m.id === "adoption-rank-mover-user-000");
  expect(u000).toBeDefined();
  expect(u000!.magnitude).toBe(5); // 7 - 2
  expect(u000!.status).toBe("increase");
});

test("fewer than two users yields no rank-mover insights", () => {
  expect(emittedMovers([], DEFAULT_INSIGHT_CONFIG)).toHaveLength(0);
  expect(
    emittedMovers(
      [
        {
          userId: "user-000",
          precedingScoreOrActivity: 1,
          currentScoreOrActivity: 2,
          adoptionScore: 3,
        },
      ],
      DEFAULT_INSIGHT_CONFIG,
    ),
  ).toHaveLength(0);
});

test("more than 10 movers are capped at the rank-mover limit", () => {
  // 22 users with fully reversed preceding/current orderings => every user moves.
  const n = 22;
  const users: UserAdoptionInput[] = Array.from({ length: n }, (_, i) => ({
    userId: `user-${String(i).padStart(3, "0")}`,
    precedingScoreOrActivity: i, // ascending preceding score
    currentScoreOrActivity: n - i, // reversed current score
    adoptionScore: 0,
  }));
  const movers = emittedMovers(users, DEFAULT_INSIGHT_CONFIG);
  expect(movers.length).toBe(DEFAULT_INSIGHT_CONFIG.rankMoverLimit);
  expect(movers.length).toBe(10);
});
