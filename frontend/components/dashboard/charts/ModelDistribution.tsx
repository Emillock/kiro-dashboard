"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { colors } from "@/styles/theme";

export function ModelDistribution({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  const chartData = entries.map(([model, count]) => ({
    model: model.replace(/_messages$/, "").replace(/_/g, " "),
    count,
  }));

  return (
    <div>
      <p style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 10, fontWeight: 600 }}>
        Model Usage Distribution
      </p>
      {chartData.length === 0 ? (
        <p style={{ fontSize: 12, color: colors.textMuted }}>No model data available.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 34)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} />
            <YAxis
              dataKey="model"
              type="category"
              tick={{ fill: colors.textSecondary, fontSize: 11 }}
              width={120}
              interval={0}
            />
            <Tooltip
              contentStyle={{ backgroundColor: colors.bgElevated, border: `1px solid ${colors.border}`, borderRadius: 6 }}
              labelStyle={{ color: colors.textPrimary }}
              itemStyle={{ color: colors.textPrimary }}
            />
            <Bar dataKey="count" radius={[0, 3, 3, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={colors.chart[i % colors.chart.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
