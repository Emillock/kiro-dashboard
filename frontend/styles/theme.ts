/**
 * Kiro IDE-like design tokens.
 * All colours are based on the Kiro dark theme — deep navy backgrounds, violet accents.
 * Import these in Tailwind utilities, inline styles, or Recharts colour props.
 */
export const colors = {
  /** Body / app background */
  bgDeep: "#0d1117",
  /** Sidebar, cards background */
  bgPanel: "#161b22",
  /** Dashboard block / card surface */
  bgCard: "#1c2128",
  /** Elevated surfaces (modals, dropdowns) */
  bgElevated: "#21262d",
  /** Borders and dividers */
  border: "#30363d",
  /** Active / selected border */
  borderActive: "#7c3aed",

  /** Primary text (high contrast) */
  textPrimary: "#e6edf3",
  /** Secondary text (subtitles, captions) */
  textSecondary: "#9aa4af",
  /** Muted text (placeholders, disabled) */
  textMuted: "#7d8590",

  /** Primary accent — violet */
  accent: "#7c3aed",
  /** Accent hover state */
  accentHover: "#6d28d9",
  /** Lighter accent for links, chips */
  accentLight: "#a78bfa",
  /** Accent background glow (5% alpha) */
  accentBg: "rgba(124, 58, 237, 0.08)",

  /** Success / positive trend */
  success: "#3fb950",
  /** Warning */
  warning: "#d29922",
  /** Error / destructive */
  error: "#f85149",

  /** Podium gold (rank 1) */
  gold: "#ffd700",
  /** Podium silver (rank 2) */
  silver: "#c0c0c0",
  /** Podium bronze (rank 3) */
  bronze: "#cd7f32",

  /** Chart palette — ordered for sequential use */
  chart: [
    "#7c3aed",
    "#3fb950",
    "#d29922",
    "#58a6ff",
    "#f85149",
    "#a78bfa",
    "#79c0ff",
    "#56d364",
  ],
} as const;

export const typography = {
  fontFamily:
    "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontMono:
    "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
  fontSizeXs: "11px",
  fontSizeSm: "12px",
  fontSizeBase: "13px",
  fontSizeMd: "14px",
  fontSizeLg: "16px",
  fontSizeXl: "20px",
  fontSizeXxl: "24px",
} as const;

export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  xxl: "32px",
} as const;

export const radii = {
  sm: "4px",
  md: "6px",
  lg: "8px",
  xl: "12px",
} as const;

export const shadows = {
  card: "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
  elevated: "0 4px 12px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4)",
} as const;
