/**
 * Unit tests for lib/insights/config.ts (Task 1.3).
 *
 * Asserts every DEFAULT_INSIGHT_CONFIG value matches the requirement default.
 * _Requirements: 8.3, 11.6_
 */
import { DEFAULT_INSIGHT_CONFIG } from "../../lib/insights/config";
import type { InsightConfig } from "../../lib/insights/types";

// The complete set of finalized defaults stated in the requirements/design.
// Each entry is annotated with the requirement clause it satisfies.
const EXPECTED_DEFAULTS: InsightConfig = {
  trendUnchangedBandPct: 0.01, // R3.10 trend dead-band (percentage points)
  intensityTrendTolerance: 0.05, // R5.3 engagement intensity tolerance (fraction)
  dormantActiveDayThreshold: 1, // R5.6 dormant-user active-day threshold
  modelMixShiftThreshold: 0.05, // R6.3/R6.4 model mix-shift significance (share)
  modelOutlierMinMessages: 5, // R6.5 per-user model outlier minimum messages
  modelOutlierMaxUsers: 50, // R6.5 per-user model outlier cap
  efficiencyTrendTolerance: 0.05, // R7.2 cost efficiency trend tolerance (fraction)
  highCostUserLimit: 10, // R7.3 high-cost user ranking cap
  activityDropThresholdPct: 30, // R8.3 activity-drop threshold (percent)
  costSpikeThresholdPct: 50, // R8.3 cost-spike threshold (percent)
  earlyBurnerThresholdDays: 7, // R9.3 early-burner threshold (days)
  underutilizerPct: 25, // R10.3 underutilizer percentage of allowance
  burnRateTrailingDays: 30, // R10.2 burn-rate projection trailing window (days)
  rankMoverLimit: 10, // R4.1 adoption rank-mover cap
};

describe("DEFAULT_INSIGHT_CONFIG", () => {
  // Per-field assertions so a mismatch points directly at the offending key.
  test.each(Object.entries(EXPECTED_DEFAULTS))(
    "%s defaults to the requirement value",
    (key, expected) => {
      expect(DEFAULT_INSIGHT_CONFIG[key as keyof InsightConfig]).toBe(expected);
    }
  );

  test("trend classification dead-band default is 0.01 percentage points (R3.10)", () => {
    expect(DEFAULT_INSIGHT_CONFIG.trendUnchangedBandPct).toBe(0.01);
  });

  test("intensity trend tolerance default is 0.05 (R5.3)", () => {
    expect(DEFAULT_INSIGHT_CONFIG.intensityTrendTolerance).toBe(0.05);
  });

  test("dormant active-day threshold default is 1 (R5.6)", () => {
    expect(DEFAULT_INSIGHT_CONFIG.dormantActiveDayThreshold).toBe(1);
  });

  test("model mix-shift threshold default is 0.05 (R6.3)", () => {
    expect(DEFAULT_INSIGHT_CONFIG.modelMixShiftThreshold).toBe(0.05);
  });

  test("model outlier min messages default is 5 and cap is 50 (R6.5)", () => {
    expect(DEFAULT_INSIGHT_CONFIG.modelOutlierMinMessages).toBe(5);
    expect(DEFAULT_INSIGHT_CONFIG.modelOutlierMaxUsers).toBe(50);
  });

  test("efficiency trend tolerance default is 0.05 (R7.2)", () => {
    expect(DEFAULT_INSIGHT_CONFIG.efficiencyTrendTolerance).toBe(0.05);
  });

  test("high-cost user limit default is 10 (R7.3)", () => {
    expect(DEFAULT_INSIGHT_CONFIG.highCostUserLimit).toBe(10);
  });

  test("anomaly thresholds default to 30% drop and 50% spike (R8.3)", () => {
    expect(DEFAULT_INSIGHT_CONFIG.activityDropThresholdPct).toBe(30);
    expect(DEFAULT_INSIGHT_CONFIG.costSpikeThresholdPct).toBe(50);
  });

  test("early-burner threshold default is 7 days (R9.3)", () => {
    expect(DEFAULT_INSIGHT_CONFIG.earlyBurnerThresholdDays).toBe(7);
  });

  test("underutilizer percentage default is 25 (R10.3)", () => {
    expect(DEFAULT_INSIGHT_CONFIG.underutilizerPct).toBe(25);
  });

  test("burn-rate trailing window default is 30 days (R10.2)", () => {
    expect(DEFAULT_INSIGHT_CONFIG.burnRateTrailingDays).toBe(30);
  });

  test("rank-mover limit default is 10 (R4.1)", () => {
    expect(DEFAULT_INSIGHT_CONFIG.rankMoverLimit).toBe(10);
  });

  test("contains exactly the expected configuration keys", () => {
    expect(Object.keys(DEFAULT_INSIGHT_CONFIG).sort()).toEqual(
      Object.keys(EXPECTED_DEFAULTS).sort()
    );
  });
});
