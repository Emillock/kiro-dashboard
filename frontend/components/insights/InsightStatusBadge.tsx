/**
 * InsightStatusBadge — a small presentational badge that conveys an
 * {@link InsightStatus} via a distinct, human-readable text label AND an
 * accessible name, never by color alone (Requirement 13.8 — accessibility).
 *
 * Color is used only to reinforce the meaning; the visible text label and the
 * `aria-label` stand on their own so the status is fully distinguishable by
 * users who cannot perceive color (and by assistive technology).
 *
 * This component is pure and stateless, so it does not require the "use client"
 * directive — it renders identically on the server and the client.
 */

import type { InsightStatus } from "@/lib/insights/types";
import { colors } from "@/styles/theme";

export interface InsightStatusBadgeProps {
  /** The status to convey. */
  status: InsightStatus;
}

/**
 * Per-status presentation. `label` is the visible (and accessible) text shown in
 * the badge; `srLabel` is a longer, fully descriptive accessible name applied via
 * `aria-label` so the meaning is unambiguous to assistive technology. `color` and
 * `background` only reinforce the label and never carry meaning on their own.
 */
const STATUS_PRESENTATION: Record<
  InsightStatus,
  { label: string; srLabel: string; color: string; background: string }
> = {
  ok: {
    label: "OK",
    srLabel: "Status: OK",
    color: colors.textPrimary,
    background: colors.bgElevated,
  },
  increase: {
    label: "Up",
    srLabel: "Trend: increase",
    color: colors.success,
    background: "rgba(63, 185, 80, 0.12)",
  },
  decrease: {
    label: "Down",
    srLabel: "Trend: decrease",
    color: colors.error,
    background: "rgba(248, 81, 73, 0.12)",
  },
  unchanged: {
    label: "No change",
    srLabel: "Trend: no change",
    color: colors.textSecondary,
    background: colors.bgElevated,
  },
  anomaly: {
    label: "Attention",
    srLabel: "Status: needs attention",
    color: colors.warning,
    background: "rgba(210, 153, 34, 0.12)",
  },
  insufficient_data: {
    label: "Insufficient data",
    srLabel: "Status: insufficient data to compute",
    color: colors.textMuted,
    background: colors.bgElevated,
  },
  unavailable: {
    label: "Unavailable",
    srLabel: "Status: unavailable, depends on missing data",
    color: colors.textMuted,
    background: colors.bgElevated,
  },
};

/**
 * Renders a status badge whose meaning is carried by text and an accessible name,
 * with color used only as reinforcement.
 */
export function InsightStatusBadge({ status }: InsightStatusBadgeProps) {
  const { label, srLabel, color, background } = STATUS_PRESENTATION[status];

  return (
    <span
      role="status"
      aria-label={srLabel}
      data-testid={`insight-status-${status}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.4,
        color,
        backgroundColor: background,
        border: `1px solid ${colors.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
