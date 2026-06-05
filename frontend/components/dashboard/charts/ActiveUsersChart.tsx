"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { colors } from "@/styles/theme";
import type { DailyTotal } from "@/lib/api";

export function ActiveUsersChart({ data }: { data: DailyTotal[] }) {
  const formatted = data.map((d) => ({
    date: d.date.slice(5),
    users: d.active_users,
  }));

  return (
    <div>
      <p style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 10, fontWeight: 600 }}>
        Active Users per Day
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={formatted} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
          <XAxis dataKey="date" tick={{ fill: colors.textMuted, fontSize: 11 }} />
          <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} width={30} allowDecimals={false} />
          <Tooltip
            contentStyle={{ backgroundColor: colors.bgElevated, border: `1px solid ${colors.border}`, borderRadius: 6 }}
            labelStyle={{ color: colors.textPrimary }}
            itemStyle={{ color: colors.textPrimary }}
          />
          <Bar dataKey="users" fill={colors.success} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
