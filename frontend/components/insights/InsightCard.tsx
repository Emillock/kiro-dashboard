/**
 * InsightCard — renders a single insight category as a card with a `<h2>` title
 * (one level below the page `<h1>`, Requirement 13.4) and one of four data
 * states (Requirements 2.6–2.10, 12.2–12.4):
 *
 * - `loading`: a skeleton/spinner scoped to this card only, so sibling cards are
 *   unaffected (Requirement 2.7).
 * - `error`: an error message plus a VISIBLE Retry control that invokes the
 *   supplied `retry()` callback (Requirements 2.8, 2.9).
 * - `empty`: a category empty-state message naming the category, with no numeric
 *   value (Requirements 2.10, 12.2).
 * - `ready`: renders each {@link Insight}. An individual insight whose status is
 *   `insufficient_data` or `unavailable` renders its message
 *   (description / `unavailableReason`) in place of a value, while sibling
 *   insights in the same card still render (Requirements 12.3, 12.4).
 *
 * Each insight's status is conveyed via {@link InsightStatusBadge}, which uses
 * text/aria and never color alone (Requirement 13.8).
 *
 * The card renders an interactive Retry button (with an `onClick` handler) in its
 * error state, so it is marked "use client" for consistency with how the page
 * mounts it.
 */

"use client";

import type { CSSProperties } from "react";
import type { Insight, InsightCategory } from "@/lib/insights/types";
import { InsightStatusBadge } from "@/components/insights/InsightStatusBadge";
import { colors } from "@/styles/theme";

/**
 * The data state of a single card. Mirrors the four per-card UI states the
 * requirements call for. The page derives this from the relevant query's
 * loading/error plus the engine's category result.
 */
export type CardDataState =
  | { kind: "loading" } // R2.7
  | { kind: "error"; retry: () => void } // R2.8, R2.9
  | { kind: "empty" } // R2.10, R12.2
  | { kind: "ready"; insights: Insight[] }; // normal

export interface InsightCardProps {
  /** The category this card represents. */
  category: InsightCategory;
  /** Visible heading text containing the category name (Requirement 2.6). */
  title: string;
  /** Current data state to render. */
  state: CardDataState;
}

/** Statuses that should render their message in place of a numeric value. */
function isMessageOnlyStatus(insight: Insight): boolean {
  return (
    insight.status === "insufficient_data" || insight.status === "unavailable"
  );
}

const cardStyle: CSSProperties = {
  backgroundColor: colors.bgCard,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  color: colors.textPrimary,
};

/**
 * Renders one category card, dispatching on `state.kind`.
 */
export function InsightCard({ category, title, state }: InsightCardProps) {
  return (
    <section
      data-testid={`insight-card-${category}`}
      aria-busy={state.kind === "loading"}
      style={cardStyle}
    >
      {/* One level below the page <h1> (Requirement 13.4). */}
      <h2 style={titleStyle}>{title}</h2>
      {renderState(category, title, state)}
    </section>
  );
}

/** Renders the body for the current state. */
function renderState(
  category: InsightCategory,
  title: string,
  state: CardDataState,
) {
  switch (state.kind) {
    case "loading":
      return <CardLoading category={category} />;
    case "error":
      return <CardError category={category} retry={state.retry} />;
    case "empty":
      return <CardEmpty category={category} title={title} />;
    case "ready":
      return <CardReady category={category} insights={state.insights} />;
    default: {
      // Exhaustiveness guard: if a new state kind is added, this fails to compile.
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

/** Loading state — a skeleton scoped to this card only (Requirement 2.7). */
function CardLoading({ category }: { category: InsightCategory }) {
  return (
    <div
      data-testid={`insight-card-loading-${category}`}
      role="status"
      aria-live="polite"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        Loading insights…
      </span>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            height: 14,
            borderRadius: 4,
            backgroundColor: colors.bgElevated,
            width: i === 2 ? "60%" : "100%",
          }}
        />
      ))}
    </div>
  );
}

/**
 * Error state — a message plus a VISIBLE Retry button that calls `retry()`
 * (Requirements 2.8, 2.9). Other cards are unaffected because this is scoped to
 * the card's own subtree.
 */
function CardError({
  category,
  retry,
}: {
  category: InsightCategory;
  retry: () => void;
}) {
  return (
    <div
      role="alert"
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
    >
      <p style={{ margin: 0, fontSize: 13, color: colors.error }}>
        Couldn&apos;t load these insights.
      </p>
      <button
        type="button"
        onClick={retry}
        data-testid={`insight-card-retry-${category}`}
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          backgroundColor: colors.bgElevated,
          color: colors.textPrimary,
          border: `1px solid ${colors.border}`,
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}

/**
 * Empty state — a message naming the category, with no numeric value
 * (Requirements 2.10, 12.2).
 */
function CardEmpty({
  category,
  title,
}: {
  category: InsightCategory;
  title: string;
}) {
  return (
    <p
      data-testid={`insight-card-empty-${category}`}
      style={{ margin: 0, fontSize: 13, color: colors.textMuted }}
    >
      No {title} insights for the selected range.
    </p>
  );
}

/**
 * Ready state — renders each insight. Insights with `insufficient_data` or
 * `unavailable` status render their message in place of a value, while sibling
 * insights still render (Requirements 12.3, 12.4).
 */
function CardReady({
  category,
  insights,
}: {
  category: InsightCategory;
  insights: Insight[];
}) {
  if (insights.length === 0) {
    // Defensive: a ready-but-empty list should still render gracefully. The page
    // normally maps "no insights" to the empty state, so this is a fallback.
    return (
      <p
        data-testid={`insight-card-empty-${category}`}
        style={{ margin: 0, fontSize: 13, color: colors.textMuted }}
      >
        No insights for the selected range.
      </p>
    );
  }

  return (
    <ul
      role="list"
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {insights.map((insight) => (
        <li key={insight.id} data-testid={`insight-${insight.id}`}>
          <InsightRow insight={insight} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Renders a single insight row: title, status badge, and either the computed
 * value/description or — for `insufficient_data`/`unavailable` — the message that
 * stands in place of a value.
 */
function InsightRow({ insight }: { insight: Insight }) {
  const messageOnly = isMessageOnlyStatus(insight);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>
          {insight.title}
        </span>
        <InsightStatusBadge status={insight.status} />
      </div>

      {messageOnly ? (
        // The message renders in place of a value (Requirement 12.3).
        <p
          data-testid={`insight-message-${insight.id}`}
          style={{ margin: 0, fontSize: 12, color: colors.textMuted }}
        >
          {insight.unavailableReason ?? insight.description}
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary }}>
          {insight.description}
        </p>
      )}
    </div>
  );
}
