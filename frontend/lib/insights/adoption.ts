/**
 * Adoption insights (Requirement 4).
 *
 * Derives leaderboard rank movement, distribution health, and new-adopter
 * observations from per-user adoption snapshots (`UserAdoptionInput`). Each
 * snapshot carries the user's activity/score in the Preceding_Sub_Period and the
 * Current_Sub_Period plus the backend-provided `adoptionScore`.
 *
 * This module is pure TypeScript with no React imports, so it runs under the
 * existing node-based Vitest setup and is fully property-testable.
 *
 * ## Whole-category insufficiency
 *
 * To keep every category computer uniform, `computeAdoptionInsights` returns an
 * `Insight[]` (mirroring `computeTrendInsights`) rather than a `CategoryResult`.
 * When fewer than two users are present (Requirement 4.6) it returns an **empty
 * array**; the engine aggregator (`index.ts`, task 13.1) is responsible for
 * mapping an empty adoption result to the whole-category `insufficient`
 * `CategoryResult` (Property 11). This computer never fabricates rank-mover,
 * distribution-health, or new-adopter values when the precondition is unmet.
 */

import type { Insight, InsightConfig, UserAdoptionInput } from "./types";
import { round2 } from "./math";

const CATEGORY = "adoption" as const;

/**
 * Assigns a contiguous 1-based rank to every user, ordered by `score`
 * descending with ties broken by ascending `userId` (Requirement 4.1,
 * Property 8). Because the tie-break is a total order over distinct user
 * identifiers, the assigned ranks form a contiguous permutation `1..n` with no
 * duplicates even when scores tie.
 *
 * @param users - The users to rank.
 * @param score - Selects the value to rank by (preceding or current activity).
 * @returns A map from `userId` to its 1-based rank.
 */
function assignRanks(
  users: UserAdoptionInput[],
  score: (u: UserAdoptionInput) => number,
): Map<string, number> {
  const sorted = [...users].sort((a, b) => {
    const diff = score(b) - score(a); // descending score
    if (diff !== 0) {
      return diff;
    }
    // Deterministic tie-break: ascending userId.
    if (a.userId < b.userId) return -1;
    if (a.userId > b.userId) return 1;
    return 0;
  });
  const ranks = new Map<string, number>();
  sorted.forEach((u, index) => ranks.set(u.userId, index + 1));
  return ranks;
}

/**
 * Compute adoption insights for a set of per-user snapshots (Requirement 4).
 *
 * Produces, when at least two users are present:
 * - **Rank movers** (Requirements 4.1, 4.2, 4.3): one insight per user whose
 *   `Rank_Delta = preceding_rank - current_rank` is non-zero (positive means the
 *   user improved), ordered by descending `|Rank_Delta|` with ties broken by
 *   ascending `userId`, capped at `config.rankMoverLimit` (default 10).
 * - **Distribution health** (Requirement 4.4, Property 9): a single insight
 *   reporting the share of users whose `adoptionScore` is strictly below the
 *   team mean, a value in `[0, 1]`.
 * - **New adopters** (Requirement 4.5): a single insight listing users with zero
 *   preceding activity and non-zero current activity, ordered by ascending
 *   `userId`.
 *
 * Returns an empty array when fewer than two users are supplied
 * (Requirement 4.6); the aggregator maps that to whole-category insufficiency.
 *
 * @param users - Per-user adoption snapshots for the selected range.
 * @param config - Threshold configuration (uses `rankMoverLimit`).
 * @returns The list of adoption insights.
 */
export function computeAdoptionInsights(
  users: UserAdoptionInput[],
  config: InsightConfig,
): Insight[] {
  // ── Whole-category precondition (Requirement 4.6) ─────────────────────────
  // Fewer than two users cannot support a leaderboard comparison or a meaningful
  // distribution. Return empty so the aggregator emits `insufficient`.
  if (users.length < 2) {
    return [];
  }

  const insights: Insight[] = [];

  // ── Rank movers (Requirements 4.1, 4.2, 4.3) ──────────────────────────────
  const precedingRanks = assignRanks(users, (u) => u.precedingScoreOrActivity);
  const currentRanks = assignRanks(users, (u) => u.currentScoreOrActivity);

  const movers = users
    .map((u) => {
      const precedingRank = precedingRanks.get(u.userId) ?? 0;
      const currentRank = currentRanks.get(u.userId) ?? 0;
      // Positive delta = improved (moved toward rank 1).
      const rankDelta = precedingRank - currentRank;
      return { userId: u.userId, precedingRank, currentRank, rankDelta };
    })
    .filter((m) => m.rankDelta !== 0)
    .sort((a, b) => {
      const byMagnitude = Math.abs(b.rankDelta) - Math.abs(a.rankDelta);
      if (byMagnitude !== 0) {
        return byMagnitude;
      }
      // Ties broken by ascending userId (Requirement 4.3).
      if (a.userId < b.userId) return -1;
      if (a.userId > b.userId) return 1;
      return 0;
    })
    .slice(0, config.rankMoverLimit);

  for (const mover of movers) {
    const improved = mover.rankDelta > 0;
    const positions = Math.abs(mover.rankDelta);
    insights.push({
      id: `adoption-rank-mover-${mover.userId}`,
      category: CATEGORY,
      title: improved ? "Rank climber" : "Rank slipper",
      description: `${mover.userId} ${improved ? "gained" : "lost"} ${positions} leaderboard ${
        positions === 1 ? "position" : "positions"
      } (rank ${mover.precedingRank} \u2192 ${mover.currentRank}).`,
      status: improved ? "increase" : "decrease",
      magnitude: mover.rankDelta,
      detail: {
        userId: mover.userId,
        precedingRank: mover.precedingRank,
        currentRank: mover.currentRank,
        rankDelta: mover.rankDelta,
      },
    });
  }

  // ── Distribution health: below-average adoption share (Requirement 4.4) ───
  const userCount = users.length;
  const meanAdoptionScore =
    users.reduce((sum, u) => sum + u.adoptionScore, 0) / userCount;
  const belowAverageCount = users.filter(
    (u) => u.adoptionScore < meanAdoptionScore,
  ).length;
  // Share is bounded in [0, 1] because 0 <= belowAverageCount <= userCount and
  // userCount >= 2 here (Property 9).
  const belowAverageShare = belowAverageCount / userCount;
  insights.push({
    id: "adoption-distribution-health",
    category: CATEGORY,
    title: "Adoption distribution",
    description: `${belowAverageCount} of ${userCount} users (${round2(
      belowAverageShare * 100,
    )}%) have an adoption score below the team average of ${round2(
      meanAdoptionScore,
    )}.`,
    status: "ok",
    magnitude: round2(belowAverageShare),
    detail: {
      belowAverageCount,
      userCount,
      meanAdoptionScore: round2(meanAdoptionScore),
      share: round2(belowAverageShare),
    },
  });

  // ── New adopters (Requirement 4.5) ────────────────────────────────────────
  // Users who went from zero activity in the preceding sub-period to non-zero
  // activity in the current sub-period, ordered by ascending userId.
  const newAdopters = users
    .filter(
      (u) =>
        u.precedingScoreOrActivity === 0 && u.currentScoreOrActivity !== 0,
    )
    .map((u) => u.userId)
    .sort((a, b) => {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });

  if (newAdopters.length > 0) {
    insights.push({
      id: "adoption-new-adopters",
      category: CATEGORY,
      title: "New adopters",
      description: `${newAdopters.length} ${
        newAdopters.length === 1 ? "user" : "users"
      } became active this period: ${newAdopters.join(", ")}.`,
      status: "increase",
      magnitude: newAdopters.length,
      detail: {
        count: newAdopters.length,
        userIds: newAdopters.join(","),
      },
    });
  } else {
    insights.push({
      id: "adoption-new-adopters",
      category: CATEGORY,
      title: "New adopters",
      description:
        "No users moved from zero activity in the preceding sub-period to active in the current sub-period.",
      status: "unchanged",
      magnitude: 0,
      detail: { count: 0, userIds: "" },
    });
  }

  return insights;
}
