/**
 * Insight_Engine aggregator (Requirements 2.5, 11.4, 11.5).
 *
 * `computeInsights` is the single public entry point of the engine. It calls each
 * of the seven pure category computers with exactly the data that computer needs
 * and assembles their output into a `CategorizedInsights` map (one
 * `CategoryResult` per `InsightCategory`).
 *
 * ## Dependency isolation (Requirements 11.4, 11.5, Property 29)
 *
 * The aggregator never lets an absent input suppress insights that *can* be
 * computed from what *is* present:
 *
 * - Absent gated dependencies (`allowanceByTier`, `overageByUser`) and an absent
 *   per-user fan-out (`userMetrics`) are passed through as `null`; each computer
 *   performs its own gating and emits `unavailable` / `insufficient_data` only for
 *   the individual insights that truly depend on the missing data.
 * - Satisfied insights therefore always compute regardless of which optional
 *   dependencies happen to be absent.
 *
 * ## Whole-category insufficiency (Requirements 4.6, 6.6, Property 11)
 *
 * A computer signals "no computable insights for this category" by returning an
 * empty `Insight[]`. The aggregator maps that to a `{ kind: "insufficient" }`
 * `CategoryResult` carrying a category-appropriate reason:
 *
 * - **adoption** returns `[]` when fewer than two users are present (R4.6).
 * - **modelUsage** returns `[]` when `model_distribution` is empty (R6.6).
 * - **aggregate-driven** categories (trends, engagement, cost & efficiency) are
 *   mapped to `insufficient` when the range carries no daily totals (Property 11).
 *
 * `anomalies` is special: with daily data present but nothing anomalous it returns
 * `[]`, which is a legitimate *empty* result (good news), so it is surfaced as
 * `{ kind: "insights", insights: [] }` and only mapped to `insufficient` when there
 * are no daily totals to evaluate at all. `creditDepletion` always returns at least
 * the reset-day insight plus its individually-gated insights, so it is always
 * `{ kind: "insights" }`.
 *
 * This module is pure TypeScript with no React imports.
 */

import type {
  CategorizedInsights,
  CategoryResult,
  Insight,
  InsightConfig,
  InsightEngineInput,
  UserAdoptionInput,
  UserMetrics,
  UserSummary,
} from "./types";
import { splitRange } from "./subperiods";
import { computeTrendInsights } from "./trends";
import { computeAdoptionInsights } from "./adoption";
import { computeEngagementInsights } from "./engagement";
import { computeModelUsageInsights } from "./modelUsage";
import { computeCostEfficiencyInsights } from "./costEfficiency";
import { computeAnomalyInsights } from "./anomalies";
import { computeCreditDepletionInsights } from "./creditDepletion";

// Re-export the public surface so callers can import everything from
// `lib/insights` directly.
export * from "./types";
export { DEFAULT_INSIGHT_CONFIG } from "./config";
export { computeTrendInsights } from "./trends";
export { computeAdoptionInsights } from "./adoption";
export { computeEngagementInsights } from "./engagement";
export { computeModelUsageInsights } from "./modelUsage";
export { computeCostEfficiencyInsights } from "./costEfficiency";
export { computeAnomalyInsights } from "./anomalies";
export { computeCreditDepletionInsights } from "./creditDepletion";

/**
 * Build per-user adoption snapshots for {@link computeAdoptionInsights}.
 *
 * `adoptionScore` is sourced from each user's backend-provided adoption score.
 * The preceding/current sub-period activity used for rank-delta and new-adopter
 * detection is derived from each user's `daily_breakdown` (summed `total_messages`
 * over the `preceding` and `current` halves produced by `splitRange`), which is
 * only present on `UserMetrics`.
 *
 * When a user's per-sub-period breakdown is not derivable (no `UserMetrics`, or an
 * empty `daily_breakdown`), a deterministic proxy is used: the user's whole-range
 * `total_messages` is assigned to *both* sub-period activity values. This keeps the
 * distribution-health insight (which depends only on `adoptionScore`) fully
 * correct, while making rank deltas resolve to zero (no fabricated movement) and
 * leaving new-adopter detection inert (`preceding === current`, so a user is never
 * falsely reported as going from zero to non-zero activity).
 *
 * The canonical user list prefers `userSummaries` (the adoption leaderboard
 * source); when it is absent it falls back to the user ids present in
 * `userMetrics`.
 *
 * @param userSummaries - Per-user adoption summaries, or `null` when unavailable.
 * @param userMetrics - Fanned-out per-user metrics, or `null` when unresolved.
 * @returns One `UserAdoptionInput` per known user.
 */
function buildAdoptionInputs(
  userSummaries: UserSummary[] | null,
  userMetrics: UserMetrics[] | null,
): UserAdoptionInput[] {
  // Index per-user metrics for sub-period activity derivation.
  const metricsById = new Map<string, UserMetrics>();
  if (userMetrics) {
    for (const m of userMetrics) {
      metricsById.set(m.user_id, m);
    }
  }

  // Determine the canonical user list and each user's adoption score + total
  // activity. Prefer the summary list; otherwise fall back to per-user metrics.
  const base: Array<{
    userId: string;
    label: string;
    adoptionScore: number;
    totalMessages: number;
  }> = [];
  if (userSummaries && userSummaries.length > 0) {
    for (const s of userSummaries) {
      base.push({
        userId: s.user_id,
        label: s.label,
        adoptionScore: s.adoption_score,
        totalMessages: s.total_messages,
      });
    }
  } else if (userMetrics && userMetrics.length > 0) {
    for (const m of userMetrics) {
      base.push({
        userId: m.user_id,
        label: m.label,
        adoptionScore: m.adoption_score,
        totalMessages: m.total_messages,
      });
    }
  }

  return base.map((u) => {
    const metrics = metricsById.get(u.userId);
    if (metrics && metrics.daily_breakdown.length > 0) {
      // Derive real per-sub-period activity from the daily breakdown.
      const { preceding, current } = splitRange(metrics.daily_breakdown);
      const precedingActivity = preceding.reduce(
        (sum, d) => sum + d.total_messages,
        0,
      );
      const currentActivity = current.reduce(
        (sum, d) => sum + d.total_messages,
        0,
      );
      return {
        userId: u.userId,
        label: u.label,
        precedingScoreOrActivity: precedingActivity,
        currentScoreOrActivity: currentActivity,
        adoptionScore: u.adoptionScore,
      };
    }
    // Proxy: no per-sub-period breakdown available. Assign the whole-range total
    // to both halves (see function doc) so distribution-health stays correct while
    // rank-delta / new-adopter logic produces no fabricated results.
    return {
      userId: u.userId,
      label: u.label,
      precedingScoreOrActivity: u.totalMessages,
      currentScoreOrActivity: u.totalMessages,
      adoptionScore: u.adoptionScore,
    };
  });
}

/**
 * Map an aggregate-driven category's insights to a `CategoryResult`.
 *
 * Returns `insufficient` (with `reason`) when the range carries no daily totals or
 * the computer produced no insights — the whole-category insufficiency required by
 * Property 11 for aggregate-driven categories — and `{ kind: "insights" }`
 * otherwise.
 */
function aggregateDrivenResult(
  insights: Insight[],
  hasDailyTotals: boolean,
  reason: string,
): CategoryResult {
  if (!hasDailyTotals || insights.length === 0) {
    return { kind: "insufficient", reason };
  }
  return { kind: "insights", insights };
}

/**
 * Compute every category of insight for the selected range (Requirement 2.5).
 *
 * Calls each category computer with the data it needs and assembles a
 * `CategorizedInsights` map. Optional/gated inputs are passed through as `null` so
 * each computer gates its own dependency-bound insights without suppressing the
 * insights that can be computed from the data that is present (Requirements 11.4,
 * 11.5, Property 29). Empty category outputs are mapped to whole-category
 * `insufficient` results with category-appropriate reasons (Requirements 4.6, 6.6,
 * Property 11).
 *
 * @param input - The engine input (range, aggregate, summaries, per-user metrics,
 *   and the null-by-default gated dependencies).
 * @param config - Threshold configuration (typically `DEFAULT_INSIGHT_CONFIG`).
 * @returns The seven-category result map.
 */
export function computeInsights(
  input: InsightEngineInput,
  config: InsightConfig,
): CategorizedInsights {
  const aggregate = input.aggregate ?? null;
  const dailyTotals = aggregate?.daily_totals ?? [];
  const hasDailyTotals = dailyTotals.length > 0;
  const userMetrics = input.userMetrics ?? null;
  const userSummaries = input.userSummaries ?? null;
  const allowanceByTier = input.allowanceByTier ?? null;
  const overageByUser = input.overageByUser ?? null;

  // ── Trends (aggregate-driven) ─────────────────────────────────────────────
  const trends = aggregateDrivenResult(
    computeTrendInsights(dailyTotals, config),
    hasDailyTotals,
    "There are no daily totals in the selected range to compute trend insights.",
  );

  // ── Adoption (insufficient when fewer than two users, R4.6) ───────────────
  const adoptionInputs = buildAdoptionInputs(userSummaries, userMetrics);
  const adoptionInsights = computeAdoptionInsights(adoptionInputs, config);
  const adoption: CategoryResult =
    adoptionInsights.length > 0
      ? { kind: "insights", insights: adoptionInsights }
      : {
          kind: "insufficient",
          reason:
            "Adoption insights need at least two users with adoption data in the selected range.",
        };

  // ── Engagement (aggregate-driven) ─────────────────────────────────────────
  const engagement = aggregateDrivenResult(
    computeEngagementInsights({ dailyTotals, userMetrics }, config),
    hasDailyTotals,
    "There are no daily totals in the selected range to compute engagement insights.",
  );

  // ── Model usage (insufficient when distribution is empty, R6.6) ───────────
  const modelInsights = computeModelUsageInsights(
    { aggregate, userMetrics },
    config,
  );
  const modelUsage: CategoryResult =
    modelInsights.length > 0
      ? { kind: "insights", insights: modelInsights }
      : {
          kind: "insufficient",
          reason:
            "Model usage insights need a non-empty model distribution for the selected range.",
        };

  // ── Cost & efficiency (aggregate-driven) ──────────────────────────────────
  const costEfficiency = aggregateDrivenResult(
    computeCostEfficiencyInsights({ dailyTotals, userMetrics }, config),
    hasDailyTotals,
    "There are no daily totals in the selected range to compute cost and efficiency insights.",
  );

  // ── Anomalies ─────────────────────────────────────────────────────────────
  // With daily data present, an empty result means "no anomalies detected" (a
  // legitimate empty state), so it is surfaced as an empty insights list. Only the
  // total absence of daily totals makes the category insufficient.
  const anomalyInsights = computeAnomalyInsights({ dailyTotals, userMetrics }, config);
  const anomalies: CategoryResult = hasDailyTotals
    ? { kind: "insights", insights: anomalyInsights }
    : {
        kind: "insufficient",
        reason:
          "There are no daily totals in the selected range to detect anomalies.",
      };

  // ── Credit depletion (always returns insights; gating is per-insight) ─────
  const creditInsights = computeCreditDepletionInsights(
    {
      range: input.range,
      aggregate,
      userMetrics,
      allowanceByTier,
      overageByUser,
    },
    config,
  );
  const creditDepletion: CategoryResult =
    creditInsights.length > 0
      ? { kind: "insights", insights: creditInsights }
      : {
          kind: "insufficient",
          reason:
            "There is no data in the selected range to compute credit-depletion insights.",
        };

  return {
    trends,
    adoption,
    engagement,
    modelUsage,
    costEfficiency,
    anomalies,
    creditDepletion,
  };
}
