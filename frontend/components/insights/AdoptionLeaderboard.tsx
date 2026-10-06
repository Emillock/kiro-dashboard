/**
 * AdoptionLeaderboard — a scrollable, ranked list of users by Adoption_Score
 * rendered inside the Adoption card's `ready` state (Requirement 15).
 *
 * Rendering rules:
 * - Rows appear in ascending rank order (rank 1 first), sorted by `adoption_score`
 *   descending in the Current_Sub_Period (`UserSummary.adoption_score`, which is the
 *   backend-computed per-range score). Ties are broken deterministically by ascending
 *   `user_id` (Requirement 15.1).
 * - Each row shows: numeric rank, user identifier (label), and adoption score
 *   rounded to 2 decimal places (Requirement 15.2).
 * - Direction indicators use a character + `aria-label`, never color alone
 *   (Requirement 15.8):
 *     - `Rank_Delta > 0` → ↑  aria-label="up {N} positions"   (R15.3)
 *     - `Rank_Delta < 0` → ↓  aria-label="down {|N|} positions" (R15.4)
 *     - `Rank_Delta === 0` → – aria-label="no change"           (R15.5)
 *     - New entrant (no prior rank) → – aria-label="new entry"  (R15.6)
 * - Container has `maxHeight: 200px` and `overflowY: "auto"` (Requirement 15.7).
 * - Falls back to the standard `insufficient_data` message when fewer than two
 *   users have adoption scores (Requirement 15.9, Property 11).
 */

"use client";

import type { CSSProperties } from "react";
import type { Insight, UserSummary } from "@/lib/insights/types";
import { colors } from "@/styles/theme";

export interface AdoptionLeaderboardProps {
  /** Adoption category insights from the engine. Used to extract Rank_Delta per user. */
  insights: Insight[];
  /** UserSummary list for the current range; sorted by adoption_score for ranking. */
  userSummaries: UserSummary[];
}

/**
 * Round a number to 2 decimal places, returning a display-safe string.
 */
function toFixed2(n: number): string {
  return n.toFixed(2);
}

/**
 * Build a map from userId → Rank_Delta by scanning the rank-mover insights
 * produced by the adoption engine. Each rank-mover insight carries a `detail`
 * object with `userId` and `rankDelta` fields (see `adoption.ts`).
 *
 * Users not present in any rank-mover insight either had no rank change
 * (`rankDelta === 0`) or are new entrants. We distinguish them below by
 * checking whether they appeared in the preceding sub-period.
 */
function buildRankDeltaMap(insights: Insight[]): Map<string, { rankDelta: number; precedingRank: number; currentRank: number }> {
  const map = new Map<string, { rankDelta: number; precedingRank: number; currentRank: number }>();
  for (const insight of insights) {
    if (
      insight.id.startsWith("adoption-rank-mover-") &&
      insight.detail &&
      typeof insight.detail.userId === "string" &&
      typeof insight.detail.rankDelta === "number"
    ) {
      map.set(insight.detail.userId, {
        rankDelta: insight.detail.rankDelta as number,
        precedingRank: insight.detail.precedingRank as number,
        currentRank: insight.detail.currentRank as number,
      });
    }
  }
  return map;
}

/**
 * Collect the set of userIds that had a non-zero preceding-period activity by
 * inspecting rank-mover detail objects. Any user appearing in a rank-mover
 * insight had a preceding rank, so they are NOT new entrants.
 *
 * Users absent from the rank-mover list but present in the current leaderboard
 * are considered new entrants unless we can confirm they existed before. The
 * adoption engine only emits rank-mover insights for users present in BOTH
 * sub-periods who moved. Users with `rankDelta === 0` are not emitted as movers
 * but they still existed in the preceding period.
 *
 * Because we cannot reliably distinguish "existed in preceding period with Δ=0"
 * from "new entrant" using only the mover insights (the engine doesn't emit a
 * "no-change" mover insight), we use the new-adopters insight to identify
 * genuine new entrants. The engine emits an `adoption-new-adopters` insight
 * whose `detail.userIds` is a comma-separated list.
 */
function buildNewEntrantSet(insights: Insight[]): Set<string> {
  const newEntrants = new Set<string>();
  for (const insight of insights) {
    if (
      insight.id === "adoption-new-adopters" &&
      insight.detail &&
      typeof insight.detail.userIds === "string" &&
      insight.detail.userIds.length > 0
    ) {
      for (const uid of insight.detail.userIds.split(",")) {
        const trimmed = uid.trim();
        if (trimmed) newEntrants.add(trimmed);
      }
    }
  }
  return newEntrants;
}

/** Direction indicator presentation. */
interface DeltaIndicator {
  char: string;
  text: string;
  ariaLabel: string;
  color: string;
}

function getDeltaIndicator(
  userId: string,
  rankDeltaMap: Map<string, { rankDelta: number; precedingRank: number; currentRank: number }>,
  newEntrantSet: Set<string>,
): DeltaIndicator {
  // New entrant: no prior rank (Requirement 15.6)
  if (newEntrantSet.has(userId)) {
    return { char: "✦", text: "new", ariaLabel: "new entry", color: colors.accentLight };
  }

  const entry = rankDeltaMap.get(userId);

  if (entry === undefined) {
    // User existed in both periods but had no rank change (Requirement 15.5)
    return { char: "–", text: "–", ariaLabel: "no change", color: colors.textMuted };
  }

  const { rankDelta, precedingRank } = entry;

  if (rankDelta > 0) {
    // Improved rank (Requirement 15.3)
    return { char: "↑", text: `↑ #${precedingRank}`, ariaLabel: `up ${rankDelta} positions from rank ${precedingRank}`, color: colors.success };
  }

  if (rankDelta < 0) {
    // Declined rank (Requirement 15.4)
    return { char: "↓", text: `↓ #${precedingRank}`, ariaLabel: `down ${Math.abs(rankDelta)} positions from rank ${precedingRank}`, color: colors.error };
  }

  // Explicit zero delta
  return { char: "–", text: "–", ariaLabel: "no change", color: colors.textMuted };
}

// ── Styles ───────────────────────────────────────────────────────────────────

const containerStyle: CSSProperties = {
  maxHeight: 300,
  overflowY: "auto",
  overflowX: "hidden",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
  color: colors.textPrimary,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "4px 6px",
  fontSize: 11,
  fontWeight: 600,
  color: colors.textMuted,
  borderBottom: `1px solid ${colors.border}`,
  position: "sticky",
  top: 0,
  backgroundColor: colors.bgCard,
  zIndex: 1,
};

const thRightStyle: CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

const tdStyle: CSSProperties = {
  padding: "5px 6px",
  verticalAlign: "middle",
};

const tdRightStyle: CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const rankStyle: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  color: colors.textSecondary,
  minWidth: 20,
  display: "inline-block",
  textAlign: "right",
};

const insufficientStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: colors.textMuted,
};

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a scrollable leaderboard of users ranked by adoption score.
 * Falls back to an insufficient-data message when fewer than 2 users are available.
 */
export function AdoptionLeaderboard({
  insights,
  userSummaries,
}: AdoptionLeaderboardProps) {
  // Requirement 15.9: fewer than two users → fall back to insufficient_data message.
  const usersWithScore = userSummaries.filter((u) => u.adoption_score != null);
  if (usersWithScore.length < 2) {
    return (
      <p
        data-testid="adoption-leaderboard-insufficient"
        style={insufficientStyle}
      >
        Insufficient data — at least two users with adoption scores are required
        to display the leaderboard.
      </p>
    );
  }

  // Sort by adoption_score descending; ties broken by ascending user_id
  // (Requirement 15.1).
  const ranked = [...usersWithScore].sort((a, b) => {
    const diff = b.adoption_score - a.adoption_score;
    if (diff !== 0) return diff;
    if (a.user_id < b.user_id) return -1;
    if (a.user_id > b.user_id) return 1;
    return 0;
  });

  const rankDeltaMap = buildRankDeltaMap(insights);
  const newEntrantSet = buildNewEntrantSet(insights);

  return (
    <div
      style={containerStyle}
      data-testid="adoption-leaderboard"
      aria-label="Adoption score leaderboard"
    >
      <table style={tableStyle} aria-label="Adoption score leaderboard">
        <thead>
          <tr>
            <th scope="col" style={thStyle}>
              Rank
            </th>
            <th scope="col" style={thStyle}>
              User
            </th>
            <th scope="col" style={thRightStyle}>
              Score
            </th>
            <th scope="col" style={thRightStyle}>
              Trend
            </th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((user, index) => {
            const rank = index + 1;
            const indicator = getDeltaIndicator(
              user.user_id,
              rankDeltaMap,
              newEntrantSet,
            );

            return (
              <tr
                key={user.user_id}
                data-testid={`leaderboard-row-${user.user_id}`}
              >
                {/* Numeric rank (Requirement 15.2) */}
                <td style={tdStyle}>
                  <span style={rankStyle}>{rank}</span>
                </td>

                {/* User identifier / label (Requirement 15.2) */}
                <td
                  style={tdStyle}
                  title={user.user_id !== user.label ? user.user_id : undefined}
                >
                  {user.label || user.user_id}
                </td>

                {/* Adoption score rounded to 2 decimal places (Requirement 15.2) */}
                <td style={tdRightStyle}>
                  {toFixed2(user.adoption_score)}
                </td>

                {/* Direction indicator: character + aria-label, never color alone
                    (Requirement 15.8) */}
                <td style={{ ...tdRightStyle, color: indicator.color, fontWeight: 600, whiteSpace: "nowrap" }}>
                  <span
                    aria-label={indicator.ariaLabel}
                    role="img"
                    data-testid={`leaderboard-delta-${user.user_id}`}
                  >
                    {indicator.text}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
