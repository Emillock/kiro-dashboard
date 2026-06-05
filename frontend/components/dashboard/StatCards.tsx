import { colors } from "@/styles/theme";
import { Card } from "@/components/common/Card";
import type { AggregateMetrics } from "@/lib/api";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

function StatCard({ label, value, sub, color }: StatCardProps) {
  return (
    <Card style={{ flex: 1, minWidth: 140 }}>
      <p style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
        {label}
      </p>
      <p style={{ fontSize: 28, fontWeight: 700, color: color ?? colors.textPrimary, lineHeight: 1 }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && (
        <p style={{ fontSize: 12, color: colors.textSecondary, marginTop: 6 }}>{sub}</p>
      )}
    </Card>
  );
}

/**
 * StatCards renders the four headline metrics.
 *
 * - `variant="aggregate"` (default): organisation-wide totals (Overview page).
 * - `variant="individual"`: a single user's metrics (Individual page). The labels
 *   differ because, for one person, "Active Users" is really their Active Days and
 *   the "avg per user" / "Total" framing doesn't apply.
 */
export function StatCards({
  data,
  variant = "aggregate",
}: {
  data: AggregateMetrics;
  variant?: "aggregate" | "individual";
}) {
  if (variant === "individual") {
    return (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard
          label="Total Messages"
          value={data.total_messages}
          color={colors.accentLight}
        />
        <StatCard
          label="Active Days"
          value={data.active_user_count}
          sub="days active in period"
          color={colors.success}
        />
        <StatCard
          label="Chat Conversations"
          value={data.total_chat_conversations}
        />
        <StatCard
          label="Credits Used"
          value={data.total_credits_used.toFixed(1)}
          color={colors.warning}
        />
      </div>
    );
  }

  const avgMsgs = data.avg_messages_per_user.toFixed(1);
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <StatCard
        label="Total Messages"
        value={data.total_messages}
        sub={`avg ${avgMsgs} per user`}
        color={colors.accentLight}
      />
      <StatCard
        label="Active Users"
        value={data.active_user_count}
        color={colors.success}
      />
      <StatCard
        label="Chat Conversations"
        value={data.total_chat_conversations}
      />
      <StatCard
        label="Total Credits"
        value={data.total_credits_used.toFixed(1)}
        sub="credits used"
        color={colors.warning}
      />
    </div>
  );
}
