/**
 * CreditDepletionCard — renders Credit Depletion category insights with
 * progress bars for remaining-balance insights and muted styling for
 * unavailable insights.
 *
 * Requirement 20.1 — render a `<div role="progressbar">` for insights whose
 *   `detail` includes a `percentConsumed` field.
 * Requirement 20.2 — fill color: `colors.accent` (primary) when
 *   `percentConsumed < 80`; `colors.error` when `percentConsumed >= 80`.
 * Requirement 20.3 — `unavailable` insights render at `opacity: 0.5` and
 *   `color: colors.textMuted` on their container element.
 * Requirement 20.4 — `unavailableReason` string renders alongside each muted row.
 * Requirement 20.5 — progressbar ARIA: `aria-valuenow={Math.round(percentConsumed)}`,
 *   `aria-valuemin="0"`, `aria-valuemax="100"`.
 * Requirement 20.6 — insights without `percentConsumed` in `detail` render as
 *   standard text rows with no progress bar.
 */

"use client";

import type { CSSProperties } from "react";
import type { Insight } from "@/lib/insights/types";
import { InsightStatusBadge } from "@/components/insights/InsightStatusBadge";
import { colors } from "@/styles/theme";

export interface CreditDepletionCardProps {
  /** Credit depletion category insights. */
  insights: Insight[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the `percentConsumed` value from an insight's `detail` map, or
 * `undefined` if the field is absent or not a number.
 */
function getPercentConsumed(insight: Insight): number | undefined {
  const raw = insight.detail?.["percentConsumed"];
  if (typeof raw === "number") return raw;
  return undefined;
}

/**
 * Resolves the fill color for the progress bar based on the percent consumed.
 *
 * - `colors.accent` (primary violet) when `percentConsumed < 80` (R20.2)
 * - `colors.error` (red) when `percentConsumed >= 80` (R20.2)
 */
function progressFillColor(percentConsumed: number): string {
  return percentConsumed < 80 ? colors.accent : colors.error;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const rowBaseStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

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

const unavailableReasonStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: colors.textMuted,
};

/** Track (container) for the progress bar. */
const progressTrackStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: 8,
  borderRadius: 4,
  backgroundColor: colors.bgElevated,
  overflow: "hidden",
};

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Renders the ARIA progress bar for a remaining-balance insight.
 *
 * - `role="progressbar"` with the three required ARIA attributes (R20.5).
 * - Inner fill `<div>` width = `Math.min(percentConsumed, 100)%` (R20.1).
 * - Fill color threshold: `colors.accent` when < 80, `colors.error` when ≥ 80
 *   (R20.2).
 */
function ProgressBar({ percentConsumed }: { percentConsumed: number }) {
  const clampedWidth = Math.min(percentConsumed, 100);
  const fillColor = progressFillColor(percentConsumed);

  const fillStyle: CSSProperties = {
    height: "100%",
    width: `${clampedWidth}%`,
    borderRadius: 4,
    backgroundColor: fillColor,
    transition: "width 0.3s ease",
  };

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(percentConsumed)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${Math.round(percentConsumed)}% of allowance consumed`}
      data-testid="credit-depletion-progressbar"
      style={progressTrackStyle}
    >
      <div
        data-testid="credit-depletion-progressbar-fill"
        style={fillStyle}
      />
    </div>
  );
}

/**
 * Renders an insight that has `detail.percentConsumed` — a progress bar row
 * (Requirements 20.1, 20.2, 20.5).
 *
 * If the insight is also `unavailable`, the muted container style still applies
 * (Requirement 20.3) and `unavailableReason` is shown (Requirement 20.4).
 */
function ProgressBarRow({ insight, percentConsumed }: { insight: Insight; percentConsumed: number }) {
  const isUnavailable = insight.status === "unavailable";

  const containerStyle: CSSProperties = {
    ...rowBaseStyle,
    ...(isUnavailable ? { opacity: 0.5, color: colors.textMuted } : {}),
  };

  return (
    <div
      data-testid={`credit-depletion-row-${insight.id}`}
      style={containerStyle}
    >
      <div style={headerRowStyle}>
        <p style={isUnavailable ? { ...titleStyle, color: colors.textMuted } : titleStyle}>
          {insight.title}
        </p>
        <InsightStatusBadge status={insight.status} />
      </div>

      {/* Progress bar (R20.1, R20.5) */}
      <ProgressBar percentConsumed={percentConsumed} />

      {/* Description */}
      <p style={isUnavailable ? unavailableReasonStyle : descriptionStyle}>
        {insight.description}
      </p>

      {/* Unavailable reason (R20.4) — rendered when present */}
      {isUnavailable && insight.unavailableReason && (
        <p
          data-testid={`credit-depletion-unavailable-reason-${insight.id}`}
          style={unavailableReasonStyle}
        >
          {insight.unavailableReason}
        </p>
      )}
    </div>
  );
}

/**
 * Renders an insight WITHOUT `percentConsumed` as a plain text row with no
 * progress bar (Requirement 20.6).
 *
 * `unavailable` insights still receive the muted container treatment
 * (Requirement 20.3) and display `unavailableReason` (Requirement 20.4).
 */
function PlainTextRow({ insight }: { insight: Insight }) {
  const isUnavailable = insight.status === "unavailable";

  const containerStyle: CSSProperties = {
    ...rowBaseStyle,
    ...(isUnavailable ? { opacity: 0.5, color: colors.textMuted } : {}),
  };

  return (
    <div
      data-testid={`credit-depletion-row-${insight.id}`}
      style={containerStyle}
    >
      <div style={headerRowStyle}>
        <p style={isUnavailable ? { ...titleStyle, color: colors.textMuted } : titleStyle}>
          {insight.title}
        </p>
        <InsightStatusBadge status={insight.status} />
      </div>

      <p style={isUnavailable ? unavailableReasonStyle : descriptionStyle}>
        {insight.description}
      </p>

      {/* Unavailable reason (R20.4) — rendered when present */}
      {isUnavailable && insight.unavailableReason && (
        <p
          data-testid={`credit-depletion-unavailable-reason-${insight.id}`}
          style={unavailableReasonStyle}
        >
          {insight.unavailableReason}
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Renders all Credit Depletion insights:
 * - Insights with `detail.percentConsumed` → progress bar row (R20.1).
 * - Insights without `percentConsumed` → plain text row (R20.6).
 * - `unavailable` insights → `opacity: 0.5`, `colors.textMuted`, with
 *   `unavailableReason` visible (R20.3, R20.4).
 *
 * An empty insights array renders an empty-state message.
 */
export function CreditDepletionCard({ insights }: CreditDepletionCardProps) {
  if (insights.length === 0) {
    return (
      <p
        data-testid="credit-depletion-empty"
        style={{ margin: 0, fontSize: 13, color: colors.textMuted }}
      >
        No credit depletion insights for the selected range.
      </p>
    );
  }

  return (
    <ul
      role="list"
      data-testid="credit-depletion-list"
      style={listStyle}
    >
      {insights.map((insight) => {
        const percentConsumed = getPercentConsumed(insight);

        return (
          <li key={insight.id}>
            {percentConsumed !== undefined ? (
              // Remaining-balance insight with progress bar (R20.1)
              <ProgressBarRow insight={insight} percentConsumed={percentConsumed} />
            ) : (
              // Non-balance insight — plain text row, no progress bar (R20.6)
              <PlainTextRow insight={insight} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
