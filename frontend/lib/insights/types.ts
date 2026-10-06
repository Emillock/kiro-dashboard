/**
 * Type definitions for the Insights feature.
 *
 * These types describe the output of the pure, deterministic `Insight_Engine`
 * (see `lib/insights/index.ts`) and the configuration that drives it. The engine
 * consumes only the existing backend response shapes re-exported here from
 * `lib/api.ts` and never depends on any field absent from those response types
 * (Requirement 11.1).
 */

import type {
  AggregateMetrics,
  DailyTotal,
  UserMetrics,
  UserSummary,
  TopAdopter,
  RangeParam,
} from "../api";

// Re-export the existing API types so insight modules import them from a single
// place without re-declaring any backend shape.
export type {
  AggregateMetrics,
  DailyTotal,
  UserMetrics,
  UserSummary,
  TopAdopter,
  RangeParam,
};

// ── Insight output types ─────────────────────────────────────────────────────

/** The seven insight categories rendered as distinct cards (Requirement 2.5). */
export type InsightCategory =
  | "trends"
  | "adoption"
  | "engagement"
  | "modelUsage"
  | "costEfficiency"
  | "anomalies"
  | "creditDepletion";

/**
 * Status of a single insight. Directional statuses (`increase`/`decrease`/
 * `unchanged`/`anomaly`) are conveyed via text/aria, never color alone
 * (Requirement 13.8). `insufficient_data` and `unavailable` indicate, respectively,
 * that the value cannot be computed from available data (Requirements 12.3, 12.5)
 * or depends on a missing backend data dependency (Requirements 10.5, 11.4).
 */
export type InsightStatus =
  | "ok"
  | "increase"
  | "decrease"
  | "unchanged"
  | "anomaly"
  | "insufficient_data"
  | "unavailable";

/** A single, human-readable observation derived from metrics. */
export interface Insight {
  /** Stable, deterministic key for this insight. */
  id: string;
  category: InsightCategory;
  /** Short label. */
  title: string;
  /** Plain-language sentence. */
  description: string;
  status: InsightStatus;
  /** Optional percentage/count; omitted when status is not an "ok"-like value. */
  magnitude?: number;
  /**
   * For `unavailable`/`insufficient_data` insights, names the missing dependency
   * or reason (Requirements 10.5, 11.4).
   */
  unavailableReason?: string;
  /** Supporting numbers (e.g. activeDays, totalDays). */
  detail?: Record<string, number | string>;
}

/**
 * The result for a whole category: either a list of insights or a category-level
 * insufficiency (Requirements 4.6, 6.6).
 */
export type CategoryResult =
  | { kind: "insights"; insights: Insight[] }
  | { kind: "insufficient"; reason: string };

/** Map of every category to its computed result. */
export type CategorizedInsights = Record<InsightCategory, CategoryResult>;

// ── Engine input ─────────────────────────────────────────────────────────────

/**
 * Input to `computeInsights`. Aggregate, summary, and per-user metrics come from
 * the existing query hooks. `allowanceByTier` and `overageByUser` model data the
 * backend does not currently expose (Requirement 11.3); they are `null` today and
 * cause dependent insights to render as `unavailable`.
 */
export interface InsightEngineInput {
  range: RangeParam;
  aggregate: AggregateMetrics | null;
  userSummaries: UserSummary[] | null;
  userMetrics: UserMetrics[] | null;
  allowanceByTier?: Record<string, number> | null;
  overageByUser?: Record<string, number> | null;
}

// ── Configuration model ──────────────────────────────────────────────────────

/**
 * Centralizes every threshold so insights are adjustable without code changes
 * (Requirement 11.6). Default values are provided by `DEFAULT_INSIGHT_CONFIG`
 * in `config.ts`.
 */
export interface InsightConfig {
  /** Trend classification dead-band, in percentage points (R3.10). */
  trendUnchangedBandPct: number;

  /** Engagement intensity trend tolerance, relative fraction 0..1 (R5.3). */
  intensityTrendTolerance: number;

  /** Dormant user max active-day count, integer >= 0 (R5.6). */
  dormantActiveDayThreshold: number;

  /** Model mix-shift significance, share fraction (R6.3, R6.4). */
  modelMixShiftThreshold: number;
  /** Per-user model outlier minimum messages (R6.5). */
  modelOutlierMinMessages: number;
  modelOutlierMaxUsers: number;

  /** Cost efficiency trend tolerance, relative fraction (R7.2). */
  efficiencyTrendTolerance: number;
  highCostUserLimit: number;

  /** Anomaly thresholds as percentages 0..1000 (R8.3). */
  activityDropThresholdPct: number;
  costSpikeThresholdPct: number;

  /** Credit depletion early-burner threshold in days (R9.3). */
  earlyBurnerThresholdDays: number;
  /** Underutilizer percentage of allowance (R10.3). */
  underutilizerPct: number;
  /** Burn-rate projection trailing window in days (R10.2). */
  burnRateTrailingDays: number;

  /** Adoption rank-mover cap (R4.1). */
  rankMoverLimit: number;
}

// ── Derived intermediate models ──────────────────────────────────────────────

/**
 * The result of splitting a range's days into two contiguous halves. The middle
 * day of an odd-length range belongs to `current` (Requirement 3.1).
 */
export interface SubPeriods<T> {
  /** Earlier half. */
  preceding: T[];
  /** Later half; receives the middle day when the day count is odd. */
  current: T[];
}

/** Aggregation of a sub-period's `DailyTotal[]` into scalar totals (R3, R7, R8). */
export interface SubPeriodAggregate {
  totalMessages: number;
  /** Representative active users for the sub-period. */
  activeUsersPeak: number;
  creditsUsed: number;
  days: number;
}

/** Per-user adoption snapshot used for rank delta (R4). */
export interface UserAdoptionInput {
  userId: string;
  /**
   * Human-readable display name (typically the user's email). Optional; when
   * absent, callers fall back to `userId`. Used only for the human-readable
   * insight text — the canonical identity in `detail` remains `userId`.
   */
  label?: string;
  precedingScoreOrActivity: number;
  currentScoreOrActivity: number;
  adoptionScore: number;
}
