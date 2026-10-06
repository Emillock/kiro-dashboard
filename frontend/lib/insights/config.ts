/**
 * Default configuration for the Insights feature.
 *
 * A single config object centralizes every threshold so insights are adjustable
 * without code changes (Requirement 11.6). The values below are the finalized
 * defaults stated in the requirements; each field is annotated with the
 * requirement clause it satisfies.
 */

import type { InsightConfig } from "./types";

/**
 * The finalized default thresholds and limits used by the `Insight_Engine` when
 * no override is supplied.
 */
export const DEFAULT_INSIGHT_CONFIG: InsightConfig = {
  // Trend classification dead-band, in percentage points (R3.10).
  trendUnchangedBandPct: 0.01,

  // Engagement intensity trend tolerance, relative fraction 0..1 (R5.3).
  intensityTrendTolerance: 0.05,

  // Dormant user max active-day count, integer >= 0 (R5.6).
  dormantActiveDayThreshold: 1,

  // Model mix-shift significance, share fraction (R6.3, R6.5).
  modelMixShiftThreshold: 0.05,
  // Per-user model outlier minimum messages and cap (R6.5).
  modelOutlierMinMessages: 5,
  modelOutlierMaxUsers: 50,

  // Cost efficiency trend tolerance, relative fraction (R7.2).
  efficiencyTrendTolerance: 0.05,
  // High-cost user ranking cap (R7.3).
  highCostUserLimit: 10,

  // Anomaly thresholds as percentages 0..1000 (R8.3).
  activityDropThresholdPct: 30,
  costSpikeThresholdPct: 50,

  // Credit depletion early-burner threshold in days (R9.3).
  earlyBurnerThresholdDays: 7,
  // Underutilizer percentage of allowance (R10.3).
  underutilizerPct: 25,
  // Burn-rate projection trailing window in days (R10.2).
  burnRateTrailingDays: 30,

  // Adoption rank-mover cap (R11.6 / R4.1).
  rankMoverLimit: 10,
};
