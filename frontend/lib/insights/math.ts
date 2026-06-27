/**
 * Numeric helpers for the Insights feature.
 *
 * These are pure, deterministic functions with no React imports, so they run
 * under the existing node-based Vitest setup and are fully property-testable.
 *
 * Divide-by-baseline helpers (`percentageChange`, `growthRate`) return a `null`
 * sentinel — never `NaN` or `Infinity` — so callers can emit an
 * `insufficient_data` insight rather than fabricating or displaying a
 * non-finite value (Requirements 3.3, 3.9, 7.5, 7.6, 12.1, 12.5).
 */

/** Direction of a classified trend (Requirements 3.10, 5.3, 7.2). */
export type TrendDirection = "increase" | "decrease" | "unchanged";

/**
 * Relative change between `current` and `baseline`, expressed as a percentage:
 * `(current - baseline) / baseline * 100`.
 *
 * Sign correctness (Requirement 3.2): the result is positive when
 * `current > baseline`, negative when `current < baseline`, and exactly `0`
 * when `current === baseline`. The formula is accurate within an absolute
 * tolerance of 0.0001 percentage points (Design Property 2).
 *
 * Returns `null` (never `NaN`/`Infinity`) when the baseline is `0`
 * (Requirement 3.9) or when either input is non-finite, so callers can render
 * `insufficient_data` instead of dividing by zero.
 */
export function percentageChange(
  current: number,
  baseline: number,
): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) {
    return null;
  }
  if (baseline === 0) {
    return null;
  }
  return ((current - baseline) / baseline) * 100;
}

/**
 * Relative growth between `baseline` and `current`, expressed as a fraction:
 * `(current - baseline) / baseline`.
 *
 * Unlike {@link percentageChange}, this returns a raw fraction (not multiplied
 * by 100) and is intended for comparing two growth rates against each other
 * (for example, credits-used growth vs. message growth in the burn-vs-output
 * warning, Requirement 7.4).
 *
 * Returns `null` (never `NaN`/`Infinity`) when the baseline is zero or negative
 * (Requirement 7.6), or when either input is non-finite, so callers can render
 * `insufficient_data` rather than computing a meaningless growth rate.
 */
export function growthRate(
  current: number,
  baseline: number,
): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) {
    return null;
  }
  if (baseline <= 0) {
    return null;
  }
  return (current - baseline) / baseline;
}

/**
 * Classifies the difference between `current` and `preceding` against an
 * inclusive tolerance `band` (Design Property 4):
 *
 * - `"increase"`  when `current - preceding > band`
 * - `"decrease"`  when `current - preceding < -band`
 * - `"unchanged"` when `|current - preceding| <= band` (the inclusive band)
 *
 * The comparison is always made on the *absolute* difference
 * `current - preceding` versus `band`. The function is interpretation-agnostic;
 * callers choose how to express `band` so the same primitive serves both kinds
 * of classification the requirements call for:
 *
 * - **Percentage-point band (trends, Requirement 3.10):** the caller passes the
 *   already-computed Percentage_Change as `current`, `0` as `preceding`, and the
 *   percentage-point dead-band (default `0.01`) as `band`. The difference is then
 *   simply the Percentage_Change compared against `±0.01` percentage points.
 * - **Relative-tolerance band (intensity/efficiency, Requirements 5.3, 7.2):**
 *   the caller passes the two sub-period values and a `band` computed as
 *   `tolerance * Math.abs(preceding)` (default tolerance `0.05`), turning the
 *   absolute comparison into a relative one.
 *
 * `band` is treated as a non-negative magnitude (its absolute value is used), so
 * a negative band cannot invert the classification. Non-finite inputs are
 * classified as `"unchanged"` rather than producing `NaN`-driven behavior,
 * keeping the function pure and deterministic.
 */
export function classifyTrend(
  current: number,
  preceding: number,
  band: number,
): TrendDirection {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(preceding) ||
    !Number.isFinite(band)
  ) {
    return "unchanged";
  }
  const tolerance = Math.abs(band);
  const difference = current - preceding;
  if (difference > tolerance) {
    return "increase";
  }
  if (difference < -tolerance) {
    return "decrease";
  }
  return "unchanged";
}

/**
 * Rounds `n` to two decimal places deterministically.
 *
 * Used for `avg_messages_per_user` and `Credit_Efficiency` (Requirements 5.2,
 * 7.1) so the same rounding is applied in both the engine and its tests. Returns
 * `0` for non-finite input to avoid propagating `NaN`/`Infinity`; callers guard
 * divide-by-zero upstream via {@link percentageChange}/{@link growthRate}.
 */
export function round2(n: number): number {
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
