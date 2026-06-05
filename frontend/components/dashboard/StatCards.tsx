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
      <p style={{ fontSize: 11, color: colors.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </p>
      <p style={{ fontSize: 28, fontWeight: 700, color: color ?? colors.textPrimary, lineHeight: 1 }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && (
        <p style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>{sub}</p>
      )}
    </Card>
  );
}

export function StatCards({ data }: { data: AggregateMetrics }) {
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
