/**
 * TrendSparklines — compact Recharts LineChart sparklines rendered inline
 * alongside the period-over-period trend text insights (Requirement 17).
 *
 * Rendering rules:
 * - One sparkline per metric: `total_messages`, `active_users`, `credits_used`
 *   (Requirement 17.1).
 * - Data plotted chronologically; Y-axis domain `[0, maxValue]` for the metric
 *   within the range (Requirement 17.2).
 * - Fixed CSS height 40–60px, minimum width 80px, rendered inline alongside text
 *   (Requirement 17.3).
 * - Uses `recharts`; no axes, no grid lines, no tooltip — clean sparkline only
 *   (Requirement 17.4).
 * - Stroke color matches the metric's accent color token used by the trend-
 *   direction badge in the Trends card (Requirement 17.5).
 * - If fewer than 2 `daily_totals`, sparklines are omitted entirely — no empty
 *   or broken chart elements render (Requirement 17.6).
 * - Each sparkline container carries `aria-hidden="true"` so screen readers
 *   consume only the adjacent text insight (Requirement 17.7).
 */

"use client";

import type { CSSProperties } from "react";
import { LineChart, Line, YAxis } from "recharts";
import type { DailyTotal, RangeParam } from "@/lib/insights/types";
import { colors } from "@/styles/theme";

export interface TrendSparklinesProps {
  /** Chronological daily data for the selected range. */
  dailyTotals: DailyTotal[];
  range: RangeParam;
}

/**
 * The three metrics to render as sparklines (Requirement 17.1).
 * Stroke color matches the accent color token used by the trend-direction badge
 * in the Trends card (Requirement 17.5):
 * - total_messages  → chart[0] (violet primary accent — same as "accent")
 * - active_users    → colors.success (green — used for the "Up" / increase badge)
 * - credits_used    → colors.warning (amber — used for cost/anomaly context)
 */
const METRICS: Array<{
  key: keyof Pick<DailyTotal, "total_messages" | "active_users" | "credits_used">;
  label: string;
  strokeColor: string;
}> = [
  { key: "total_messages", label: "Messages", strokeColor: colors.chart[0] },
  { key: "active_users",   label: "Active users", strokeColor: colors.success },
  { key: "credits_used",   label: "Credits used", strokeColor: colors.warning },
];

/** Container for the whole sparklines row. */
const rowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  gap: 16,
  flexWrap: "wrap",
};

/** Wrapper for a single sparkline + label pair. */
const sparklineWrapperStyle: CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  minWidth: 80, // Requirement 17.3
};

/** Label beneath a single sparkline. */
const labelStyle: CSSProperties = {
  fontSize: 10,
  color: colors.textMuted,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
};

/**
 * Renders compact sparklines for the three core metrics.
 *
 * Returns `null` (nothing) when fewer than 2 daily totals are available so no
 * empty or broken chart elements are rendered (Requirement 17.6).
 */
export function TrendSparklines({ dailyTotals }: TrendSparklinesProps) {
  // Requirement 17.6 — omit all sparklines when fewer than 2 data points.
  if (!dailyTotals || dailyTotals.length < 2) {
    return null;
  }

  return (
    <div style={rowStyle} data-testid="trend-sparklines">
      {METRICS.map(({ key, label, strokeColor }) => {
        // Build chronological data array (already chronological per contract).
        const data = dailyTotals.map((d) => ({ value: d[key] }));
        const maxValue = Math.max(...data.map((d) => d.value), 0);

        return (
          // aria-hidden="true" — screen readers consume the adjacent text insight
          // instead (Requirement 17.7).
          <div
            key={key}
            aria-hidden="true"
            data-testid={`sparkline-${key}`}
            style={sparklineWrapperStyle}
          >
            <LineChart
              width={80}
              height={48}
              data={data}
              margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
            >
              {/*
               * Y-axis with domain [0, maxValue] (Requirement 17.2).
               * Hidden — no visible axis rendered (Requirement 17.4).
               */}
              <YAxis
                domain={[0, maxValue > 0 ? maxValue : 1]}
                hide={true}
              />
              {/*
               * No CartesianGrid, no Tooltip — clean sparkline only (Requirement 17.4).
               */}
              <Line
                type="monotone"
                dataKey="value"
                stroke={strokeColor}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
            <span style={labelStyle}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
