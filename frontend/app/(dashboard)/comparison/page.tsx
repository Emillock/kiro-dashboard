"use client";

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { useComparison } from "@/lib/queries";
import { colors } from "@/styles/theme";
import { AdoptionScoreInfo } from "@/components/common/AdoptionScoreInfo";
import { RangeToggle } from "@/components/common/RangeToggle";
import type { MetricKey, SelectionMode, RangeParam } from "@/lib/api";

const METRIC_OPTIONS: { value: MetricKey; label: string }[] = [
  { value: "adoption_score",      label: "AI Adoption Score" },
  { value: "total_messages",      label: "Total Messages" },
  { value: "chat_conversations",  label: "Chat Conversations" },
  { value: "credits_used",        label: "Credits Used" },
  { value: "active_days",         label: "Active Days" },
];

const MODE_OPTIONS: { value: SelectionMode; label: string }[] = [
  { value: "top_n",       label: "Top N" },
  { value: "bottom_n",    label: "Bottom N" },
  { value: "top5_bottom5", label: "Top 5 + Bottom 5" },
  { value: "all",         label: "All Users" },
];

export default function ComparisonPage() {
  const [metric, setMetric] = useState<MetricKey>("adoption_score");
  const [mode, setMode]   = useState<SelectionMode>("top_n");
  const [n, setN]         = useState(10);
  const [range, setRange]           = useState<RangeParam>("month");

  const needsN = mode === "top_n" || mode === "bottom_n";
  const effectiveN = needsN ? Math.min(Math.max(1, n), 20) : undefined;

  const { data, isLoading, error } = useComparison(range, metric, mode, effectiveN);

  const chartData = (data?.users ?? []).map((u) => ({
    label: u.label,
    value: typeof u.value === "number" ? parseFloat(u.value.toFixed(2)) : u.value,
  }));

  const selectedMetricLabel = METRIC_OPTIONS.find((m) => m.value === metric)?.label ?? metric;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: colors.textPrimary }}>
          User Comparison
        </h1>
        <RangeToggle range={range} onChange={setRange} />
      </div>

      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 28, alignItems: "flex-end" }}>
        {/* Metric selector */}
        <div>
          <label
            htmlFor="metric-select"
            style={{ display: "block", fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}
          >
            Metric
          </label>
          <select
            id="metric-select"
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
            data-testid="metric-select"
          >
            {METRIC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Mode selector */}
        <div>
          <label
            htmlFor="mode-select"
            style={{ display: "block", fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}
          >
            User set
          </label>
          <select
            id="mode-select"
            value={mode}
            onChange={(e) => setMode(e.target.value as SelectionMode)}
            data-testid="mode-select"
          >
            {MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* N input */}
        {needsN && (
          <div>
            <label
              htmlFor="n-input"
              style={{ display: "block", fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}
            >
              N (1–20)
            </label>
            <input
              id="n-input"
              type="number"
              min={1}
              max={20}
              value={n}
              onChange={(e) => setN(parseInt(e.target.value, 10) || 1)}
              data-testid="n-input"
              style={{ width: 80 }}
            />
          </div>
        )}
      </div>

      {/* Chart */}
      {isLoading && (
        <p style={{ color: colors.textSecondary, fontSize: 13 }}>Loading comparison…</p>
      )}
      {error && (
        <p style={{ color: colors.error, fontSize: 13 }} role="alert">
          Failed to load comparison data.
        </p>
      )}

      {!isLoading && !error && chartData.length > 0 && (
        <div
          style={{
            backgroundColor: colors.bgCard,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: 20,
          }}
        >
          <p style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            {selectedMetricLabel} — {MODE_OPTIONS.find((m) => m.value === mode)?.label}
            {needsN ? ` (top ${effectiveN})` : ""}
            {metric === "adoption_score" && <AdoptionScoreInfo />}
          </p>
          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 36)}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 20, left: 140, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
              <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} />
              <YAxis
                dataKey="label"
                type="category"
                tick={{ fill: colors.textSecondary, fontSize: 11 }}
                width={136}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: colors.bgElevated,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: colors.textPrimary }}
                itemStyle={{ color: colors.textPrimary }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={colors.chart[i % colors.chart.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!isLoading && !error && chartData.length === 0 && (
        <p style={{ color: colors.textMuted, fontSize: 13 }}>
          No data available for the selected metric and period.
        </p>
      )}
    </div>
  );
}
