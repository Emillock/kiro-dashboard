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
} from "@/lib/insights/types";
import { InsightCard } from "@/components/insights/InsightCard";
import type { CardDataState } from "@/components/insights/InsightCard";
import { RangeToggle } from "@/components/common/RangeToggle";
import { colors } from "@/styles/theme";

/**
 * The seven categories rendered as cards, in display order, each paired with a
 * human-readable title containing the category name (Requirements 2.5, 2.6).
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
  if (result.kind === "insufficient" || result.insights.length === 0) {
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

      {/* Seven category cards in a responsive grid (Requirements 2.5, 2.6). */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        {CARD_ORDER.map(({ category, title }) => (
          <InsightCard
            key={category}
            category={category}
            title={title}
            state={deriveCardState(
              queryForCategory(category),
              categorized[category],
            )}
          />
        ))}
      </div>
    </div>
  );
}
