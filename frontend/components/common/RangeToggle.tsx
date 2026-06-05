"use client";

import { colors } from "@/styles/theme";
import type { RangeParam } from "@/lib/api";

const RANGES: { value: RangeParam; label: string }[] = [
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
];

export function RangeToggle({
  range,
  onChange,
}: {
  range: RangeParam;
  onChange: (r: RangeParam) => void;
}) {
  return (
    <div role="group" aria-label="Time range" style={{ display: "flex", gap: 4 }}>
      {RANGES.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          aria-pressed={range === value}
          data-testid={`range-${value}`}
          style={{
            padding: "6px 14px",
            border: `1px solid ${range === value ? colors.accent : colors.border}`,
            borderRadius: 6,
            backgroundColor: range === value ? colors.accentBg : "transparent",
            color: range === value ? colors.accentLight : colors.textSecondary,
            fontSize: 12,
            fontWeight: range === value ? 600 : 400,
            cursor: "pointer",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
