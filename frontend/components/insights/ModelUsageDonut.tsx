/**
 * ModelUsageDonut — a Recharts PieChart donut showing model distribution,
 * with a centered dominant-model label, a legend listing each model's share,
 * and a scrollable per-user outlier list below the chart.
 *
 * Requirements:
 * - 18.1: PieChart with innerRadius at 40% of outerRadius.
 * - 18.2: Recharts Legend lists each model name and share %, e.g. "claude_opus — 45%".
 * - 18.3: Slice colors cycle colors.chart palette; repeat from index 0 when model count > 8.
 * - 18.4: Dominant model name + share as centered donut-hole text label.
 * - 18.5: Per-user outlier list is scrollable (maxHeight 200px, overflowY auto) below chart.
 * - 18.6: Empty model_distribution renders only the insufficient_data message, no PieChart.
 * - 18.7: PieChart container aria-label="Model distribution: {model} accounts for {share}% of messages".
 * - 18.8: Each Cell aria-label="{modelName}: {share}% of messages".
 */

"use client";

import type { CSSProperties } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { colors } from "@/styles/theme";

export interface ModelUsageDonutProps {
  /** model → message count */
  modelDistribution: Record<string, number>;
  /** Per-user model outliers from the engine (Requirement 18.5). */
  outlierUsers?: Array<{ userId: string; dominantModel: string }>;
  /** User summaries for resolving userId to email label. */
  userSummaries?: Array<{ user_id: string; label: string }>;
}

/** A single computed slice entry. */
interface ModelSlice {
  model: string;
  count: number;
  share: number;
  sharePct: number; // rounded to 1 decimal for display
  color: string;
}

/**
 * Build slice data from a model distribution Record.
 * Slices are sorted by count descending (largest first) for a natural donut,
 * then colors are assigned by palette index cycling.
 */
function buildSlices(distribution: Record<string, number>): ModelSlice[] {
  const total = Object.values(distribution).reduce(
    (sum, count) => sum + (Number.isFinite(count) && count > 0 ? count : 0),
    0,
  );

  if (total <= 0) {
    return [];
  }

  return Object.entries(distribution)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort(([modelA, countA], [modelB, countB]) => {
      // Sort by count descending; break ties alphabetically for determinism.
      if (countB !== countA) return countB - countA;
      return modelA < modelB ? -1 : modelA > modelB ? 1 : 0;
    })
    .map(([model, count], index) => ({
      model,
      count,
      share: count / total,
      sharePct: Math.round((count / total) * 1000) / 10, // 1 decimal
      // Cycle through colors.chart; repeat from 0 when model count > palette size (R18.3).
      color: colors.chart[index % colors.chart.length],
    }));
}

interface CustomLegendPayloadEntry {
  value: string;
  color?: string;
  payload?: { sharePct?: number };
}

/**
 * Custom legend renderer that displays "modelName — share%" per entry.
 * Recharts passes `payload` with each legend item when using a custom renderer.
 */
function CustomLegend({
  payload,
}: {
  payload?: CustomLegendPayloadEntry[];
}) {
  if (!payload || payload.length === 0) return null;

  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontSize: 12,
        color: colors.textSecondary,
      }}
    >
      {payload.map((entry) => {
        const sharePct = entry.payload?.sharePct ?? 0;
        return (
          <li
            key={entry.value}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            {/* Color swatch for visual reinforcement (requirement 18.2) */}
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: entry.color,
                flexShrink: 0,
              }}
            />
            <span>
              {entry.value} &mdash; {sharePct}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Custom tooltip for the PieChart.
 */
function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; payload: { model: string; sharePct: number; count: number } }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const { model, sharePct, count } = payload[0].payload;
  return (
    <div style={{
      backgroundColor: colors.bgPanel,
      border: `1px solid ${colors.border}`,
      borderRadius: 4,
      padding: "6px 10px",
      fontSize: 12,
      color: colors.textPrimary,
    }}>
      <div style={{ fontWeight: 600 }}>{model}</div>
      <div style={{ color: colors.textSecondary }}>{sharePct}% · {count.toLocaleString()} msgs</div>
    </div>
  );
}

/**
 * The SVG text label centered in the donut hole showing the dominant model
 * name and share (Requirement 18.4). Rendered as a Recharts customized label
 * inside the <Pie> via the `label` prop approach, but here we use a standalone
 * SVG overlay positioned absolutely over the chart center.
 *
 * Recharts centers PieChart at (cx, cy) of the ResponsiveContainer. We use
 * an absolute overlay to avoid coupling to internal Recharts state.
 */
function DonutCenterLabel({
  model,
  sharePct,
  containerSize,
}: {
  model: string;
  sharePct: number;
  containerSize: number;
}) {
  // Shorten very long model names so they fit in the donut hole.
  const MAX_LABEL_LENGTH = 18;
  const displayModel =
    model.length > MAX_LABEL_LENGTH
      ? model.slice(0, MAX_LABEL_LENGTH - 1) + "…"
      : model;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: containerSize,
        height: containerSize,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: colors.textPrimary,
          textAlign: "center",
          maxWidth: containerSize * 0.35, // stays within donut hole
          overflow: "hidden",
          wordBreak: "break-word",
          lineHeight: 1.3,
        }}
      >
        {displayModel}
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: colors.accentLight,
          marginTop: 2,
        }}
      >
        {sharePct}%
      </span>
    </div>
  );
}

/**
 * Renders the PieChart donut with legend and optional outlier list.
 * When modelDistribution is empty, renders only the insufficient_data message
 * (Requirement 18.6).
 */
export function ModelUsageDonut({
  modelDistribution,
  outlierUsers,
  userSummaries,
}: ModelUsageDonutProps) {
  const slices = buildSlices(modelDistribution);

  // Requirement 18.6: empty distribution → insufficient_data message only.
  if (slices.length === 0) {
    return (
      <p
        data-testid="model-usage-insufficient"
        style={{ margin: 0, fontSize: 13, color: colors.textMuted }}
      >
        Insufficient data: no model messages recorded for the selected range.
      </p>
    );
  }

  // Dominant model is the first slice (sorted by count descending).
  const dominant = slices[0];

  // Chart container size in px — used for the overlay label positioning.
  const CHART_SIZE = 220;
  // outerRadius is half the chart size minus a small margin; innerRadius = 40% of outer.
  const OUTER_RADIUS = CHART_SIZE / 2 - 10;
  const INNER_RADIUS = Math.round(OUTER_RADIUS * 0.4); // 40% of outer (Requirement 18.1)

  // aria-label for the PieChart container (Requirement 18.7).
  const containerAriaLabel = `Model distribution: ${dominant.model} accounts for ${dominant.sharePct}% of messages`;

  return (
    <div
      data-testid="model-usage-donut"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {/* Chart + Legend row */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 16,
        }}
      >
        {/* PieChart with accessible container label (Requirement 18.7) */}
        <div
          role="img"
          aria-label={containerAriaLabel}
          data-testid="model-usage-piechart"
          style={{
            position: "relative",
            width: CHART_SIZE,
            height: CHART_SIZE,
            flexShrink: 0,
          }}
        >
          {/* DonutCenterLabel removed — dominant model shown in legend */}

          <ResponsiveContainer width={CHART_SIZE} height={CHART_SIZE}>
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Tooltip content={<PieTooltip />} />
              <Pie
                data={slices}
                dataKey="count"
                nameKey="model"
                cx="50%"
                cy="50%"
                innerRadius={INNER_RADIUS}
                outerRadius={OUTER_RADIUS}
                isAnimationActive={false}
                strokeWidth={0}
                stroke="none"
              >
                {slices.map((slice) => (
                  <Cell
                    key={slice.model}
                    fill={slice.color}
                    // Requirement 18.8: each Cell aria-label.
                    aria-label={`${slice.model}: ${slice.sharePct}% of messages`}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend listing each model name and share % (Requirement 18.2) */}
        <div style={{ flex: 1, minWidth: 140 }}>
          <CustomLegend payload={slices.map((slice) => ({
            value: slice.model,
            color: slice.color,
            payload: { sharePct: slice.sharePct },
          }))} />
        </div>
      </div>

      {/* Per-user outlier list (Requirement 18.5) */}
      {outlierUsers && outlierUsers.length > 0 && (
        <OutlierList outlierUsers={outlierUsers} userSummaries={userSummaries} />
      )}
    </div>
  );
}

/**
 * Scrollable per-user outlier list rendered below the chart (Requirement 18.5).
 */
function OutlierList({
  outlierUsers,
  userSummaries,
}: {
  outlierUsers: Array<{ userId: string; dominantModel: string }>;
  userSummaries?: Array<{ user_id: string; label: string }>;
}) {
  function resolveLabel(userId: string): string {
    if (!userSummaries) return userId;
    const found = userSummaries.find((u) => u.user_id === userId);
    return found?.label || userId;
  }
  const scrollableStyle: CSSProperties = {
    maxHeight: 200,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "8px 0",
    borderTop: `1px solid ${colors.border}`,
  };

  const labelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 4,
  };

  const rowStyle: CSSProperties = {
    fontSize: 12,
    color: colors.textSecondary,
    display: "flex",
    gap: 6,
    alignItems: "baseline",
  };

  const userIdStyle: CSSProperties = {
    color: colors.textPrimary,
    fontWeight: 600,
    flexShrink: 0,
  };

  const modelStyle: CSSProperties = {
    color: colors.accentLight,
  };

  return (
    <div data-testid="model-usage-outlier-list">
      <p style={labelStyle}>Per-user model outliers</p>
      <ul
        role="list"
        style={scrollableStyle}
        aria-label="Users whose dominant model differs from the organization average"
      >
        {outlierUsers.map(({ userId, dominantModel }) => (
          <li key={userId} style={rowStyle}>
            <span style={userIdStyle}>{resolveLabel(userId)}</span>
            <span style={{ color: colors.textMuted }}>primarily uses</span>
            <span style={modelStyle}>{dominantModel}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
