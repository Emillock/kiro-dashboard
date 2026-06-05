"use client";

import { useState } from "react";
import { useUsers, useUserMetrics } from "@/lib/queries";
import { UserSearchSelect } from "@/components/individual/UserSearchSelect";
import { StatCards } from "@/components/dashboard/StatCards";
import { MessagesOverTime } from "@/components/dashboard/charts/MessagesOverTime";
import { ModelDistribution } from "@/components/dashboard/charts/ModelDistribution";
import { Card } from "@/components/common/Card";
import { colors } from "@/styles/theme";
import type { RangeParam } from "@/lib/api";
import type { AggregateMetrics } from "@/lib/api";

export default function IndividualPage() {
  const [range] = useState<RangeParam>("month");
  const [selectedUserId, setSelectedUserId] = useState("");

  const { data: usersData, isLoading: usersLoading } = useUsers(range);
  const { data: userMetrics, isLoading: metricsLoading } = useUserMetrics(range, selectedUserId);

  // Adapt UserMetrics to AggregateMetrics shape for StatCards reuse.
  const statData: AggregateMetrics | null = userMetrics
    ? {
        range,
        start_date: "",
        end_date: "",
        total_messages: userMetrics.total_messages,
        total_chat_conversations: userMetrics.chat_conversations,
        total_credits_used: userMetrics.credits_used,
        active_user_count: userMetrics.active_days,
        avg_messages_per_user: userMetrics.total_messages,
        avg_conversations_per_user: userMetrics.chat_conversations,
        model_distribution: userMetrics.model_messages,
        daily_totals: userMetrics.daily_breakdown,
      }
    : null;

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: colors.textPrimary, marginBottom: 24 }}>
        Individual Metrics
      </h1>

      {usersLoading ? (
        <p style={{ color: colors.textSecondary, fontSize: 13 }}>Loading users…</p>
      ) : (
        <UserSearchSelect
          users={usersData?.users ?? []}
          selected={selectedUserId}
          onSelect={setSelectedUserId}
        />
      )}

      {selectedUserId && (
        <div style={{ marginTop: 28 }}>
          {metricsLoading && (
            <p style={{ color: colors.textSecondary, fontSize: 13 }}>Loading metrics…</p>
          )}

          {statData && !metricsLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Stat summary */}
              <div>
                <p style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
                  Showing metrics for: <strong style={{ color: colors.accentLight }}>{userMetrics?.label}</strong>
                </p>
                <StatCards data={statData} />
              </div>

              {/* Charts */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <Card>
                  <MessagesOverTime data={statData.daily_totals} />
                </Card>
                <Card>
                  <ModelDistribution data={statData.model_distribution} />
                </Card>
              </div>

              {/* Subscription info */}
              <Card style={{ display: "inline-flex", gap: 16 }}>
                <span style={{ fontSize: 12, color: colors.textSecondary }}>
                  Subscription tier:{" "}
                  <strong style={{ color: colors.textPrimary }}>
                    {userMetrics?.subscription_tier ?? "Unknown"}
                  </strong>
                </span>
                <span style={{ fontSize: 12, color: colors.textSecondary }}>
                  AI Adoption Score:{" "}
                  <strong style={{ color: colors.accentLight }}>
                    {userMetrics?.adoption_score.toFixed(1)}
                  </strong>
                </span>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
