"use client";

import { useState } from "react";
import {
  loadLayout,
  saveLayout,
  reorderBlocks,
  toggleLock,
} from "@/lib/layout";
import type { BlockState } from "@/lib/layout";
import type { RangeParam } from "@/lib/api";
import { useAggregateMetrics, useTopAdopters } from "@/lib/queries";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";
import { StatCards } from "@/components/dashboard/StatCards";
import { TopAdoptersPodium } from "@/components/dashboard/TopAdoptersPodium";
import { MessagesOverTime } from "@/components/dashboard/charts/MessagesOverTime";
import { ModelDistribution } from "@/components/dashboard/charts/ModelDistribution";
import { CreditsChart } from "@/components/dashboard/charts/CreditsChart";
import { ActiveUsersChart } from "@/components/dashboard/charts/ActiveUsersChart";
import { RangeToggle } from "@/components/common/RangeToggle";
import { colors } from "@/styles/theme";

const BLOCK_TITLES: Record<string, string> = {
  "top-adopters":       "Top Adopters",
  "stat-cards":         "Summary",
  "messages-over-time": "Messages Over Time",
  "model-distribution": "Model Distribution",
  "credits-chart":      "Credits",
  "active-users-chart": "Active Users",
};

export default function DashboardPage() {
  const [range, setRange] = useState<RangeParam>("month");
  const [blocks, setBlocks] = useState<BlockState[]>(loadLayout);

  const { data: aggregateData, isLoading: aggLoading, error: aggError } = useAggregateMetrics(range);
  const { data: topData } = useTopAdopters(range, 5);

  function handleReorder(from: number, to: number) {
    const next = reorderBlocks(blocks, from, to);
    setBlocks(next);
    saveLayout(next);
  }

  function handleToggleLock(id: string) {
    const next = toggleLock(blocks, id);
    setBlocks(next);
    saveLayout(next);
  }

  function renderBlock(id: string) {
    if (!aggregateData) return <p style={{ color: colors.textMuted, fontSize: 12 }}>Loading…</p>;
    switch (id) {
      case "top-adopters":
        return <TopAdoptersPodium adopters={topData?.top_adopters ?? []} />;
      case "stat-cards":
        return <StatCards data={aggregateData} />;
      case "messages-over-time":
        return <MessagesOverTime data={aggregateData.daily_totals} />;
      case "model-distribution":
        return <ModelDistribution data={aggregateData.model_distribution} />;
      case "credits-chart":
        return <CreditsChart data={aggregateData.daily_totals} />;
      case "active-users-chart":
        return <ActiveUsersChart data={aggregateData.daily_totals} />;
      default:
        return null;
    }
  }

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: colors.textPrimary }} className="neon-text">
          Overview
        </h1>

        {/* Time range selector (US-MAIN-01) */}
        <RangeToggle range={range} onChange={setRange} />
      </div>

      {aggLoading && (
        <p style={{ color: colors.textSecondary, fontSize: 13 }}>Loading metrics…</p>
      )}
      {aggError && (
        <p style={{ color: colors.error, fontSize: 13 }} role="alert">
          Failed to load metrics. Please try again.
        </p>
      )}

      {aggregateData && (
        <DashboardGrid
          blocks={blocks}
          onReorder={handleReorder}
          onToggleLock={handleToggleLock}
          renderBlock={renderBlock}
          blockTitles={BLOCK_TITLES}
        />
      )}
    </div>
  );
}
