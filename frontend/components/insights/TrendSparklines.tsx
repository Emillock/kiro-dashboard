/**
 * TrendSparklines — responsive Recharts LineChart sparklines filling the card
 * width, rendered inside the Trends card (Requirement 17).
 *
 * Rendering rules:
 * - One sparkline per metric: `total_messages`, `active_users`, `credits_used`
 *   (Requirement 17.1).
 * - Data plotted chronologically; Y-axis domain `[0, maxValue]` (Requirement 17.2).
 * - Uses ResponsiveContainer to fill available card width.
 * - Stroke color matches the metric's accent color token (Requirement 17.5).
 * - If fewer than 2 `daily_totals`, sparklines are omitted entirely (Requirement 17.6).
 * - Each sparkline container carries `aria-hidden="true"` (Requirement 17.7).
 */

"use client";

import type { CSSProperties } from "react";
import { LineChart, Line, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import type { DailyTotal, RangeParam } from "@/lib/insights/types";
import { colors } from "@/styles/theme";

export interface TrendSparklinesProps {
  dailyTotals: DailyTotal[];
  range: RangeParam;
}

const METRICS: Array<{
  key: keyof Pick<DailyTotal, "total_messages" | "active_users" | "credits_used">;
  label: string;
  strokeColor: string;
}> = [
  { key: "total_messages", label: "Messages", strokeColor: colors.chart[0] },
  { key: "active_users",   label: "Active users", strokeColor: colors.success },
  { key: "credits_used",   label: "Credits used", strokeColor: colors.warning },
];

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
};

const wrapperStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 0,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: colors.textMuted,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
};

function CustomTooltip({ active, payload, label: _label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{
      backgroundColor: colors.bgPanel,
      border: `1px solid ${colors.border}`,
      borderRadius: 4,
      padding: "4px 8px",
      fontSize: 11,
      color: colors.textPrimary,
    }}>
      {payload[0].value.toLocaleString()}
    </div>
  );
}

export function TrendSparklines({ dailyTotals }: TrendSparklinesProps) {
  if (!dailyTotals || dailyTotals.length < 2) {
    return null;
  }

  return (
    <div style={gridStyle} data-testid="trend-sparklines">
      {METRICS.map(({ key, label, strokeColor }) => {
        const data = dailyTotals.map((d) => ({ value: d[key] }));
        const maxValue = Math.max(...data.map((d) => d.value), 0);

        return (
          <div
            key={key}
            aria-hidden="true"
            data-testid={`sparkline-${key}`}
            style={wrapperStyle}
          >
            <span style={labelStyle}>{label}</span>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                <YAxis domain={[0, maxValue > 0 ? maxValue : 1]} hide={true} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: colors.border }} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={strokeColor}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4, stroke: strokeColor, strokeWidth: 2, fill: colors.bgCard }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}
