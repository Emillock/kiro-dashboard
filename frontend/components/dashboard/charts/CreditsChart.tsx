"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { colors } from "@/styles/theme";
import type { DailyTotal } from "@/lib/api";

export function CreditsChart({ data }: { data: DailyTotal[] }) {
  const formatted = data.map((d) => ({
    date: d.date.slice(5),
    credits: parseFloat(d.credits_used.toFixed(2)),
  }));

  return (
    <div>
      <p style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 10, fontWeight: 600 }}>
        Credits Used
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={formatted} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="creditsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={colors.warning} stopOpacity={0.3} />
              <stop offset="95%" stopColor={colors.warning} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
          <XAxis dataKey="date" tick={{ fill: colors.textMuted, fontSize: 11 }} />
          <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} width={40} />
          <Tooltip
            contentStyle={{ backgroundColor: colors.bgElevated, border: `1px solid ${colors.border}`, borderRadius: 6 }}
            labelStyle={{ color: colors.textPrimary }}
            itemStyle={{ color: colors.textPrimary }}
          />
          <Area type="monotone" dataKey="credits" stroke={colors.warning} fill="url(#creditsGradient)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
