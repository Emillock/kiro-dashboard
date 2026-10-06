/**
 * Anomaly and attention flags (Requirement 8).
 *
 * Surfaces two kinds of attention flags derived from sudden changes between the
 * `preceding` (earlier) and `current` (later) sub-periods of the selected range
 * (split via `splitRange`, with the middle day of an odd-length range assigned
 * to `current`, Requirement 3.1):
 *
 * - **Activity-drop flag** — when `active_users` or `total_messages` decreased
 *   from the preceding sub-period to the current sub-period by a percentage
 *   *strictly greater than* `config.activityDropThresholdPct` (default 30)
 *   (Requirement 8.1).
 * - **Per-user cost-spike flag** — when a user's `credits_used` per message
 *   increased from the preceding sub-period to the current sub-period by a
 *   percentage *strictly greater than* `config.costSpikeThresholdPct`
 *   (default 50) (Requirement 8.2).
 *
 * Thresholds are percentages in the range 0..1000 applied consistently
 * (Requirement 8.3). A change exactly equal to a threshold produces no flag
 * (strict `>`, Requirement 8.5). A flag is omitted when its baseline sub-period
 * has a zero denominator (zero `active_users`, zero `total_messages`, or zero
 * message output for the evaluated user) or when fewer than two sub-periods of
 * data exist (Requirement 8.4).
 *
 * Only flagged anomalies are returned; when nothing is anomalous the result is
 * an empty array (the page maps that to the category empty state). This module
 * is pure TypeScript with no React imports, so it runs under the existing
 * node-based Vitest setup and is fully property-testable.
 */

import type {
  DailyTotal,
  Insight,
  InsightConfig,
  UserMetrics,
  SubPeriodAggregate,
} from "./types";
import { splitAndAggregate } from "./subperiods";
import { percentageChange, round2 } from "./math";

const CATEGORY = "anomalies" as const;

/** Input for {@link computeAnomalyInsights}. */
export interface AnomalyInsightInput {
  /** Ordered daily totals for the selected range (org-level activity drop). */
  dailyTotals: DailyTotal[];
  /** Per-user metrics for the range (per-user cost spikes); may be `null`. */
  userMetrics: UserMetrics[] | null;
}

/**
 * Credits consumed per message for a sub-period, or `null` when the sub-period
 * produced no messages (a zero denominator, Requirement 8.4).
 */
function creditsPerMessage(agg: SubPeriodAggregate): number | null {
  if (agg.totalMessages <= 0) {
    return null;
  }
  return agg.creditsUsed / agg.totalMessages;
}

/**
 * Build an activity-drop flag for one org-level metric, or `null` when no flag
 * applies.
 *
 * The flag is present if and only if the decrease percentage
 * `(baseline - current) / baseline * 100` is strictly greater than `threshold`
 * (Requirements 8.1, 8.5). It is omitted when the baseline is zero (a zero
 * denominator) or when the two sub-periods are not both populated
 * (Requirement 8.4); both conditions surface as a `null` from
 * {@link percentageChange} or a non-positive `baseline`.
 */
function activityDropFlag(
  key: "active_users" | "total_messages",
  label: string,
  current: number,
  baseline: number,
  threshold: number,
): Insight | null {
  // Guard: zero baseline cannot yield a meaningful percentage (Requirement 8.4).
  if (baseline <= 0) {
    return null;
  }
  const pct = percentageChange(current, baseline);
  if (pct === null) {
    return null;
  }
  // `pct` is the signed change; the decrease percentage is its negation.
  const decreasePct = -pct;
  if (decreasePct <= threshold) {
    // Equal-to-threshold or any non-qualifying change produces no flag
    // (strict `>`, Requirements 8.5; no false positive on non-decrease, 8.4).
    return null;
  }
  const magnitude = round2(decreasePct);
  return {
    id: `anomalies-activity-drop-${key}`,
    category: CATEGORY,
    title: `Activity drop: ${label}`,
    description: `${label} fell ${magnitude}% from the preceding sub-period to the current sub-period, exceeding the ${threshold}% activity-drop threshold.`,
    status: "anomaly",
    magnitude,
    detail: {
      metric: key,
      baseline,
      current,
      dropPct: magnitude,
      threshold,
      comparison: "preceding vs current sub-period",
    },
  };
}

/**
 * Compute anomaly insights for the selected range (Requirement 8).
 *
 * Produces:
 * - up to two activity-drop flags (for `active_users` and `total_messages`)
 *   when the org-level decrease between sub-periods strictly exceeds
 *   `config.activityDropThresholdPct` (Requirements 8.1, 8.3, 8.5);
 * - one per-user cost-spike flag for each user whose `credits_used` per message
 *   increased between sub-periods by strictly more than
 *   `config.costSpikeThresholdPct` (Requirements 8.2, 8.3, 8.5).
 *
 * Flags are omitted on zero baselines or when fewer than two sub-periods exist
 * (Requirement 8.4). Only flagged anomalies are returned.
 *
 * @param input - Org-level daily totals and optional per-user metrics.
 * @param config - Threshold configuration (uses `activityDropThresholdPct` and
 *   `costSpikeThresholdPct`).
 * @returns The list of anomaly flags (empty when nothing is anomalous).
 */
export function computeAnomalyInsights(
  input: AnomalyInsightInput,
  config: InsightConfig,
): Insight[] {
  const insights: Insight[] = [];

  // ── Org-level activity-drop flags (Requirements 8.1, 8.4, 8.5) ────────────
  // Guard: two populated sub-periods are required (Requirement 8.4).
  if (input.dailyTotals.length >= 2) {
    const { preceding, current } = splitAndAggregate(input.dailyTotals);
    if (preceding.days >= 1 && current.days >= 1) {
      const activeUsersFlag = activityDropFlag(
        "active_users",
        "Active users",
        current.activeUsersPeak,
        preceding.activeUsersPeak,
        config.activityDropThresholdPct,
      );
      if (activeUsersFlag) {
        insights.push(activeUsersFlag);
      }

      const messagesFlag = activityDropFlag(
        "total_messages",
        "Total messages",
        current.totalMessages,
        preceding.totalMessages,
        config.activityDropThresholdPct,
      );
      if (messagesFlag) {
        insights.push(messagesFlag);
      }
    }
  }

  // ── Per-user cost-spike flags (Requirements 8.2, 8.4, 8.5) ────────────────
  const users = input.userMetrics ?? [];
  // Deterministic ordering by user identifier so the output is stable.
  const sortedUsers = [...users].sort((a, b) =>
    a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0,
  );

  for (const user of sortedUsers) {
    // Guard: two populated sub-periods are required (Requirement 8.4).
    if (user.daily_breakdown.length < 2) {
      continue;
    }
    const { preceding, current } = splitAndAggregate(user.daily_breakdown);
    if (preceding.days < 1 || current.days < 1) {
      continue;
    }

    // Guard: zero message output in the baseline sub-period (Requirement 8.4).
    const baselineCpm = creditsPerMessage(preceding);
    if (baselineCpm === null || baselineCpm <= 0) {
      continue;
    }
    // A current sub-period with no messages is not a spike (treated as 0 cost).
    const currentCpm = creditsPerMessage(current) ?? 0;

    const pct = percentageChange(currentCpm, baselineCpm);
    if (pct === null) {
      continue;
    }
    // Strictly greater than the threshold; equal-to-threshold = no flag (8.5).
    if (pct <= config.costSpikeThresholdPct) {
      continue;
    }

    const magnitude = round2(pct);
    insights.push({
      id: `anomalies-cost-spike-${user.user_id}`,
      category: CATEGORY,
      title: `Cost spike: ${user.label}`,
      description: `${user.label}'s credits-per-message rose ${magnitude}% from the preceding sub-period to the current sub-period, exceeding the ${config.costSpikeThresholdPct}% cost-spike threshold.`,
      status: "anomaly",
      magnitude,
      detail: {
        user_id: user.user_id,
        baselineCreditsPerMessage: round2(baselineCpm),
        currentCreditsPerMessage: round2(currentCpm),
        spikePct: magnitude,
        threshold: config.costSpikeThresholdPct,
        comparison: "preceding vs current sub-period",
      },
    });
  }

  return insights;
}
