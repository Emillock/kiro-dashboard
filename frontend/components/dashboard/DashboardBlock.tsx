"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock, Unlock } from "lucide-react";
import { colors, radii, shadows } from "@/styles/theme";

interface DashboardBlockProps {
  id: string;
  locked: boolean;
  onToggleLock: () => void;
  children: React.ReactNode;
  title?: string;
}

export function DashboardBlock({
  id,
  locked,
  onToggleLock,
  children,
  title,
}: DashboardBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: locked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`block-${id}`}
    >
      <div
        className="neon-hover"
        style={{
          backgroundColor: colors.bgCard,
          border: `1px solid ${colors.border}`,
          borderRadius: radii.lg,
          boxShadow: shadows.card,
          overflow: "hidden",
        }}
      >
        {/* Block header with drag handle and lock button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: `1px solid ${colors.border}`,
            backgroundColor: colors.bgPanel,
          }}
        >
          <div
            {...(!locked ? { ...attributes, ...listeners } : {})}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flex: 1,
              cursor: locked ? "default" : "grab",
            }}
          >
            <span
              aria-hidden="true"
              style={{ color: colors.textMuted, display: "inline-flex" }}
            >
              <GripVertical size={16} strokeWidth={2} />
            </span>
            {title && (
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary }}>
                {title}
              </span>
            )}
          </div>

          <button
            onClick={onToggleLock}
            aria-label={locked ? `Unlock ${id} block` : `Lock ${id} block`}
            aria-pressed={locked}
            data-testid={`lock-button-${id}`}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              color: locked ? colors.accentLight : colors.textMuted,
              padding: "2px 4px",
            }}
          >
            {locked ? <Lock size={15} strokeWidth={2} /> : <Unlock size={15} strokeWidth={2} />}
          </button>
        </div>

        <div style={{ padding: "14px" }}>{children}</div>
      </div>
    </div>
  );
}
