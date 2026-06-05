"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { colors } from "@/styles/theme";
import type { DailyTotal } from "@/lib/api";

export function MessagesOverTime({
  data,
  showActiveUsers = true,
}: {
  data: DailyTotal[];
  showActiveUsers?: boolean;
}) {
  const formatted = data.map((d) => ({
    date: d.date.slice(5),   // MM-DD
    messages: d.total_messages,
    activeUsers: d.active_users,
  }));

  return (
    <div>
      <p style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 10, fontWeight: 600 }}>
        Messages Over Time
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={formatted} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
          <XAxis dataKey="date" tick={{ fill: colors.textMuted, fontSize: 11 }} />
          <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} width={40} />
          <Tooltip
            contentStyle={{ backgroundColor: colors.bgElevated, border: `1px solid ${colors.border}`, borderRadius: 6 }}
            labelStyle={{ color: colors.textPrimary }}
            itemStyle={{ color: colors.textPrimary }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: colors.textSecondary }} />
          <Line type="monotone" dataKey="messages" stroke={colors.accent} dot={false} strokeWidth={2} name="Messages" />
          {showActiveUsers && (
            <Line type="monotone" dataKey="activeUsers" stroke={colors.success} dot={false} strokeWidth={2} name="Active Users" />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
