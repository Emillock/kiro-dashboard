/**
 * Credit-depletion insights (Requirements 9 & 10).
 *
 * This category spans two kinds of insight:
 *
 * - **Current-data insights (Requirement 9)** — depletion timing, early-burner
 *   detection, organisation-wide overage spend, and cap-hit-by-tier rates. These
 *   are computable today *provided* the gated dependencies below are supplied.
 * - **Future/gated insights (Requirement 10)** — remaining balance &
 *   percent-consumed, burn-rate projection, underutilizer detection, and the
 *   multi-month depletion-timing trend.
 *
 * ## Gated dependencies
 *
 * Several of these insights depend on data the backend does **not** currently
 * expose, modelled here as optional, null-by-default inputs (Requirement 11.3):
 *
 * - `allowanceByTier` — the per-tier monthly credit `Allowance`. Needed for
 *   Days_To_Depletion, early-burner, cap-hit-by-tier, remaining balance,
 *   percent-consumed, burn-rate projection, and underutilizers.
 * - `overageByUser` — per-user overage credit spend. Needed for the overage
 *   spend / organisation-wide overage total insight.
 *
 * When a required dependency is absent, the dependent insight is emitted with
 * `status: "unavailable"` and a populated `unavailableReason` naming the missing
 * dependency; **no value is fabricated** (Requirements 9.7, 10.5). When the
 * dependency is present but the per-user metrics needed to compute it are not,
 * the insight is emitted as `insufficient_data` instead. Every insight is
 * computed independently, so an unavailable insight never suppresses a sibling
 * that can be computed (Requirement 11.5).
 *
 * This module is pure TypeScript with no React imports, so it runs under the
 * existing node-based Vitest setup and is fully property-testable.
 */

import type {
  AggregateMetrics,
  DailyTotal,
  Insight,
  InsightConfig,
  RangeParam,
  UserMetrics,
} from "./types";
import { round2 } from "./math";

const CATEGORY = "creditDepletion" as const;

/** Names the missing per-tier Allowance dependency (Requirements 10.5, 11.3). */
const ALLOWANCE_REASON =
  "per-tier Allowance configuration (not currently exposed by the backend)";
/** Names the missing per-user overage dependency (Requirements 9.5, 11.3). */
const OVERAGE_REASON =
  "per-user overage credit data (overage_credits_used, not currently exposed by the backend)";
/** Names the missing per-user daily-credits dependency (Requirement 9.7). */
const PER_USER_REASON = "per-user daily credits_used data";
/** Names the missing multi-month dependency for the depletion-timing trend. */
const MULTI_MONTH_REASON =
  "at least two consecutive months of depletion data (a single range provides only one month)";

/** Input for {@link computeCreditDepletionInsights}. */
export interface CreditDepletionInput {
  /** The selected reporting range. */
  range: RangeParam;
  /** Aggregate metrics for the range (used to derive the Reset_Day); may be `null`. */
  aggregate: AggregateMetrics | null;
  /** Per-user metrics for the range; may be `null` when the fan-out has not resolved. */
  userMetrics: UserMetrics[] | null;
  /**
   * Per-subscription-tier monthly Allowance. Gated dependency: `null`/absent today
   * (Requirement 11.3) — dependent insights render as `unavailable`.
   */
  allowanceByTier?: Record<string, number> | null;
  /**
   * Per-user overage credit spend. Gated dependency: `null`/absent today
   * (Requirement 11.3) — the overage insight renders as `unavailable`.
   */
  overageByUser?: Record<string, number> | null;
}

// ── Date helpers ─────────────────────────────────────────────────────────────

/** Parse a `YYYY-MM-DD` date string to a UTC epoch (ms), or `null` if malformed. */
function parseUTC(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) {
    return null;
  }
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Format a UTC epoch (ms) back to a `YYYY-MM-DD` date string. */
function formatUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Stable ascending-by-date comparator for `DailyTotal`. */
function byDate(a: DailyTotal, b: DailyTotal): number {
  if (a.date < b.date) return -1;
  if (a.date > b.date) return 1;
  return 0;
}

/** The earliest `YYYY-MM-DD` date present across aggregate and per-user data. */
function earliestDate(input: CreditDepletionInput): string | null {
  let earliest: string | null = null;
  const consider = (d: string) => {
    if (earliest === null || d < earliest) {
      earliest = d;
    }
  };
  if (input.aggregate) {
    for (const day of input.aggregate.daily_totals) {
      consider(day.date);
    }
  }
  if (input.userMetrics) {
    for (const user of input.userMetrics) {
      for (const day of user.daily_breakdown) {
        consider(day.date);
      }
    }
  }
  return earliest;
}

/**
 * Derive the Reset_Day — the first day of the calendar month covering the range
 * (Requirement 9.1) — as a `YYYY-MM-01` string.
 *
 * Prefers `aggregate.start_date`; otherwise falls back to the earliest date seen
 * across the supplied daily series. Returns `null` when no date is available.
 *
 * (The dedicated Reset_Day unit test lives in task 13.3; this helper is the
 * derivation it exercises.)
 *
 * @param input - The credit-depletion input.
 * @returns The first-of-month reset day, or `null` when no date data exists.
 */
export function deriveResetDay(input: CreditDepletionInput): string | null {
  const base = input.aggregate?.start_date ?? earliestDate(input);
  if (!base) {
    return null;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(base);
  if (!m) {
    return null;
  }
  return `${m[1]}-${m[2]}-01`;
}

/**
 * Days_To_Depletion for one user (Requirement 9.2, Property 22).
 *
 * Accumulates `credits_used` over the user's daily breakdown in date order
 * (cumulative is non-decreasing) and returns the **1-based count of days from
 * `resetDay` up to and including** the first day on which cumulative
 * `credits_used` is greater than or equal to `allowance`. Returns `undefined`
 * when the allowance is never reached (the user is then excluded from the
 * early-burner insight, Requirement 9.4) or when `allowance` is not positive.
 *
 * @param dailyBreakdown - The user's per-day records for the month.
 * @param allowance - The user's per-tier monthly Allowance (must be > 0).
 * @param resetDay - The first-of-month Reset_Day (`YYYY-MM-01`).
 * @returns The 1-based Days_To_Depletion, or `undefined` if never depleted.
 */
export function computeDaysToDepletion(
  dailyBreakdown: DailyTotal[],
  allowance: number,
  resetDay: string,
): number | undefined {
  if (!(allowance > 0)) {
    return undefined;
  }
  const reset = parseUTC(resetDay);
  if (reset === null) {
    return undefined;
  }
  const sorted = [...dailyBreakdown].sort(byDate);
  let cumulative = 0;
  for (const day of sorted) {
    cumulative += day.credits_used;
    if (cumulative >= allowance) {
      const dayMs = parseUTC(day.date);
      if (dayMs === null) {
        return undefined;
      }
      const diffDays = Math.round((dayMs - reset) / 86_400_000);
      // 1-based, inclusive of both the reset day and the depletion day.
      return diffDays + 1;
    }
  }
  return undefined;
}

/**
 * Project a depletion date from a remaining balance and a daily burn rate
 * (Requirement 10.2, Property 26).
 *
 * Returns `fromDate` advanced by `remaining / dailyRate` days. Because the offset
 * decreases monotonically as `dailyRate` grows (for a fixed `remaining` and
 * `fromDate`), a higher burn rate yields an earlier-or-equal projected date.
 * Returns `null` (indeterminate) when the rate is not positive (Requirement 10.7)
 * or any input is non-finite.
 *
 * @param remaining - Credits remaining (Allowance − consumed).
 * @param dailyRate - Trailing-window average daily consumption (> 0).
 * @param fromDate - The anchor date (`YYYY-MM-DD`) to project forward from.
 * @returns The projected depletion date, or `null` when indeterminate.
 */
export function projectDepletionDate(
  remaining: number,
  dailyRate: number,
  fromDate: string,
): string | null {
  if (!Number.isFinite(remaining) || !Number.isFinite(dailyRate)) {
    return null;
  }
  if (!(dailyRate > 0)) {
    return null;
  }
  const from = parseUTC(fromDate);
  if (from === null) {
    return null;
  }
  const offsetDays = remaining / dailyRate;
  return formatUTC(from + offsetDays * 86_400_000);
}

/**
 * Trailing-window average daily consumption (Requirement 10.2).
 *
 * Sums `credits_used` over the most recent `windowDays` days available and
 * divides by the number of days actually present in that window (so a range
 * shorter than the window is averaged over the days it has). Returns `0` when no
 * days are present.
 */
function trailingDailyRate(
  dailyBreakdown: DailyTotal[],
  windowDays: number,
): number {
  const sorted = [...dailyBreakdown].sort(byDate);
  const window = sorted.slice(Math.max(0, sorted.length - windowDays));
  if (window.length === 0) {
    return 0;
  }
  const sum = window.reduce((acc, day) => acc + day.credits_used, 0);
  return sum / window.length;
}

/** Resolve a user's Allowance from the per-tier map, or `undefined` if unknown. */
function allowanceForUser(
  user: UserMetrics,
  allowanceByTier: Record<string, number>,
): number | undefined {
  if (user.subscription_tier == null) {
    return undefined;
  }
  const allowance = allowanceByTier[user.subscription_tier];
  return typeof allowance === "number" ? allowance : undefined;
}

// ── Insight builders ─────────────────────────────────────────────────────────

/** Build an `unavailable` insight naming the missing dependency (no value). */
function unavailable(
  id: string,
  title: string,
  reason: string,
): Insight {
  return {
    id: `${CATEGORY}-${id}`,
    category: CATEGORY,
    title,
    description: `${title} cannot be computed because it depends on ${reason}.`,
    status: "unavailable",
    unavailableReason: reason,
  };
}

/** Build an `insufficient_data` insight naming the missing data (no value). */
function insufficient(
  id: string,
  title: string,
  reason: string,
): Insight {
  return {
    id: `${CATEGORY}-${id}`,
    category: CATEGORY,
    title,
    description: `${title} cannot be computed because ${reason} is unavailable for the selected range.`,
    status: "insufficient_data",
    unavailableReason: reason,
  };
}

// ── Main computer ────────────────────────────────────────────────────────────

/** Per-user depletion snapshot used across the allowance-gated insights. */
interface UserDepletion {
  user: UserMetrics;
  allowance: number;
  consumed: number;
  /** 1-based Days_To_Depletion, or `undefined` when never depleted. */
  daysToDepletion: number | undefined;
}

/**
 * Compute credit-depletion insights for the selected range (Requirements 9 & 10).
 *
 * Always returns a list whose entries are computed independently: insights whose
 * gated dependency (`allowanceByTier` / `overageByUser`) is absent are emitted as
 * `unavailable` with a populated `unavailableReason`; insights whose dependency is
 * present but whose per-user metrics are missing are emitted as `insufficient_data`;
 * the remainder carry computed values. No value is ever fabricated for an
 * unavailable or insufficient insight (Requirements 9.7, 10.5).
 *
 * @param input - Range, aggregate, per-user metrics, and the gated dependencies.
 * @param config - Threshold configuration (early-burner, underutilizer, burn-rate).
 * @returns The list of credit-depletion insights.
 */
export function computeCreditDepletionInsights(
  input: CreditDepletionInput,
  config: InsightConfig,
): Insight[] {
  const insights: Insight[] = [];

  const allowanceByTier = input.allowanceByTier ?? null;
  const overageByUser = input.overageByUser ?? null;
  const users = input.userMetrics ?? null;
  const resetDay = deriveResetDay(input);

  // ── Reset_Day (Requirement 9.1) ───────────────────────────────────────────
  if (resetDay) {
    insights.push({
      id: `${CATEGORY}-reset-day`,
      category: CATEGORY,
      title: "Credit reset day",
      description: `Credit allowances reset on ${resetDay}, the first day of the calendar month covering the selected ${input.range}.`,
      status: "ok",
      detail: { resetDay, range: input.range },
    });
  } else {
    insights.push(
      insufficient("reset-day", "Credit reset day", "calendar date data"),
    );
  }

  // ── Per-user depletion snapshots (shared by allowance-gated insights) ─────
  // Built only when both the Allowance dependency and per-user metrics exist.
  let depletions: UserDepletion[] | null = null;
  if (allowanceByTier !== null && users !== null && resetDay !== null) {
    depletions = [];
    for (const user of users) {
      const allowance = allowanceForUser(user, allowanceByTier);
      if (allowance === undefined) {
        continue;
      }
      depletions.push({
        user,
        allowance,
        consumed: user.credits_used,
        daysToDepletion: computeDaysToDepletion(
          user.daily_breakdown,
          allowance,
          resetDay,
        ),
      });
    }
  }

  // ── Early-burner (Requirements 9.2, 9.3, 9.4, Property 22) ────────────────
  if (allowanceByTier === null) {
    insights.push(unavailable("early-burner", "Early burners", ALLOWANCE_REASON));
  } else if (users === null || resetDay === null) {
    insights.push(insufficient("early-burner", "Early burners", PER_USER_REASON));
  } else {
    const threshold = config.earlyBurnerThresholdDays;
    const burners = (depletions ?? [])
      .filter(
        (d) => d.daysToDepletion !== undefined && d.daysToDepletion <= threshold,
      )
      .sort((a, b) => {
        const byDays =
          (a.daysToDepletion as number) - (b.daysToDepletion as number);
        if (byDays !== 0) return byDays;
        return a.user.user_id < b.user.user_id ? -1 : 1;
      });
    insights.push({
      id: `${CATEGORY}-early-burner`,
      category: CATEGORY,
      title: "Early burners",
      description:
        burners.length > 0
          ? `${burners.length} ${burners.length === 1 ? "user" : "users"} depleted their allowance within the first ${threshold} days: ${burners
              .map((d) => `${d.user.label} (day ${d.daysToDepletion})`)
              .join(", ")}.`
          : `No users depleted their allowance within the first ${threshold} days.`,
      status: "ok",
      magnitude: burners.length,
      detail: {
        count: burners.length,
        thresholdDays: threshold,
        userIds: burners.map((d) => d.user.user_id).join(","),
      },
    });
  }

  // ── Overage spend + org-wide total (Requirement 9.5, Property 23) ─────────
  if (overageByUser === null) {
    insights.push(unavailable("overage", "Overage spend", OVERAGE_REASON));
  } else {
    const entries = Object.entries(overageByUser);
    const orgTotal = entries.reduce((sum, [, value]) => sum + value, 0);
    const withOverage = entries.filter(([, value]) => value > 0);
    insights.push({
      id: `${CATEGORY}-overage`,
      category: CATEGORY,
      title: "Overage spend",
      description: `Organisation-wide overage spend is ${round2(orgTotal)} credits across ${withOverage.length} ${
        withOverage.length === 1 ? "user" : "users"
      }.`,
      status: "ok",
      magnitude: round2(orgTotal),
      detail: {
        orgTotal: round2(orgTotal),
        usersWithOverage: withOverage.length,
      },
    });
  }

  // ── Cap-hit-by-tier (Requirement 9.6, Property 24) ────────────────────────
  if (allowanceByTier === null) {
    insights.push(
      unavailable("cap-hit-by-tier", "Cap-hit rate by tier", ALLOWANCE_REASON),
    );
  } else if (users === null || resetDay === null) {
    insights.push(
      insufficient("cap-hit-by-tier", "Cap-hit rate by tier", PER_USER_REASON),
    );
  } else {
    // Group the per-user depletion snapshots by tier.
    const byTier = new Map<string, { hit: number; total: number }>();
    for (const d of depletions ?? []) {
      const tier = d.user.subscription_tier as string; // non-null: had an allowance
      const bucket = byTier.get(tier) ?? { hit: 0, total: 0 };
      bucket.total += 1;
      if (d.daysToDepletion !== undefined) {
        bucket.hit += 1;
      }
      byTier.set(tier, bucket);
    }

    if (byTier.size === 0) {
      insights.push(
        insufficient(
          "cap-hit-by-tier",
          "Cap-hit rate by tier",
          "per-tier user data",
        ),
      );
    } else {
      const tiers = [...byTier.entries()].sort((a, b) =>
        a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
      );
      const detail: Record<string, number | string> = {};
      const parts: string[] = [];
      for (const [tier, { hit, total }] of tiers) {
        const rate = total > 0 ? hit / total : 0; // bounded in [0, 1]
        detail[`tier_${tier}`] = round2(rate);
        parts.push(`${tier}: ${round2(rate * 100)}% (${hit}/${total})`);
      }
      insights.push({
        id: `${CATEGORY}-cap-hit-by-tier`,
        category: CATEGORY,
        title: "Cap-hit rate by tier",
        description: `Share of users who reached their allowance, by tier — ${parts.join("; ")}.`,
        status: "ok",
        detail,
      });
    }
  }

  // ── Remaining balance + percent-consumed (Requirement 10.1, 10.6, Property 25) ──
  if (allowanceByTier === null) {
    insights.push(
      unavailable("remaining-balance", "Remaining balance", ALLOWANCE_REASON),
    );
  } else if (users === null) {
    insights.push(
      insufficient("remaining-balance", "Remaining balance", PER_USER_REASON),
    );
  } else {
    // Exclude users whose Allowance is zero or negative (Requirement 10.6).
    const eligible = (depletions ?? []).filter((d) => d.allowance > 0);
    if (eligible.length === 0) {
      insights.push(
        insufficient(
          "remaining-balance",
          "Remaining balance",
          "users with a positive allowance",
        ),
      );
    } else {
      const totalRemaining = eligible.reduce(
        (sum, d) => sum + (d.allowance - d.consumed),
        0,
      );
      const avgPercentConsumed =
        eligible.reduce(
          (sum, d) => sum + Math.max(0, (d.consumed / d.allowance) * 100),
          0,
        ) / eligible.length;
      insights.push({
        id: `${CATEGORY}-remaining-balance`,
        category: CATEGORY,
        title: "Remaining balance",
        description: `Across ${eligible.length} ${
          eligible.length === 1 ? "user" : "users"
        } with an allowance, ${round2(totalRemaining)} credits remain; the average allowance consumed is ${round2(avgPercentConsumed)}%.`,
        status: "ok",
        magnitude: round2(totalRemaining),
        detail: {
          users: eligible.length,
          totalRemaining: round2(totalRemaining),
          avgPercentConsumed: round2(avgPercentConsumed),
        },
      });
    }
  }

  // ── Burn-rate projection (Requirement 10.2, 10.7, Property 26) ────────────
  if (allowanceByTier === null) {
    insights.push(
      unavailable("burn-rate-projection", "Burn-rate projection", ALLOWANCE_REASON),
    );
  } else if (users === null) {
    insights.push(
      insufficient("burn-rate-projection", "Burn-rate projection", PER_USER_REASON),
    );
  } else {
    // Not-yet-depleted users with a positive allowance (Requirements 10.6, 10.2).
    const candidates = (depletions ?? []).filter(
      (d) => d.allowance > 0 && d.daysToDepletion === undefined,
    );
    let projected = 0;
    let indeterminate = 0;
    let earliestDateSeen: string | null = null;
    for (const d of candidates) {
      const rate = trailingDailyRate(
        d.user.daily_breakdown,
        config.burnRateTrailingDays,
      );
      const remaining = d.allowance - d.consumed;
      const projectedDate =
        rate > 0 ? projectDepletionDate(remaining, rate, resetDay ?? d.user.daily_breakdown[0]?.date ?? "") : null;
      if (projectedDate === null) {
        // Zero trailing consumption -> indeterminate, no projected date (10.7).
        indeterminate += 1;
      } else {
        projected += 1;
        if (earliestDateSeen === null || projectedDate < earliestDateSeen) {
          earliestDateSeen = projectedDate;
        }
      }
    }
    insights.push({
      id: `${CATEGORY}-burn-rate-projection`,
      category: CATEGORY,
      title: "Burn-rate projection",
      description: `${projected} of ${candidates.length} not-yet-depleted ${
        candidates.length === 1 ? "user has" : "users have"
      } a projected depletion date${
        earliestDateSeen ? ` (earliest ${earliestDateSeen})` : ""
      }; ${indeterminate} ${indeterminate === 1 ? "is" : "are"} indeterminate with no recent consumption.`,
      status: "ok",
      magnitude: projected,
      detail: {
        candidates: candidates.length,
        projected,
        indeterminate,
        trailingDays: config.burnRateTrailingDays,
        earliestProjected: earliestDateSeen ?? "",
      },
    });
  }

  // ── Underutilizers (Requirement 10.3, Property 27) ────────────────────────
  if (allowanceByTier === null) {
    insights.push(
      unavailable("underutilizers", "Underutilizers", ALLOWANCE_REASON),
    );
  } else if (users === null) {
    insights.push(
      insufficient("underutilizers", "Underutilizers", PER_USER_REASON),
    );
  } else {
    const pct = config.underutilizerPct;
    const underutilizers = (depletions ?? [])
      .filter((d) => d.allowance > 0 && d.consumed < (d.allowance * pct) / 100)
      .sort((a, b) =>
        a.user.user_id < b.user.user_id ? -1 : a.user.user_id > b.user.user_id ? 1 : 0,
      );
    insights.push({
      id: `${CATEGORY}-underutilizers`,
      category: CATEGORY,
      title: "Underutilizers",
      description:
        underutilizers.length > 0
          ? `${underutilizers.length} ${
              underutilizers.length === 1 ? "user" : "users"
            } consumed under ${pct}% of their allowance and may be downgrade or reallocation candidates: ${underutilizers
              .map((d) => d.user.label)
              .join(", ")}.`
          : `No users consumed under ${pct}% of their allowance.`,
      status: "ok",
      magnitude: underutilizers.length,
      detail: {
        count: underutilizers.length,
        thresholdPct: pct,
        userIds: underutilizers.map((d) => d.user.user_id).join(","),
      },
    });
  }

  // ── Depletion-timing trend (Requirement 10.4, Property 28) ────────────────
  // A single range provides only one calendar month, so the >= 2 consecutive
  // months precondition is never met from this input; always unavailable.
  insights.push(
    unavailable(
      "depletion-timing-trend",
      "Depletion-timing trend",
      MULTI_MONTH_REASON,
    ),
  );

  return insights;
}
