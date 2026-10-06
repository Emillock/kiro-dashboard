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
import { CreditDepletionCard as CreditDepletionViz } from "@/components/insights/CreditDepletionCard";
import { InsightStatusBadge } from "@/components/insights/InsightStatusBadge";
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

/**
 * Categories whose cards span the full grid width via `grid-column: 1 / -1`.
 * Credit Depletion is the lone card in the final row of the default order at
 * every breakpoint, so making it full-width fills the row instead of leaving
 * empty trailing columns.
 */
const FULL_WIDTH_CARD_CATEGORIES: Set<InsightCategory> = new Set([
  "creditDepletion",
]);

/**
 * Build the per-tier monthly credit Allowance map the credit-depletion engine
 * needs from the resolved per-user fan-out's `overage_cap` field. A tier's
 * allowance is taken as the mode (most common non-zero value) of `overage_cap`
 * across its users, guarding against the odd inconsistent row.
 */
function buildAllowanceByTier(
  userMetrics: UserMetrics[] | null,
): Record<string, number> | null {
  if (!userMetrics) return null;
  const countsByTier = new Map<string, Map<number, number>>();
  for (const user of userMetrics) {
    if (!user.subscription_tier || !(user.overage_cap > 0)) continue;
    const counts = countsByTier.get(user.subscription_tier) ?? new Map();
    counts.set(user.overage_cap, (counts.get(user.overage_cap) ?? 0) + 1);
    countsByTier.set(user.subscription_tier, counts);
  }
  if (countsByTier.size === 0) return null;
  const result: Record<string, number> = {};
  for (const [tier, counts] of countsByTier) {
    let bestValue = 0;
    let bestCount = -1;
    for (const [value, count] of counts) {
      if (count > bestCount) {
        bestValue = value;
        bestCount = count;
      }
    }
    result[tier] = bestValue;
  }
  return result;
}

/** Build the per-user overage-credit-spend map from the resolved fan-out. */
function buildOverageByUser(
  userMetrics: UserMetrics[] | null,
): Record<string, number> | null {
  if (!userMetrics) return null;
  const result: Record<string, number> = {};
  for (const user of userMetrics) {
    result[user.user_id] = user.overage_credits_used;
  }
  return result;
}

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

  // Build the allowance/overage maps the credit-depletion insights need
  // straight from the resolved per-user fan-out (Overage_Cap /
  // Overage_Credits_Used are now surfaced on `UserMetrics`).
  const allowanceByTier = buildAllowanceByTier(userMetrics);
  const overageByUser = buildOverageByUser(userMetrics);

  // Compute every category from whatever data has resolved (pure, deterministic).
  const categorized = computeInsights(
    {
      range,
      aggregate: aggregateQuery.data ?? null,
      userSummaries: usersQuery.data?.users ?? null,
      userMetrics,
      allowanceByTier,
      overageByUser,
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
          grid-template-columns: minmax(0, 1fr);
          gap: 12px;
          align-items: start;
          grid-auto-flow: row dense;
        }
        .insights-grid > * { min-width: 0; }
        .insights-side-col { display: grid; gap: 12px; align-items: start; grid-template-columns: minmax(0, 1fr); }
        @media (min-width: 768px) and (max-width: 1199px) {
          .insights-side-col { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 768px) {
          .insights-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .insights-span-2 { grid-column: span 2; }
          .insights-span-all { grid-column: 1 / -1; }
        }
        @media (min-width: 1200px) {
          .insights-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
        @media (max-width: 767px) {
          main[role="main"] { padding: 64px 16px 24px !important; }
        }
      `}</style>
      <div className="insights-grid">
        {CARD_ORDER.map(({ category, title }) => {
          const card = (
            <div
              key={category}
              className={
                FULL_WIDTH_CARD_CATEGORIES.has(category)
                  ? "insights-span-all"
                  : category === "trends"
                    ? "insights-span-2"
                    : category === "adoption" || category === "engagement"
                      ? "insights-side"
                      : CHART_CARD_CATEGORIES.has(category)
                        ? "insights-span-2"
                        : undefined
              }
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
          );
          if (category === "adoption") return null;
          if (category === "engagement") {
            return (
              <div key="side-col" className="insights-span-2 insights-side-col">
                {CARD_ORDER.filter(
                  (c) => c.category === "adoption" || c.category === "engagement",
                ).map((c) => (
                  <div key={c.category} className="insights-side">
                    <InsightCard
                      category={c.category}
                      title={c.title}
                      state={deriveCardState(
                        queryForCategory(c.category),
                        categorized[c.category],
                      )}
                      renderReady={buildRenderReady(
                        c.category,
                        aggregateQuery.data?.daily_totals ?? [],
                        aggregateQuery.data?.model_distribution ?? {},
                        usersQuery.data?.users ?? [],
                        range,
                      )}
                    />
                  </div>
                ))}
              </div>
            );
          }
          return card;
        })}
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

function makeModelUsageRenderer(modelDistribution: Record<string, number>, userSummaries: import("@/lib/api").UserSummary[]) {
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
        userSummaries={userSummaries}
      />
    );
  };
}

function makeCostEfficiencyRenderer(userSummaries: import("@/lib/api").UserSummary[]) {
  return function CostEfficiencyRenderer(insights: Insight[]): React.ReactNode {
    const highCostUsers = insights
      .filter((ins) => ins.id.startsWith("costEfficiency-high-cost-"))
      .map((ins) => {
        const rawUserId = String(ins.detail?.["userId"] ?? ins.id);
        const found = userSummaries.find((u) => u.user_id === rawUserId);
        return {
          userId: found?.label || rawUserId,
          creditEfficiency: Number(ins.detail?.["creditEfficiency"] ?? 0),
        };
      });
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

function CreditDepletionRenderer(insights: Insight[]): React.ReactNode {
  const hasUnavailable = insights.some((i) => i.status === "unavailable");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {hasUnavailable && (
        <div style={{
          backgroundColor: colors.bgElevated,
          borderLeft: `3px solid ${colors.warning}`,
          borderRadius: 4,
          padding: "8px 12px",
          fontSize: 12,
          color: colors.textSecondary,
        }}>
          <strong style={{ color: colors.textPrimary }}>Why are some insights unavailable?</strong>
          <p style={{ margin: "4px 0 0" }}>
            The depletion-timing trend requires at least two consecutive months of data, and only
            one range is stored at a time. The insights that can be computed from available data are
            shown below.
          </p>
        </div>
      )}
      <CreditDepletionViz insights={insights} />
    </div>
  );
}

function makeEngagementRenderer(userSummaries: import("@/lib/api").UserSummary[]) {
  return function EngagementRenderer(insights: Insight[]): React.ReactNode {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {insights.map((insight) => {
          // Special handling for dormant users insight
          if (insight.id === "engagement-dormant-users" && insight.detail && typeof insight.detail.userIds === "string" && insight.detail.userIds.length > 0) {
            const dormantIds = insight.detail.userIds.split(",").map((s: string) => s.trim()).filter(Boolean);
            const dormantLabels = dormantIds.map((id: string) => {
              const found = userSummaries.find((u) => u.user_id === id);
              return found?.label || id;
            });
            return (
              <div key={insight.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>{insight.title}</span>
                  <InsightStatusBadge status={insight.status} />
                </div>
                <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary }}>{insight.description}</p>
                <ul role="list" style={{ listStyle: "none", margin: 0, padding: "6px 8px", maxHeight: 140, overflowY: "auto", backgroundColor: colors.bgElevated, borderRadius: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {dormantLabels.map((label: string) => (
                    <li key={label} style={{ fontSize: 12, color: colors.textSecondary, padding: "2px 0" }}>{label}</li>
                  ))}
                </ul>
              </div>
            );
          }
          // Default rendering for other engagement insights
          const isMessageOnly = insight.status === "insufficient_data" || insight.status === "unavailable";
          return (
            <div key={insight.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>{insight.title}</span>
                <InsightStatusBadge status={insight.status} />
              </div>
              <p style={{ margin: 0, fontSize: 12, color: isMessageOnly ? colors.textMuted : colors.textSecondary }}>
                {isMessageOnly ? (insight.unavailableReason ?? insight.description) : insight.description}
              </p>
            </div>
          );
        })}
      </div>
    );
  };
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
    case "engagement":
      return makeEngagementRenderer(userSummaries);
    case "modelUsage":
      return makeModelUsageRenderer(modelDistribution, userSummaries);
    case "costEfficiency":
      return makeCostEfficiencyRenderer(userSummaries);
    case "creditDepletion":
      return CreditDepletionRenderer;
    default:
      return undefined;
  }
}
