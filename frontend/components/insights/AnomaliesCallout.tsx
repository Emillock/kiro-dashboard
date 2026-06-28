/**
 * AnomaliesCallout — renders anomaly category insights as visually distinct
 * callout divs with a left border whose color conveys severity.
 *
 * Requirement 19.1 — each insight is a `<div>` with `borderLeft` ≥ 3px and
 *   `borderRadius` ≥ 4px.
 * Requirement 19.2 — border color: `colors.error` when `status === "anomaly"`,
 *   `colors.warning` when `status === "decrease"`.
 * Requirement 19.3 — each callout renders title, description, and
 *   `InsightStatusBadge` in that order; no fields removed or reordered.
 * Requirement 19.4 — an empty insights array renders only the standard empty-state
 *   message with no callout `<div>` elements.
 * Requirement 19.5 / 13.8 — color is never the sole conveyor of severity; the
 *   `InsightStatusBadge` always provides the accessible text label.
 */

"use client";

import type { CSSProperties } from "react";
import type { Insight } from "@/lib/insights/types";
import { InsightStatusBadge } from "@/components/insights/InsightStatusBadge";
import { colors } from "@/styles/theme";

export interface AnomaliesCalloutProps {
  /** Anomaly category insights — status is typically "anomaly" or "decrease". */
  insights: Insight[];
}

/**
 * Resolves the left-border color for an insight.
 *
 * - `colors.error`   when `status === "anomaly"`  (Requirement 19.2)
 * - `colors.warning` when `status === "decrease"` (Requirement 19.2)
 * - `colors.border`  as a neutral fallback for any other status so the callout
 *   frame still renders consistently without introducing an invalid color.
 */
function borderColorForStatus(status: Insight["status"]): string {
  if (status === "anomaly") return colors.error;
  if (status === "decrease") return colors.warning;
  return colors.border;
}

/** Styles for the outer callout card. */
const calloutStyle = (status: Insight["status"]): CSSProperties => ({
  borderLeft: `4px solid ${borderColorForStatus(status)}`, // ≥ 3 px (R19.1)
  borderRadius: 6, // ≥ 4 px (R19.1)
  backgroundColor: colors.bgElevated,
  padding: "10px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
});

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
  color: colors.textPrimary,
};

const descriptionStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: colors.textSecondary,
};

/**
 * Renders a single anomaly insight as a callout with a left-colored border.
 * Title, description, and badge are rendered in that order (Requirement 19.3).
 * Color is never the sole conveyor of severity — the badge provides the text
 * label (Requirement 19.5).
 */
function AnomalyCalloutItem({ insight }: { insight: Insight }) {
  return (
    <div
      data-testid={`anomaly-callout-${insight.id}`}
      style={calloutStyle(insight.status)}
    >
      {/* Title and badge on the same row (R19.3 — badge always present). */}
      <div style={headerRowStyle}>
        <p style={titleStyle}>{insight.title}</p>
        {/* Badge provides the text label so color is not the sole conveyance (R19.5). */}
        <InsightStatusBadge status={insight.status} />
      </div>

      {/* Description below the title row (R19.3 — no fields removed/reordered). */}
      <p style={descriptionStyle}>{insight.description}</p>
    </div>
  );
}

/**
 * Renders all anomaly insights as callout divs. When `insights` is empty,
 * renders only the standard empty-state message with no callout `<div>` elements
 * (Requirement 19.4).
 */
export function AnomaliesCallout({ insights }: AnomaliesCalloutProps) {
  // Empty state — no callout divs rendered at all (Requirement 19.4).
  if (insights.length === 0) {
    return (
      <p
        data-testid="anomalies-callout-empty"
        style={{ margin: 0, fontSize: 13, color: colors.textMuted }}
      >
        No anomalies detected for the selected range.
      </p>
    );
  }

  return (
    <div
      data-testid="anomalies-callout-list"
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
    >
      {insights.map((insight) => (
        <AnomalyCalloutItem key={insight.id} insight={insight} />
      ))}
    </div>
  );
}
