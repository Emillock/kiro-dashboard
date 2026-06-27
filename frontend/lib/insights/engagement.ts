/**
 * Engagement insights (Requirement 5).
 *
 * Derives Stickiness and Intensity (avg_messages_per_user) from a range's daily
 * totals, classifies the Intensity trend across the two sub-periods, and flags
 * dormant users from per-user metrics. Period-over-period comparisons split the
 * range into a `preceding` (earlier) and `current` (later) sub-period via
 * `splitRange`, with the middle day of an odd-length range assigned to `current`
 * (Requirement 3.1).
 *
 * This module is pure TypeScript with no React imports, so it runs under the
 * existing node-based Vitest setup and is fully property-testable.
 */

import type {
  DailyTotal,
  Insight,
  InsightConfig,
  UserMetrics,
} from "./types";
import { aggregateSubPeriod, splitRange } from "./subperiods";
import { classifyTrend, round2 } from "./math";

const CATEGORY = "engagement" as const;

/**
 * Input to {@link computeEngagementInsights}.
 *
 * Stickiness and Intensity are computed from the aggregate `dailyTotals`, while
 * dormant-user classification needs the per-user `active_days` and
 * `subscription_tier` only available from `userMetrics`. `userMetrics` is `null`
 * when the per-user fan-out has not resolved, in which case the dormant-users
 * insight renders as `insufficient_data` without affecting the aggregate-driven
 * insights (Requirements 5.4, 11.5).
 */
export interface EngagementInput {
  /** Ordered daily totals for the selected range. */
  dailyTotals: DailyTotal[];
  /** Per-user metrics from the fan-out; `null` until resolved. */
  userMetrics: UserMetrics[] | null;
}

/**
 * The number of days in `days` on which at least one user was active
 * (`active_users > 0`). This is the active-day count used by Stickiness
 * (Requirement 5.1).
 */
function activeDayCount(days: DailyTotal[]): number {
  let count = 0;
  for (const day of days) {
    if (day.active_users > 0) {
      count++;
    }
  }
  return count;
}

/**
 * avg_messages_per_user for a set of days, computed as
 * `total_messages / active_users` where `active_users` is the representative
 * (peak) active-user count for the window (Requirement 5.2).
 *
 * Returns `null` when the representative active-user count is zero so callers can
 * emit `insufficient_data` rather than dividing by zero (Requirement 5.4).
 */
function avgMessagesPerUser(days: DailyTotal[]): number | null {
  const agg = aggregateSubPeriod(days);
  if (agg.activeUsersPeak <= 0) {
    return null;
  }
  return agg.totalMessages / agg.activeUsersPeak;
}

/**
 * Stickiness insight: active-day count divided by total-day count, reported with
 * both counts in `detail` (Requirement 5.1, Property 12).
 *
 * Presented as `insufficient_data` when the range has no days, so no division by
 * zero or fabricated value occurs.
 */
function stickinessInsight(dailyTotals: DailyTotal[]): Insight {
  const id = "engagement-stickiness";
  const title = "Stickiness";
  const totalDays = dailyTotals.length;

  if (totalDays === 0) {
    return {
      id,
      category: CATEGORY,
      title,
      description:
        "Cannot compute stickiness because the selected range has no days.",
      status: "insufficient_data",
      unavailableReason: "no daily totals",
    };
  }

  const activeDays = activeDayCount(dailyTotals);
  const stickiness = round2(activeDays / totalDays);

  return {
    id,
    category: CATEGORY,
    title,
    description: `The team was active on ${activeDays} of ${totalDays} days (stickiness ${stickiness}).`,
    status: "ok",
    magnitude: stickiness,
    detail: { activeDays, totalDays },
  };
}

/**
 * Intensity insight: avg_messages_per_user for the whole range
 * (`round2(total_messages / active_users)`), reported as the Intensity value
 * (Requirement 5.2, Property 13).
 *
 * Presented as `insufficient_data` when the representative active-user count is
 * zero (Requirement 5.4).
 */
function intensityInsight(dailyTotals: DailyTotal[]): Insight {
  const id = "engagement-intensity";
  const title = "Intensity";
  const agg = aggregateSubPeriod(dailyTotals);
  const avg = avgMessagesPerUser(dailyTotals);

  if (avg === null) {
    return {
      id,
      category: CATEGORY,
      title,
      description:
        "Cannot compute average messages per user because no users were active in the range.",
      status: "insufficient_data",
      unavailableReason: "zero active users",
      detail: { totalMessages: agg.totalMessages, activeUsers: agg.activeUsersPeak },
    };
  }

  const value = round2(avg);
  return {
    id,
    category: CATEGORY,
    title,
    description: `Active users sent an average of ${value} messages each over the range.`,
    status: "ok",
    magnitude: value,
    detail: { totalMessages: agg.totalMessages, activeUsers: agg.activeUsersPeak },
  };
}

/**
 * Intensity-trend insight: classifies avg_messages_per_user between the
 * preceding and current sub-periods against a relative tolerance band of
 * `config.intensityTrendTolerance * |preceding|` (Requirement 5.3).
 *
 * When avg_messages_per_user is unavailable for either sub-period (e.g. a
 * sub-period with zero active users), the trend is omitted and presented as
 * `insufficient_data` without affecting the other insights (Requirement 5.4).
 */
function intensityTrendInsight(
  dailyTotals: DailyTotal[],
  config: InsightConfig,
): Insight {
  const id = "engagement-intensity-trend";
  const title = "Intensity trend";

  const { preceding, current } = splitRange(dailyTotals);
  const precedingAvg = avgMessagesPerUser(preceding);
  const currentAvg = avgMessagesPerUser(current);

  if (precedingAvg === null || currentAvg === null) {
    return {
      id,
      category: CATEGORY,
      title,
      description:
        "Cannot compute the intensity trend because average messages per user is unavailable for one or both sub-periods.",
      status: "insufficient_data",
      unavailableReason: "insufficient sub-period data",
    };
  }

  const band = config.intensityTrendTolerance * Math.abs(precedingAvg);
  const direction = classifyTrend(currentAvg, precedingAvg, band);
  const verb =
    direction === "increase"
      ? "increasing"
      : direction === "decrease"
        ? "decreasing"
        : "unchanged";

  return {
    id,
    category: CATEGORY,
    title,
    description: `Average messages per user is ${verb} between the preceding (${round2(precedingAvg)}) and current (${round2(currentAvg)}) sub-periods.`,
    status: direction,
    detail: {
      preceding: round2(precedingAvg),
      current: round2(currentAvg),
    },
  };
}

/**
 * Dormant-users insight: users with a non-null `subscription_tier` whose
 * `active_days` within the range is at or below the single configured threshold
 * (`config.dormantActiveDayThreshold`), applied identically to every user
 * (Requirements 5.5, 5.6, Property 14).
 *
 * When `userMetrics` is `null` the per-user data needed for classification has
 * not resolved, so the insight is presented as `insufficient_data` without
 * affecting the aggregate-driven insights (Requirement 5.4, 11.5).
 */
function dormantUsersInsight(
  userMetrics: UserMetrics[] | null,
  config: InsightConfig,
): Insight {
  const id = "engagement-dormant-users";
  const title = "Dormant users";
  const threshold = config.dormantActiveDayThreshold;

  if (userMetrics === null) {
    return {
      id,
      category: CATEGORY,
      title,
      description:
        "Cannot identify dormant users because per-user metrics are not available.",
      status: "insufficient_data",
      unavailableReason: "per-user metrics unavailable",
      detail: { threshold },
    };
  }

  const dormant = userMetrics
    .filter(
      (user) =>
        user.subscription_tier !== null && user.active_days <= threshold,
    )
    .map((user) => user.user_id)
    .sort();

  if (dormant.length === 0) {
    return {
      id,
      category: CATEGORY,
      title,
      description: `No subscribed users were active on ${threshold} or fewer days in the range.`,
      status: "ok",
      magnitude: 0,
      detail: { threshold, dormantCount: 0 },
    };
  }

  return {
    id,
    category: CATEGORY,
    title,
    description: `${dormant.length} subscribed user${dormant.length === 1 ? " was" : "s were"} active on ${threshold} or fewer days in the range.`,
    status: "ok",
    magnitude: dormant.length,
    detail: {
      threshold,
      dormantCount: dormant.length,
      userIds: dormant.join(", "),
    },
  };
}

/**
 * Compute engagement insights for a range (Requirement 5).
 *
 * Produces:
 * - a Stickiness insight (active-day count / total-day count, in [0, 1]) reporting
 *   both counts in `detail` (Requirement 5.1, Property 12);
 * - an Intensity insight reporting `avg_messages_per_user`
 *   (`round2(total_messages / active_users)`) (Requirement 5.2, Property 13);
 * - an Intensity-trend insight classified against a relative tolerance band
 *   (Requirement 5.3), or `insufficient_data` when a sub-period value is
 *   unavailable (Requirement 5.4);
 * - a dormant-users insight classifying users with a non-null `subscription_tier`
 *   and `active_days` at or below the configured threshold (Requirements 5.5,
 *   5.6, Property 14).
 *
 * Each insight is independent: an `insufficient_data` insight never suppresses
 * the others (Requirement 5.4).
 *
 * @param input - The range's daily totals and (optional) per-user metrics.
 * @param config - Threshold configuration (uses `intensityTrendTolerance` and
 *   `dormantActiveDayThreshold`).
 * @returns The list of engagement insights.
 */
export function computeEngagementInsights(
  input: EngagementInput,
  config: InsightConfig,
): Insight[] {
  const { dailyTotals, userMetrics } = input;
  return [
    stickinessInsight(dailyTotals),
    intensityInsight(dailyTotals),
    intensityTrendInsight(dailyTotals, config),
    dormantUsersInsight(userMetrics, config),
  ];
}
