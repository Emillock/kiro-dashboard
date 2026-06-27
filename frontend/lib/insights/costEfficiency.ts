/**
 * Cost and efficiency insights (Requirement 7).
 *
 * Derives the organization's Credit_Efficiency (credits consumed per message),
 * its period-over-period trend, the ranked list of high-cost users, and a
 * burn-vs-output warning that fires when spend is growing faster than output.
 *
 * Org-level efficiency, the efficiency trend, and the burn-vs-output warning are
 * computed from the aggregate daily totals via the shared sub-period primitives
 * (`splitAndAggregate`). The high-cost user ranking needs per-user totals, which
 * are only available from the fanned-out `UserMetrics` (it carries `total_messages`
 * and `credits_used` per user); when those are absent the high-cost insights are
 * simply omitted so the aggregate-driven insights still render.
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
import { splitAndAggregate, aggregateSubPeriod } from "./subperiods";
import { classifyTrend, growthRate, round2 } from "./math";

const CATEGORY = "costEfficiency" as const;

/**
 * Input for {@link computeCostEfficiencyInsights}.
 *
 * `dailyTotals` drives the org-level efficiency, its trend, and the
 * burn-vs-output warning. `userMetrics` (the per-user fan-out) drives the
 * high-cost user ranking; it is `null` until the fan-out resolves.
 */
export interface CostEfficiencyInput {
  /** Ordered daily totals for the selected range. */
  dailyTotals: DailyTotal[];
  /** Per-user metrics (fanned-out), or `null` when unavailable. */
  userMetrics: UserMetrics[] | null;
}

/**
 * Credit_Efficiency for a single (creditsUsed, totalMessages) pair, rounded to
 * two decimal places (Requirement 7.1, Property 13).
 *
 * Returns `null` when `totalMessages` is not strictly positive so callers can
 * emit `insufficient_data` rather than divide by zero (Requirements 7.5, 7.6).
 * For non-negative `creditsUsed` and positive `totalMessages` the result is
 * always `>= 0` (efficiency non-negativity).
 */
function creditEfficiency(
  creditsUsed: number,
  totalMessages: number,
): number | null {
  if (!Number.isFinite(creditsUsed) || !Number.isFinite(totalMessages)) {
    return null;
  }
  if (totalMessages <= 0) {
    return null;
  }
  return round2(creditsUsed / totalMessages);
}

/**
 * Compute cost and efficiency insights for a range (Requirement 7).
 *
 * Produces:
 * - **Credit_Efficiency** (Requirement 7.1, Property 13): the org-level
 *   `round2(credits_used / total_messages)` over the whole range, or
 *   `insufficient_data` when `total_messages` is zero (Requirement 7.5).
 * - **Efficiency trend** (Requirement 7.2): `increase`/`decrease`/`unchanged`
 *   classified against the relative `efficiencyTrendTolerance` band (default
 *   5%, inclusive) by comparing the current vs. preceding sub-period efficiency;
 *   `insufficient_data` when either sub-period has zero messages.
 * - **High-cost users** (Requirement 7.3, Property 18): users with
 *   `total_messages > 0` ranked by descending Credit_Efficiency (ties broken by
 *   ascending user id), capped at `config.highCostUserLimit` (default 10).
 *   Omitted when no per-user metrics are available.
 * - **Burn-vs-output warning** (Requirement 7.4, Property 19): present when the
 *   preceding sub-period has positive `credits_used` and `total_messages` and the
 *   credits-used growth rate exceeds the total-messages growth rate;
 *   `insufficient_data` when a preceding baseline is zero or negative
 *   (Requirement 7.6).
 *
 * @param input - Aggregate daily totals plus optional per-user metrics.
 * @param config - Threshold configuration (uses `efficiencyTrendTolerance`,
 *   `highCostUserLimit`).
 * @returns The list of cost and efficiency insights.
 */
export function computeCostEfficiencyInsights(
  input: CostEfficiencyInput,
  config: InsightConfig,
): Insight[] {
  const { dailyTotals, userMetrics } = input;
  const insights: Insight[] = [];

  // ── Org-level Credit_Efficiency (Requirements 7.1, 7.5) ───────────────────
  const overall = aggregateSubPeriod(dailyTotals);
  const overallEfficiency = creditEfficiency(
    overall.creditsUsed,
    overall.totalMessages,
  );

  if (overallEfficiency === null) {
    insights.push({
      id: "costEfficiency-efficiency",
      category: CATEGORY,
      title: "Credit efficiency",
      description:
        "Cannot compute credit efficiency because there were no messages in the selected range.",
      status: "insufficient_data",
      unavailableReason: "zero total messages",
      detail: {
        creditsUsed: overall.creditsUsed,
        totalMessages: overall.totalMessages,
      },
    });
  } else {
    insights.push({
      id: "costEfficiency-efficiency",
      category: CATEGORY,
      title: "Credit efficiency",
      description: `The team spent ${overallEfficiency} credits per message across ${overall.totalMessages} messages.`,
      status: "ok",
      magnitude: overallEfficiency,
      detail: {
        creditsUsed: overall.creditsUsed,
        totalMessages: overall.totalMessages,
        creditEfficiency: overallEfficiency,
      },
    });
  }

  // ── Efficiency trend across sub-periods (Requirement 7.2) ─────────────────
  const { preceding, current } = splitAndAggregate(dailyTotals);
  const precedingEfficiency = creditEfficiency(
    preceding.creditsUsed,
    preceding.totalMessages,
  );
  const currentEfficiency = creditEfficiency(
    current.creditsUsed,
    current.totalMessages,
  );

  if (precedingEfficiency === null || currentEfficiency === null) {
    insights.push({
      id: "costEfficiency-efficiency-trend",
      category: CATEGORY,
      title: "Credit efficiency trend",
      description:
        "Cannot compare credit efficiency across sub-periods because at least one sub-period had no messages.",
      status: "insufficient_data",
      unavailableReason: "zero messages in a sub-period",
      detail: {
        precedingCredits: preceding.creditsUsed,
        precedingMessages: preceding.totalMessages,
        currentCredits: current.creditsUsed,
        currentMessages: current.totalMessages,
      },
    });
  } else {
    // Relative-tolerance band (Requirement 7.2): a change is "stable" while the
    // current value stays within `tolerance` of the preceding value. Expressing
    // the band as `tolerance * |preceding|` turns classifyTrend's absolute
    // comparison into the required relative comparison.
    const band = config.efficiencyTrendTolerance * Math.abs(precedingEfficiency);
    const direction = classifyTrend(currentEfficiency, precedingEfficiency, band);
    const verb =
      direction === "increase"
        ? "rose"
        : direction === "decrease"
          ? "fell"
          : "held roughly steady";
    insights.push({
      id: "costEfficiency-efficiency-trend",
      category: CATEGORY,
      title: "Credit efficiency trend",
      description: `Credit efficiency ${verb} from ${precedingEfficiency} to ${currentEfficiency} credits per message between the preceding and current sub-periods.`,
      status: direction,
      magnitude: currentEfficiency,
      detail: {
        precedingEfficiency,
        currentEfficiency,
      },
    });
  }

  // ── High-cost users (Requirement 7.3, Property 18) ────────────────────────
  // Needs per-user totals from the fan-out; when absent, omit these insights so
  // the aggregate-driven insights above still render.
  if (userMetrics !== null) {
    const ranked = userMetrics
      .map((u) => ({
        userId: u.user_id,
        label: u.label,
        totalMessages: u.total_messages,
        creditsUsed: u.credits_used,
        efficiency: creditEfficiency(u.credits_used, u.total_messages),
      }))
      // Only users with total_messages > 0 qualify (efficiency is non-null).
      .filter(
        (u): u is typeof u & { efficiency: number } => u.efficiency !== null,
      )
      .sort((a, b) => {
        const byEfficiency = b.efficiency - a.efficiency; // descending
        if (byEfficiency !== 0) {
          return byEfficiency;
        }
        // Deterministic tie-break: ascending userId.
        if (a.userId < b.userId) return -1;
        if (a.userId > b.userId) return 1;
        return 0;
      })
      .slice(0, config.highCostUserLimit);

    ranked.forEach((u, index) => {
      insights.push({
        id: `costEfficiency-high-cost-${u.userId}`,
        category: CATEGORY,
        title: "High-cost user",
        description: `${u.label} spent ${u.efficiency} credits per message (${u.creditsUsed} credits over ${u.totalMessages} messages).`,
        status: "ok",
        magnitude: u.efficiency,
        detail: {
          rank: index + 1,
          userId: u.userId,
          creditsUsed: u.creditsUsed,
          totalMessages: u.totalMessages,
          creditEfficiency: u.efficiency,
        },
      });
    });
  }

  // ── Burn-vs-output warning (Requirements 7.4, 7.6, Property 19) ────────────
  // growthRate returns null when the preceding baseline is zero or negative,
  // which is exactly the Requirement 7.6 insufficiency condition.
  const creditsGrowth = growthRate(current.creditsUsed, preceding.creditsUsed);
  const messagesGrowth = growthRate(current.totalMessages, preceding.totalMessages);

  if (creditsGrowth === null || messagesGrowth === null) {
    insights.push({
      id: "costEfficiency-burn-vs-output",
      category: CATEGORY,
      title: "Burn vs output",
      description:
        "Cannot evaluate spend growth against output growth because the preceding sub-period had no credits or no messages.",
      status: "insufficient_data",
      unavailableReason: "zero or negative preceding baseline",
      detail: {
        precedingCredits: preceding.creditsUsed,
        precedingMessages: preceding.totalMessages,
        currentCredits: current.creditsUsed,
        currentMessages: current.totalMessages,
      },
    });
  } else if (creditsGrowth > messagesGrowth) {
    insights.push({
      id: "costEfficiency-burn-vs-output",
      category: CATEGORY,
      title: "Burn vs output",
      description: `Credit spend is growing faster than output: credits used grew ${round2(
        creditsGrowth * 100,
      )}% while messages grew ${round2(messagesGrowth * 100)}% between sub-periods.`,
      status: "anomaly",
      magnitude: round2((creditsGrowth - messagesGrowth) * 100),
      detail: {
        creditsGrowthPct: round2(creditsGrowth * 100),
        messagesGrowthPct: round2(messagesGrowth * 100),
      },
    });
  } else {
    insights.push({
      id: "costEfficiency-burn-vs-output",
      category: CATEGORY,
      title: "Burn vs output",
      description: `Credit spend is keeping pace with output: credits used grew ${round2(
        creditsGrowth * 100,
      )}% versus ${round2(messagesGrowth * 100)}% for messages between sub-periods.`,
      status: "ok",
      magnitude: round2((creditsGrowth - messagesGrowth) * 100),
      detail: {
        creditsGrowthPct: round2(creditsGrowth * 100),
        messagesGrowthPct: round2(messagesGrowth * 100),
      },
    });
  }

  return insights;
}
