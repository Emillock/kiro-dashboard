/**
 * Model usage insights (Requirement 6).
 *
 * Computes each model's share of total messages and the dominant model, attempts
 * a period-over-period mix-shift comparison, and flags per-user model outliers
 * whose dominant model diverges from the organization's dominant model.
 *
 * This module is pure TypeScript with no React imports, so it runs under the
 * existing node-based Vitest setup and is fully property-testable.
 *
 * ## Sub-period model distribution availability (key limitation)
 *
 * Mix-shift detection (Requirements 6.3, 6.4) requires a `model_distribution` for
 * each of the two sub-periods. The metrics API exposes `model_distribution` only
 * as a single overall `Record<string, number>` on `AggregateMetrics`, and the
 * per-day `DailyTotal` records carry no per-model breakdown (their fields are
 * date, total_messages, chat_conversations, credits_used, active_users). There is
 * therefore no data source from which a per-sub-period model distribution can be
 * derived. The mix-shift insight is consequently presented as `insufficient_data`
 * with an explicit reason, rather than fabricating a comparison. Should the
 * backend later expose a daily or sub-period model breakdown, only
 * {@link computeMixShiftInsight} needs to change.
 */

import type {
  AggregateMetrics,
  Insight,
  InsightConfig,
  UserMetrics,
} from "./types";
import { round2 } from "./math";

const CATEGORY = "modelUsage" as const;

/** Floating-point tolerance for share comparisons (Requirements 6.2, Property 15). */
const SHARE_TOLERANCE = 1e-9;

/** Input to {@link computeModelUsageInsights}. */
export interface ModelUsageInput {
  /** Aggregate metrics supplying the overall `model_distribution`. */
  aggregate: AggregateMetrics | null;
  /** Fanned-out per-user metrics supplying per-user `model_messages`. */
  userMetrics: UserMetrics[] | null;
}

/** A single model's message count and its share of the total. */
interface ModelShare {
  model: string;
  count: number;
  share: number;
}

/**
 * Compute per-model shares from a distribution, sorted by model identifier
 * ascending so downstream tie-breaks are deterministic.
 *
 * `share` is `count / total` when the summed total is positive, otherwise `0`
 * (guarding division by zero for a distribution whose counts are all zero).
 */
function computeShares(distribution: Record<string, number>): {
  shares: ModelShare[];
  total: number;
} {
  const models = Object.keys(distribution).sort();
  let total = 0;
  for (const model of models) {
    const count = distribution[model];
    if (Number.isFinite(count) && count > 0) {
      total += count;
    }
  }

  const shares: ModelShare[] = models.map((model) => {
    const raw = distribution[model];
    const count = Number.isFinite(raw) ? raw : 0;
    return {
      model,
      count,
      share: total > 0 ? count / total : 0,
    };
  });

  return { shares, total };
}

/**
 * Identify the dominant model (highest share) from a list of shares, breaking
 * ties within {@link SHARE_TOLERANCE} by the lexicographically smallest model
 * identifier (Requirement 6.2).
 *
 * `shares` is assumed sorted by model identifier ascending (as produced by
 * {@link computeShares}); a candidate replaces the incumbent only when its share
 * exceeds the incumbent's by more than the tolerance, so the first (smallest-id)
 * member of any tie group is retained. Returns `null` for an empty list.
 */
function dominantModel(shares: ModelShare[]): ModelShare | null {
  let best: ModelShare | null = null;
  for (const candidate of shares) {
    if (best === null || candidate.share > best.share + SHARE_TOLERANCE) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Build the dominant-model "mix" insight from the overall distribution
 * (Requirements 6.1, 6.2).
 *
 * When the distribution carries no messages (summed total of zero) there is no
 * meaningful dominant model, so the insight is presented as `insufficient_data`.
 */
function computeDominantInsight(
  shares: ModelShare[],
  total: number,
): Insight {
  const id = "modelUsage-dominant";
  const title = "Dominant model";

  if (total <= 0) {
    return {
      id,
      category: CATEGORY,
      title,
      description:
        "No model messages were recorded for the range, so a dominant model cannot be determined.",
      status: "insufficient_data",
      unavailableReason: "no model messages in the range",
    };
  }

  const dominant = dominantModel(shares);
  // `total > 0` guarantees a non-null dominant, but guard for type-safety.
  if (dominant === null) {
    return {
      id,
      category: CATEGORY,
      title,
      description:
        "No model messages were recorded for the range, so a dominant model cannot be determined.",
      status: "insufficient_data",
      unavailableReason: "no model messages in the range",
    };
  }

  const sharePct = round2(dominant.share * 100);
  const detail: Record<string, number | string> = {
    model: dominant.model,
    share: dominant.share,
  };
  for (const s of shares) {
    detail[`share_${s.model}`] = s.share;
  }

  return {
    id,
    category: CATEGORY,
    title,
    description: `${dominant.model} is the most-used model, accounting for ${sharePct}% of messages.`,
    status: "ok",
    magnitude: sharePct,
    detail,
  };
}

/**
 * Build the mix-shift insight (Requirements 6.3, 6.4).
 *
 * The metrics API does not expose a per-sub-period `model_distribution` (see the
 * module-level note), so the absolute change in each model's share between the
 * preceding and current sub-periods cannot be computed. The insight is therefore
 * always presented as `insufficient_data` with the missing dependency named.
 */
function computeMixShiftInsight(): Insight {
  return {
    id: "modelUsage-mix-shift",
    category: CATEGORY,
    title: "Model mix shift",
    description:
      "Cannot determine how the model mix shifted across sub-periods because per-sub-period model distribution is not available from the metrics API.",
    status: "insufficient_data",
    unavailableReason: "per-sub-period model distribution not exposed by the API",
  };
}

/** Sum of a user's per-model message counts (finite, positive entries only). */
function userMessageCount(modelMessages: Record<string, number>): number {
  let total = 0;
  for (const model of Object.keys(modelMessages)) {
    const count = modelMessages[model];
    if (Number.isFinite(count) && count > 0) {
      total += count;
    }
  }
  return total;
}

/**
 * Compute per-user model outlier insights (Requirement 6.5, Property 17).
 *
 * A user qualifies as an outlier when their model message count (the sum of their
 * `model_messages`) is at least `config.modelOutlierMinMessages` (default 5) and
 * their own dominant model differs from the overall dominant model. Qualifying
 * users are ordered by descending message count — ties broken by ascending user
 * identifier for determinism — and capped at `config.modelOutlierMaxUsers`
 * (default 50).
 *
 * Returns an empty array when there is no overall dominant model to compare
 * against or when no per-user metrics are available; the caller decides how to
 * surface the absence of outliers.
 */
function computeOutlierInsights(
  userMetrics: UserMetrics[],
  overallDominant: string | null,
  config: InsightConfig,
): Insight[] {
  if (overallDominant === null) {
    return [];
  }

  interface Outlier {
    userId: string;
    label: string;
    messageCount: number;
    dominant: string;
  }

  const outliers: Outlier[] = [];
  for (const user of userMetrics) {
    const messageCount = userMessageCount(user.model_messages);
    if (messageCount < config.modelOutlierMinMessages) {
      continue;
    }
    const { shares } = computeShares(user.model_messages);
    const userDominant = dominantModel(shares);
    if (userDominant === null) {
      continue;
    }
    if (userDominant.model !== overallDominant) {
      outliers.push({
        userId: user.user_id,
        label: user.label,
        messageCount,
        dominant: userDominant.model,
      });
    }
  }

  outliers.sort((a, b) => {
    if (b.messageCount !== a.messageCount) {
      return b.messageCount - a.messageCount;
    }
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });

  return outliers.slice(0, config.modelOutlierMaxUsers).map((o) => ({
    id: `modelUsage-outlier-${o.userId}`,
    category: CATEGORY,
    title: "Model usage outlier",
    description: `${o.label} mainly uses ${o.dominant}, which differs from the organization's dominant model ${overallDominant}.`,
    status: "ok" as const,
    magnitude: o.messageCount,
    detail: {
      user_id: o.userId,
      dominant_model: o.dominant,
      overall_dominant_model: overallDominant,
      message_count: o.messageCount,
    },
  }));
}

/**
 * Compute model usage insights (Requirement 6).
 *
 * Produces, in order:
 * - a dominant-model insight from the overall `model_distribution`, with shares
 *   that sum to 1 within 1e-9 and a lexicographic tie-break (Requirements 6.1,
 *   6.2, Property 15);
 * - a mix-shift insight, always `insufficient_data` because the API exposes no
 *   per-sub-period model distribution (Requirements 6.3, 6.4, Property 16);
 * - per-user model outlier insights (or a single "no outliers" note when per-user
 *   metrics are available but none qualify) ordered by descending message count
 *   and capped at the configured maximum (Requirement 6.5, Property 17).
 *
 * Returns an empty array when `model_distribution` is empty or unavailable, so the
 * aggregator emits a whole-category `insufficient` result (Requirement 6.6).
 *
 * @param input - The aggregate metrics and fanned-out per-user metrics.
 * @param config - Threshold configuration (model outlier min/max).
 * @returns The list of model usage insights, or `[]` when the category is
 *   insufficient.
 */
export function computeModelUsageInsights(
  input: ModelUsageInput,
  config: InsightConfig,
): Insight[] {
  const distribution = input.aggregate?.model_distribution;

  // Empty or unavailable distribution -> whole-category insufficiency (R6.6).
  if (!distribution || Object.keys(distribution).length === 0) {
    return [];
  }

  const insights: Insight[] = [];

  const { shares, total } = computeShares(distribution);
  insights.push(computeDominantInsight(shares, total));
  insights.push(computeMixShiftInsight());

  const overallDominant = total > 0 ? dominantModel(shares)?.model ?? null : null;

  if (input.userMetrics && input.userMetrics.length > 0) {
    const outlierInsights = computeOutlierInsights(
      input.userMetrics,
      overallDominant,
      config,
    );
    if (outlierInsights.length > 0) {
      insights.push(...outlierInsights);
    } else {
      insights.push({
        id: "modelUsage-outliers-none",
        category: CATEGORY,
        title: "Model usage outliers",
        description:
          "No users diverge from the organization's dominant model beyond the minimum-message threshold.",
        status: "ok",
        detail: { outlier_count: 0 },
      });
    }
  }

  return insights;
}
