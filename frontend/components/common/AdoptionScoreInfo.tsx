"use client";

/**
 * AdoptionScoreInfo — an inline "ⓘ" button that reveals how the AI Adoption
 * score is calculated. The formula is built from the live, backend-configured
 * weights (US-METRIC-03 / FR-3.3.1), so it stays accurate if weights are retuned.
 */

import { useEffect, useRef, useState } from "react";
import { useAdoptionWeights } from "@/lib/queries";
import type { AdoptionWeights } from "@/lib/api";
import { colors } from "@/styles/theme";

// Display order + human-readable labels for each weighted metric.
const METRIC_LABELS: { key: keyof AdoptionWeights; label: string }[] = [
  { key: "total_messages", label: "Total Messages" },
  { key: "chat_conversations", label: "Chat Conversations" },
  { key: "credits_used", label: "Credits Used" },
  { key: "active_days", label: "Active Days" },
];

export function AdoptionScoreInfo() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const { data } = useAdoptionWeights();
  const weights = data?.weights;

  // Close the popover on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
      <button
        type="button"
        aria-label="How is the AI Adoption score calculated?"
        aria-expanded={open}
        data-testid="adoption-score-info"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 16,
          height: 16,
          lineHeight: "16px",
          padding: 0,
          borderRadius: "50%",
          border: `1px solid ${colors.border}`,
          backgroundColor: open ? colors.accentBg : "transparent",
          color: open ? colors.accentLight : colors.textSecondary,
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          textAlign: "center",
        }}
      >
        i
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="AI Adoption score explanation"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            zIndex: 50,
            width: 300,
            backgroundColor: colors.bgElevated,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            padding: 14,
            cursor: "default",
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary, margin: "0 0 6px" }}>
            How the AI Adoption score works
          </p>
          <p style={{ fontSize: 12, color: colors.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
            It&apos;s a weighted sum of each user&apos;s activity over the selected period.
            A higher score means heavier Kiro usage. Missing values count as 0.
          </p>

          <ul style={{ listStyle: "none", margin: "0 0 10px", padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {METRIC_LABELS.map(({ key, label }) => (
              <li
                key={key}
                style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: colors.textPrimary }}
              >
                <span>{label}</span>
                <span style={{ color: colors.accentLight, fontWeight: 600 }}>
                  {weights ? `× ${weights[key]}` : "…"}
                </span>
              </li>
            ))}
          </ul>

          <p
            style={{
              fontSize: 11,
              color: colors.textSecondary,
              margin: 0,
              padding: "8px 10px",
              backgroundColor: colors.bgCard,
              borderRadius: 6,
              fontFamily: "var(--font-mono, monospace)",
              lineHeight: 1.5,
            }}
          >
            {weights
              ? `score = ${weights.total_messages}·messages + ${weights.chat_conversations}·conversations + ${weights.credits_used}·credits + ${weights.active_days}·active_days`
              : "Loading weights…"}
          </p>
        </div>
      )}
    </span>
  );
}
