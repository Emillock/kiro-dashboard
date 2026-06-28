"use client";

/**
 * InsightsPage — orchestrator for the `/insights` route (Requirements 2.1–2.10,
 * 11.5, 13.4).
 *
 * This client component mirrors the structure of the Overview page: a header row
 * with a single `<h1>` ("Insights", Requirement 13.4) and the reused
 * {@link RangeToggle} (Requirement 2.2), with the range defaulting to `"month"`
 * (Requirement 2.3). It subscribes to the existing TanStack Query hooks for the
 * selected range, fans out per-user metrics, hands the resolved data to the pure
 * {@link computeInsights} engine, and renders exactly seven {@link InsightCard}s —
 * one per category (Requirements 2.5, 2.6).
 *
 * ## Per-user data fan-out (Architecture: "Per-user data fan-out")
 *
 * `listUsers` (`UserSummary`) does not carry `daily_breakdown`, `model_messages`,
 * or `subscription_tier`, which several per-user insights need. Because React
 * hooks cannot be called in a loop, the page uses TanStack Query's `useQueries`
 * to fan out `getUserMetrics(range, userId)` for every user id returned by
 * `useUsers`. The resolved results are collected into the `userMetrics` array
 * passed to the engine; while the fan-out is still resolving the engine simply
 * receives the partial (or `null`) array and degrades gracefully — it never
 * blocks the aggregate-driven cards.
 *
 * ## Per-card state isolation (Requirements 2.7, 2.8, 11.5)
 *
 * Each card's loading/error state is derived from the *specific* query that card
 * depends on, so one failing query never breaks the others:
 *
 * - Adoption depends on `useUsers` (its retry refetches the users query).
 * - Every other card depends on `useAggregateMetrics` (their retry refetches the
 *   aggregate query).
 *
 * The engine already degrades gracefully when the per-user fan-out is absent, so
 * cards are gated primarily on their aggregate/users query and the engine handles
 * any missing per-user data without throwing.
 */

import { useState } from "react";
import React from "react";
import { useQueries } from "@tanstack/react-query";
import * as api from "@/lib/api";
import type { RangeParam, UserMetrics } from "@/lib/api";
import {
  useAggregateMetrics,
  useUsers,
  useRefreshInterval,
} from "@/lib/queries";
import {
  computeInsights,
  DEFAULT_INSIGHT_CONFIG,
} from "@/lib/insights";
import type {
  CategoryResult,
  InsightCategory,
  Insight,
} from "@/lib/insights/types";
import { InsightCard } from "@/components/insights/InsightCard";
import type { CardDataState } from "@/components/insights/InsightCard";
import { RangeToggle } from "@/components/common/RangeToggle";
import { AdoptionLeaderboard } from "@/components/insights/AdoptionLeaderboard";
import { CostEfficiencyChart } from "@/components/insights/CostEfficiencyChart";
import { TrendSparklines } from "@/components/insights/TrendSparklines";
import { ModelUsageDonut } from "@/components/insights/ModelUsageDonut";
import { AnomaliesCallout } from "@/components/insights/AnomaliesCallout";
import { CreditDepletionCard as CreditDepletionViz } from "@/components/insights/CreditDepletionCard";
import { colors } from "@/styles/theme";

/**
 * The seven categories rendered as cards, in display order, each paired with a
 * human-readable title containing the category name (Requirements 2.5, 2.6).
 * Order is fixed — no drag-and-drop reordering (Requirement 14.7).
 */
const CARD_ORDER: { category: InsightCategory; title: string }[] = [
  { category: "trends", title: "Trends" },
  { category: "adoption", title: "Adoption" },
  { category: "engagement", title: "Engagement" },
  { category: "modelUsage", title: "Model Usage" },
  { category: "costEfficiency", title: "Cost & Efficiency" },
  { category: "anomalies", title: "Anomalies" },
  { category: "creditDepletion", title: "Credit Depletion" },
];

/**
 * Categories whose cards host a Recharts visualization. These cards receive
 * `gridColumn: "span 2"` at multi-column viewports so charts have adequate
 * horizontal space (Requirement 14.2).
 */
const CHART_CARD_CATEGORIES: Set<InsightCategory> = new Set([
  "trends",
  "modelUsage",
  "costEfficiency",
]);

/** Minimal shape of a query the cards depend on for state derivation. */
interface CardQuery {
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

/**
 * Derive a card's {@link CardDataState} from the query it depends on plus the
 * engine's {@link CategoryResult} for that category (Requirements 2.7–2.10, 11.5).
 *
 * Precedence: a still-pending dependency yields `loading`; a failed dependency
 * yields `error` with a retry that refetches that specific query (Requirement
 * 2.9); a whole-category `insufficient` result or an empty insight list yields
 * `empty` (Requirement 2.10); otherwise the insights render (`ready`).
 */
function deriveCardState(
  query: CardQuery,
  result: CategoryResult,
): CardDataState {
  if (query.isLoading) {
    return { kind: "loading" };
  }
  if (query.error) {
    return {
      kind: "error",
      retry: () => {
        query.refetch();
      },
    };
  }
  if (result.kind === "insufficient" || (result.kind === "insights" && result.insights.length === 0)) {
    return { kind: "empty" };
  }
  return { kind: "ready", insights: result.insights };
}

export default function InsightsPage() {
  // Range defaults to "month" when no prior selection exists (Requirement 2.3).
  const [range, setRange] = useState<RangeParam>("month");

  const refetchInterval = useRefreshInterval();

  // Aggregate metrics drive six of the seven cards (Requirement 2.4).
  const aggregateQuery = useAggregateMetrics(range);
  // The user summary list drives the adoption card and seeds the fan-out.
  const usersQuery = useUsers(range);

  const users = usersQuery.data?.users ?? [];

  // ── Per-user fan-out via useQueries (Architecture: per-user data fan-out) ──
  // Hooks cannot be called in a loop, so `useQueries` issues one
  // `getUserMetrics(range, userId)` query per user. The query key matches the
  // existing `useUserMetrics` hook so the cache is shared.
  const userMetricsQueries = useQueries({
    queries: users.map((u) => ({
      queryKey: ["user", range, u.user_id],
      queryFn: () => api.getUserMetrics(range, u.user_id),
      enabled: !!u.user_id,
      refetchInterval,
      staleTime: 0,
    })),
  });

  // Collect only the resolved per-user metrics; the engine tolerates a partial
  // (or null) array while the fan-out is still in flight.
  const resolvedUserMetrics: UserMetrics[] = userMetricsQueries
    .map((q) => q.data)
    .filter((d): d is UserMetrics => d != null);
  const userMetrics =
    resolvedUserMetrics.length > 0 ? resolvedUserMetrics : null;

  // Compute every category from whatever data has resolved (pure, deterministic).
  const categorized = computeInsights(
    {
      range,
      aggregate: aggregateQuery.data ?? null,
      userSummaries: usersQuery.data?.users ?? null,
      userMetrics,
      allowanceByTier: null,
      overageByUser: null,
    },
    DEFAULT_INSIGHT_CONFIG,
  );

  // Map each category to the query it depends on for loading/error isolation.
  // Adoption depends on the users query; all other cards depend on aggregate.
  const aggregateCardQuery: CardQuery = {
    isLoading: aggregateQuery.isLoading,
    error: aggregateQuery.error,
    refetch: () => {
      aggregateQuery.refetch();
    },
  };
  const usersCardQuery: CardQuery = {
    isLoading: usersQuery.isLoading,
    error: usersQuery.error,
    refetch: () => {
      usersQuery.refetch();
    },
  };

  function queryForCategory(category: InsightCategory): CardQuery {
    return category === "adoption" ? usersCardQuery : aggregateCardQuery;
  }

  return (
    <div>
      {/* Header row — single <h1> (Requirement 13.4) plus reused RangeToggle. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <h1
          style={{ fontSize: 20, fontWeight: 700, color: colors.textPrimary }}
          className="neon-text"
        >
          Insights
        </h1>

        <RangeToggle range={range} onChange={setRange} />
      </div>

      {/* Responsive CSS grid — breakpoints injected via <style> tag since inline
          styles cannot express @media queries (Requirement 14.3–14.5).
          Class `insights-grid` is scoped to this page only.
          < 768px        → 1 column  (single column, full width)
          768–1199px     → 2 columns (repeat(2, 1fr))
          ≥ 1200px       → 4 columns (repeat(4, 1fr))
          Chart-bearing cards span 2 columns; text-only cards span 1 (Req 14.2). */}
      <style>{`
        .insights-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }
        @media (min-width: 768px) {
          .insights-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1200px) {
          .insights-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }
      `}</style>
      <div className="insights-grid">
        {CARD_ORDER.map(({ category, title }) => (
          <div
            key={category}
            style={{
              gridColumn: CHART_CARD_CATEGORIES.has(category)
                ? "span 2"
                : "span 1",
            }}
          >
            <InsightCard
              category={category}
              title={title}
              state={deriveCardState(
                queryForCategory(category),
                categorized[category],
              )}
              renderReady={buildRenderReady(
                category,
                aggregateQuery.data?.daily_totals ?? [],
                aggregateQuery.data?.model_distribution ?? {},
                usersQuery.data?.users ?? [],
                range,
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Visualization wiring helpers ─────────────────────────────────────────────

/**
 * A minimal row for rendering a single text insight inside visualization cards.
 * Used by Trends and Cost & Efficiency cards to render the text insights
 * alongside their Recharts visualizations.
 */
function TrendInsightRow({ insight }: { insight: Insight }) {
  const isMessageOnly =
    insight.status === "insufficient_data" || insight.status === "unavailable";
  return (
    <div
      key={insight.id}
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
    >
      <span
        style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}
      >
        {insight.title}
      </span>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: isMessageOnly ? colors.textMuted : colors.textSecondary,
        }}
      >
        {isMessageOnly
          ? (insight.unavailableReason ?? insight.description)
          : insight.description}
      </p>
    </div>
  );
}

// ── Named render-ready components ────────────────────────────────────────────
// Each is a named function so react/display-name is satisfied. They are
// factories: the outer function closes over the data it needs and returns the
// named inner renderer that InsightCard will call with the resolved insights.

function makeTrendsRenderer(
  dailyTotals: import("@/lib/api").DailyTotal[],
  range: RangeParam,
) {
  return function TrendsRenderer(insights: Insight[]): React.ReactNode {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <TrendSparklines dailyTotals={dailyTotals} range={range} />
        {insights.map((insight) => (
          <TrendInsightRow key={insight.id} insight={insight} />
        ))}
      </div>
    );
  };
}

function makeAdoptionRenderer(userSummaries: import("@/lib/api").UserSummary[]) {
  return function AdoptionRenderer(insights: Insight[]): React.ReactNode {
    return (
      <AdoptionLeaderboard insights={insights} userSummaries={userSummaries} />
    );
  };
}

function makeModelUsageRenderer(modelDistribution: Record<string, number>) {
  return function ModelUsageRenderer(insights: Insight[]): React.ReactNode {
    const outlierUsers = insights
      .filter((ins) => ins.id.startsWith("modelUsage-outlier-"))
      .map((ins) => ({
        userId: String(ins.detail?.["user_id"] ?? ins.id),
        dominantModel: String(ins.detail?.["dominant_model"] ?? ""),
      }));
    return (
      <ModelUsageDonut
        modelDistribution={modelDistribution}
        outlierUsers={outlierUsers.length > 0 ? outlierUsers : undefined}
      />
    );
  };
}

function makeCostEfficiencyRenderer() {
  return function CostEfficiencyRenderer(insights: Insight[]): React.ReactNode {
    const highCostUsers = insights
      .filter((ins) => ins.id.startsWith("costEfficiency-high-cost-"))
      .map((ins) => ({
        userId: String(ins.detail?.["userId"] ?? ins.id),
        creditEfficiency: Number(ins.detail?.["creditEfficiency"] ?? 0),
      }));
    const textInsights = insights.filter(
      (ins) => !ins.id.startsWith("costEfficiency-high-cost-"),
    );
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <CostEfficiencyChart highCostUsers={highCostUsers} />
        {textInsights.map((insight) => (
          <TrendInsightRow key={insight.id} insight={insight} />
        ))}
      </div>
    );
  };
}

function AnomaliesRenderer(insights: Insight[]): React.ReactNode {
  return <AnomaliesCallout insights={insights} />;
}

function CreditDepletionRenderer(insights: Insight[]): React.ReactNode {
  return <CreditDepletionViz insights={insights} />;
}

/**
 * Build a category-specific `renderReady` function that replaces the default
 * plain-list rendering with the appropriate visualization sub-component
 * (Requirements 15–20).
 *
 * Returns `undefined` for the Engagement card, which has no dedicated
 * visualization and renders via the default `InsightCard` list.
 *
 * @param category - The card's insight category.
 * @param dailyTotals - Resolved aggregate daily totals (for TrendSparklines).
 * @param modelDistribution - Resolved model distribution (for ModelUsageDonut).
 * @param userSummaries - Resolved user summary list (for AdoptionLeaderboard).
 * @param range - Current range selection (for TrendSparklines).
 */
function buildRenderReady(
  category: InsightCategory,
  dailyTotals: import("@/lib/api").DailyTotal[],
  modelDistribution: Record<string, number>,
  userSummaries: import("@/lib/api").UserSummary[],
  range: RangeParam,
): ((insights: Insight[]) => React.ReactNode) | undefined {
  switch (category) {
    case "trends":
      return makeTrendsRenderer(dailyTotals, range);
    case "adoption":
      return makeAdoptionRenderer(userSummaries);
    case "modelUsage":
      return makeModelUsageRenderer(modelDistribution);
    case "costEfficiency":
      return makeCostEfficiencyRenderer();
    case "anomalies":
      return AnomaliesRenderer;
    case "creditDepletion":
      return CreditDepletionRenderer;
    case "engagement":
    default:
      return undefined;
  }
}
