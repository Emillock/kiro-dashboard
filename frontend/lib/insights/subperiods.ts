/**
 * Sub-period splitting and aggregation primitives.
 *
 * The metrics API exposes only a single `range` ("week" or "month") at a time and
 * does not expose a prior period. Period-over-period comparisons are therefore
 * derived by splitting the returned range's days into two contiguous halves — a
 * `preceding` (earlier) half and a `current` (later) half (Requirement 3.1).
 *
 * `splitRange` is the single source of truth for that split, so the equal-length
 * rule and the odd-middle-day rule are implemented and tested in exactly one place
 * and every category computer reuses it.
 *
 * These are pure functions with no React imports, so they run under the existing
 * node-based Vitest setup.
 */

import type { DailyTotal, SubPeriods, SubPeriodAggregate } from "./types";

/**
 * Split a list of days into two contiguous halves.
 *
 * For a list of length `n`, `preceding` receives the first `floor(n / 2)` elements
 * and `current` receives the remaining `ceil(n / 2)` elements. When `n` is odd the
 * single middle day therefore falls into `current` (Requirement 3.1).
 *
 * The split preserves order: concatenating `preceding` then `current` reproduces
 * the original list exactly (Property 1).
 *
 * @typeParam T - The element type (e.g. `DailyTotal`).
 * @param days - The ordered list of days for the selected range.
 * @returns The `preceding` and `current` halves.
 */
export function splitRange<T>(days: T[]): SubPeriods<T> {
  const mid = Math.floor(days.length / 2);
  return {
    preceding: days.slice(0, mid),
    current: days.slice(mid),
  };
}

/**
 * Aggregate a sub-period's `DailyTotal[]` into scalar totals.
 *
 * `total_messages` and `credits_used` are summed across the days. `activeUsersPeak`
 * is a single representative active-users value for the sub-period, taken as the
 * maximum `active_users` across the days (0 for an empty sub-period). `days` is the
 * element count.
 *
 * @param days - The days belonging to a single sub-period.
 * @returns The aggregated scalar totals for the sub-period.
 */
export function aggregateSubPeriod(days: DailyTotal[]): SubPeriodAggregate {
  let totalMessages = 0;
  let creditsUsed = 0;
  let activeUsersPeak = 0;

  for (const day of days) {
    totalMessages += day.total_messages;
    creditsUsed += day.credits_used;
    if (day.active_users > activeUsersPeak) {
      activeUsersPeak = day.active_users;
    }
  }

  return {
    totalMessages,
    activeUsersPeak,
    creditsUsed,
    days: days.length,
  };
}

/** A range's two sub-periods aggregated into scalar totals. */
export interface SubPeriodAggregates {
  preceding: SubPeriodAggregate;
  current: SubPeriodAggregate;
}

/**
 * Convenience helper: split a range's daily totals and aggregate each half.
 *
 * Combines {@link splitRange} and {@link aggregateSubPeriod} so callers that only
 * need the scalar sub-period totals can obtain them in one step.
 *
 * @param dailyTotals - The ordered daily totals for the selected range.
 * @returns The aggregated `preceding` and `current` sub-period totals.
 */
export function splitAndAggregate(
  dailyTotals: DailyTotal[]
): SubPeriodAggregates {
  const { preceding, current } = splitRange(dailyTotals);
  return {
    preceding: aggregateSubPeriod(preceding),
    current: aggregateSubPeriod(current),
  };
}
