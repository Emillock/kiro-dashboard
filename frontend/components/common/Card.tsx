import { CSSProperties } from "react";
import { colors, radii, shadows } from "@/styles/theme";

export function Card({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        backgroundColor: colors.bgCard,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.lg,
        boxShadow: shadows.card,
        padding: "16px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
