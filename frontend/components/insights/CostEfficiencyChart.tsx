/**
 * CostEfficiencyChart — a horizontal Recharts BarChart showing the top high-cost
 * users ranked by Credit_Efficiency (credits per message) in descending order.
 *
 * Requirements:
 * - 16.1: BarChart with layout="vertical", one bar per user.
 * - 16.2: YAxis type="category" with user identifier as label.
 * - 16.3: XAxis type="number" with domain={[0, "dataMax"]}.
 * - 16.4: Bar fill uses colors.accent from @/styles/theme.
 * - 16.5: Falls back to a plain-text list when fewer than 2 high-cost users.
 * - 16.6: XAxis has a visible label "Credits per Message".
 * - 16.7: Each Bar cell has aria-label in format "[userId]: [creditEfficiency] credits per message".
 */

"use client";

import type { CSSProperties } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { colors } from "@/styles/theme";

export interface CostEfficiencyChartProps {
  /** High-cost users sorted by descending Credit_Efficiency (engine caps at 10). */
  highCostUsers: Array<{ userId: string; creditEfficiency: number }>;
}

const containerStyle: CSSProperties = {
  width: "100%",
};

const fallbackListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const fallbackItemStyle: CSSProperties = {
  fontSize: 13,
  color: colors.textSecondary,
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
};

const fallbackUserStyle: CSSProperties = {
  color: colors.textPrimary,
  fontWeight: 600,
};

const fallbackValueStyle: CSSProperties = {
  color: colors.accentLight,
  fontFamily: "monospace",
};

/**
 * Renders a horizontal bar chart of high-cost users when ≥2 users are provided,
 * or falls back to a plain-text list when fewer than 2 users are available
 * (Requirement 16.5).
 */
export function CostEfficiencyChart({ highCostUsers }: CostEfficiencyChartProps) {
  // Requirement 16.5: fall back to plain-text list when fewer than 2 high-cost users.
  if (highCostUsers.length < 2) {
    return <PlainTextFallback highCostUsers={highCostUsers} />;
  }

  return <Chart highCostUsers={highCostUsers} />;
}

/**
 * Custom tooltip for the BarChart showing userId and creditEfficiency.
 */
function BarTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { userId: string; creditEfficiency: number } }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const { userId, creditEfficiency } = payload[0].payload;
  return (
    <div style={{
      backgroundColor: colors.bgPanel,
      border: `1px solid ${colors.border}`,
      borderRadius: 4,
      padding: "6px 10px",
      fontSize: 12,
      color: colors.textPrimary,
    }}>
      <div style={{ fontWeight: 600 }}>{userId}</div>
      <div style={{ color: colors.textSecondary }}>{creditEfficiency} credits/msg</div>
    </div>
  );
}

/**
 * The Recharts BarChart rendering — used when ≥2 high-cost users are present.
 */
function Chart({
  highCostUsers,
}: {
  highCostUsers: Array<{ userId: string; creditEfficiency: number }>;
}) {
  // Recharts expects an array of objects as data.
  const chartData = highCostUsers.map(({ userId, creditEfficiency }) => ({
    userId,
    creditEfficiency,
  }));

  // Estimate chart height: 36px per bar plus margins.
  const chartHeight = Math.max(120, highCostUsers.length * 36 + 60);

  return (
    <div style={containerStyle} data-testid="cost-efficiency-chart">
      {/*
       * Visually-hidden accessible list — provides testable aria-labels and
       * improves screen-reader accessibility for the bar data (Requirement 16.7).
       * The visual chart is aria-hidden to avoid duplication.
       */}
      <ul
        data-testid="cost-efficiency-bar-list"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
          margin: 0,
          padding: 0,
          listStyle: "none",
        }}
        aria-label="High-cost users by credits per message"
      >
        {chartData.map(({ userId, creditEfficiency }) => (
          <li
            key={userId}
            aria-label={`${userId}: ${creditEfficiency} credits per message`}
          >
            {userId}: {creditEfficiency} credits per message
          </li>
        ))}
      </ul>
      <div aria-hidden="true" style={{ outline: "none" }} tabIndex={-1}>
        <ResponsiveContainer width={480} height={chartHeight}>
          {/*
           * layout="vertical" makes the bars grow horizontally,
           * with user identifiers on the Y-axis (Requirement 16.1).
           */}
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 24, bottom: 32, left: 8 }}
          >
            {/*
             * XAxis type="number" with domain from 0 to data max (Requirement 16.3).
             * The label "Credits per Message" is rendered below the axis (Requirement 16.6).
             */}
            <XAxis
              type="number"
              domain={[0, "dataMax"]}
              tick={{ fill: colors.textSecondary, fontSize: 11 }}
              axisLine={{ stroke: colors.border }}
              tickLine={{ stroke: colors.border }}
              label={{
                value: "Credits per Message",
                position: "insideBottom",
                offset: -20,
                fill: colors.textSecondary,
                fontSize: 11,
              }}
            />
            {/*
             * YAxis type="category" uses userId as the category label (Requirement 16.2).
             * width is set to accommodate typical user identifier lengths.
             */}
            <YAxis
              type="category"
              dataKey="userId"
              width={160}
              tick={{ fill: colors.textSecondary, fontSize: 11 }}
              axisLine={{ stroke: colors.border }}
              tickLine={false}
            />
            {/*
             * Bar fill uses colors.accent, a colors.* token from @/styles/theme
             * (Requirement 16.4).
             * Each Cell gets its own aria-label in the required format (Requirement 16.7).
             */}
            <Bar dataKey="creditEfficiency" fill={colors.accent} radius={[0, 3, 3, 0]}>
              {chartData.map(({ userId, creditEfficiency }) => (
                <Cell
                  key={userId}
                  fill={colors.accent}
                  aria-label={`${userId}: ${creditEfficiency} credits per message`}
                />
              ))}
            </Bar>
            <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Plain-text fallback rendered when fewer than 2 high-cost users are available
 * (Requirement 16.5).
 */
function PlainTextFallback({
  highCostUsers,
}: {
  highCostUsers: Array<{ userId: string; creditEfficiency: number }>;
}) {
  if (highCostUsers.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
        No high-cost users for the selected range.
      </p>
    );
  }

  // Exactly one user: render a simple text description.
  return (
    <ul style={fallbackListStyle} aria-label="High-cost users">
      {highCostUsers.map(({ userId, creditEfficiency }) => (
        <li key={userId} style={fallbackItemStyle}>
          <span style={fallbackUserStyle}>{userId}</span>
          <span style={fallbackValueStyle}>
            {creditEfficiency} credits/msg
          </span>
        </li>
      ))}
    </ul>
  );
}
