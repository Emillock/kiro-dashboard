/**
 * Trend insights (Requirement 3).
 *
 * Computes period-over-period change, momentum streaks, and peak/trough days
 * from a range's daily totals. All comparisons split the range into a
 * `preceding` (earlier) and `current` (later) sub-period via `splitRange`, with
 * the middle day of an odd-length range assigned to `current` (Requirement 3.1).
 *
 * This module is pure TypeScript with no React imports, so it runs under the
 * existing node-based Vitest setup and is fully property-testable.
 */

import type { DailyTotal, Insight, InsightConfig } from "./types";
import { splitAndAggregate } from "./subperiods";
import { percentageChange, classifyTrend, round2 } from "./math";

const CATEGORY = "trends" as const;

/** A metric carried through the period-over-period comparison. */
interface PovMetric {
  /** Stable id suffix and detail key. */
  key: string;
  /** Human-readable metric name used in titles/descriptions. */
  label: string;
  /** Current sub-period aggregate value. */
  current: number;
  /** Preceding sub-period aggregate value (the comparison baseline). */
  baseline: number;
}

/**
 * The trailing day-over-day streak of a numeric series.
 *
 * `direction` is `"rising"` when the final runs of differences are strictly
 * positive, `"falling"` when strictly negative, and `"none"` otherwise.
 * `length` is the count of trailing days satisfying that strict direction
 * (Requirements 3.5, 3.6). Because the final day-over-day difference cannot be
 * both positive and negative, at most one of the rising/falling counts is
 * non-zero.
 */
function trailingStreak(values: number[]): {
  direction: "rising" | "falling" | "none";
  length: number;
} {
  if (values.length < 2) {
    return { direction: "none", length: 0 };
  }

  let rising = 0;
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i] > values[i - 1]) {
      rising++;
    } else {
      break;
    }
  }

  let falling = 0;
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i] < values[i - 1]) {
      falling++;
    } else {
      break;
    }
  }

  if (rising > 0) {
    return { direction: "rising", length: rising };
  }
  if (falling > 0) {
    return { direction: "falling", length: falling };
  }
  return { direction: "none", length: 0 };
}

/**
 * The `DailyTotal` with the maximum `total_messages`, breaking ties by the
 * earliest date (Requirement 3.7). `days` must be non-empty.
 */
function findPeakDay(days: DailyTotal[]): DailyTotal {
  let best = days[0];
  for (const day of days) {
    if (
      day.total_messages > best.total_messages ||
      (day.total_messages === best.total_messages && day.date < best.date)
    ) {
      best = day;
    }
  }
  return best;
}

/**
 * The `DailyTotal` with the minimum `total_messages`, breaking ties by the
 * earliest date (Requirement 3.8). `days` must be non-empty.
 */
function findTroughDay(days: DailyTotal[]): DailyTotal {
  let best = days[0];
  for (const day of days) {
    if (
      day.total_messages < best.total_messages ||
      (day.total_messages === best.total_messages && day.date < best.date)
    ) {
      best = day;
    }
  }
  return best;
}

/**
 * Build a period-over-period trend insight for one metric.
 *
 * Returns an `insufficient_data` insight (carrying no `magnitude`) when the
 * baseline is zero — `percentageChange` returns `null` — so no division by zero
 * or fabricated magnitude occurs (Requirements 3.9, 12.1, 12.5). Otherwise the
 * insight is classified as `increase`/`decrease`/`unchanged` against the
 * configured percentage-point dead-band (Requirement 3.10).
 */
function periodOverPeriodInsight(metric: PovMetric, config: InsightConfig): Insight {
  const id = `trends-pov-${metric.key}`;
  const title = `${metric.label} period over period`;

  const pct = percentageChange(metric.current, metric.baseline);
  if (pct === null) {
    return {
      id,
      category: CATEGORY,
      title,
      description: `Cannot compare ${metric.label} across sub-periods because the preceding sub-period baseline is zero.`,
      status: "insufficient_data",
      unavailableReason: "zero baseline in the preceding sub-period",
      detail: {
        metric: metric.key,
        current: metric.current,
        baseline: metric.baseline,
      },
    };
  }

  const direction = classifyTrend(pct, 0, config.trendUnchangedBandPct);
  const magnitude = round2(pct);
  const verb =
    direction === "increase"
      ? "rose"
      : direction === "decrease"
        ? "fell"
        : "was essentially unchanged";
  const description =
    direction === "unchanged"
      ? `${metric.label} ${verb} (${magnitude}%) between the preceding and current sub-periods.`
      : `${metric.label} ${verb} ${Math.abs(magnitude)}% between the preceding and current sub-periods.`;

  return {
    id,
    category: CATEGORY,
    title,
    description,
    status: direction,
    magnitude,
    detail: {
      metric: metric.key,
      current: metric.current,
      baseline: metric.baseline,
    },
  };
}

/**
 * Compute trend insights for a range's daily totals (Requirement 3).
 *
 * Produces:
 * - period-over-period `Percentage_Change` insights for `total_messages`,
 *   `active_users`, and `credits_used` (Requirements 3.2, 3.4), classified
 *   against the trend dead-band (Requirement 3.10); presented as
 *   `insufficient_data` when fewer than two daily totals are available
 *   (Requirement 3.3) or when the baseline is zero (Requirement 3.9);
 * - a `Momentum_Streak` insight for `total_messages` when the final run of
 *   strictly rising or strictly falling days is at least 2 (Requirements 3.5,
 *   3.6);
 * - peak-day and trough-day insights with earliest-date tie-breaking
 *   (Requirements 3.7, 3.8).
 *
 * @param dailyTotals - Ordered daily totals for the selected range.
 * @param config - Threshold configuration (uses `trendUnchangedBandPct`).
 * @returns The list of trend insights.
 */
export function computeTrendInsights(
  dailyTotals: DailyTotal[],
  config: InsightConfig,
): Insight[] {
  const insights: Insight[] = [];
  const hasTwo = dailyTotals.length >= 2;

  // ── Period-over-period change (Requirements 3.2, 3.4, 3.9, 3.10) ──────────
  const { preceding, current } = splitAndAggregate(dailyTotals);
  const povMetrics: PovMetric[] = [
    {
      key: "total_messages",
      label: "Total messages",
      current: current.totalMessages,
      baseline: preceding.totalMessages,
    },
    {
      key: "active_users",
      label: "Active users",
      current: current.activeUsersPeak,
      baseline: preceding.activeUsersPeak,
    },
    {
      key: "credits_used",
      label: "Credits used",
      current: current.creditsUsed,
      baseline: preceding.creditsUsed,
    },
  ];

  for (const metric of povMetrics) {
    if (!hasTwo) {
      // Fewer than two daily totals: cannot form two comparable sub-periods
      // (Requirement 3.3).
      insights.push({
        id: `trends-pov-${metric.key}`,
        category: CATEGORY,
        title: `${metric.label} period over period`,
        description: `Not enough daily data to compare ${metric.label} across sub-periods; at least two days are required.`,
        status: "insufficient_data",
        unavailableReason: "fewer than two daily totals",
        detail: { metric: metric.key },
      });
      continue;
    }
    insights.push(periodOverPeriodInsight(metric, config));
  }

  // ── Momentum streak for total_messages (Requirements 3.5, 3.6) ────────────
  const messageSeries = dailyTotals.map((d) => d.total_messages);
  const streak = trailingStreak(messageSeries);
  if (streak.direction !== "none" && streak.length >= 2) {
    const rising = streak.direction === "rising";
    insights.push({
      id: "trends-momentum-total_messages",
      category: CATEGORY,
      title: rising ? "Rising momentum" : "Falling momentum",
      description: `Total messages ${rising ? "rose" : "fell"} for the last ${streak.length} consecutive days of the range.`,
      status: rising ? "increase" : "decrease",
      magnitude: streak.length,
      detail: {
        metric: "total_messages",
        direction: streak.direction,
        days: streak.length,
      },
    });
  }

  // ── Peak / trough days (Requirements 3.7, 3.8) ────────────────────────────
  if (dailyTotals.length >= 1) {
    const peak = findPeakDay(dailyTotals);
    insights.push({
      id: "trends-peak-day",
      category: CATEGORY,
      title: "Peak day",
      description: `The highest message volume was ${peak.total_messages} on ${peak.date}.`,
      status: "ok",
      magnitude: peak.total_messages,
      detail: { date: peak.date, total_messages: peak.total_messages },
    });

    const trough = findTroughDay(dailyTotals);
    insights.push({
      id: "trends-trough-day",
      category: CATEGORY,
      title: "Trough day",
      description: `The lowest message volume was ${trough.total_messages} on ${trough.date}.`,
      status: "ok",
      magnitude: trough.total_messages,
      detail: { date: trough.date, total_messages: trough.total_messages },
    });
  } else {
    insights.push({
      id: "trends-peak-day",
      category: CATEGORY,
      title: "Peak day",
      description: "No daily data is available to determine the peak day.",
      status: "insufficient_data",
      unavailableReason: "no daily totals",
    });
    insights.push({
      id: "trends-trough-day",
      category: CATEGORY,
      title: "Trough day",
      description: "No daily data is available to determine the trough day.",
      status: "insufficient_data",
      unavailableReason: "no daily totals",
    });
  }

  return insights;
}
