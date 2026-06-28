// @vitest-environment jsdom
/**
 * Component tests and property-based tests for CreditDepletionCard (task 15.12).
 *
 * Validates: Requirements 20.2, 20.3, 20.4, 20.5, 20.6, 13.8
 *
 * Unit tests cover:
 * - Progress bar renders with role="progressbar" for insights with detail.percentConsumed (R20.1)
 * - Progress bar ARIA attributes: aria-valuenow=Math.round(percentConsumed),
 *   aria-valuemin="0", aria-valuemax="100" (R20.5)
 * - Fill color: colors.accent when percentConsumed < 80 (R20.2)
 * - Fill color: colors.error when percentConsumed >= 80 (R20.2)
 * - Threshold is exact: 79 → colors.accent, 80 → colors.error (R20.2)
 * - Unavailable insights render at opacity: 0.5 with textMuted color (R20.3)
 * - unavailableReason text is rendered alongside muted rows (R20.4)
 * - Non-balance insights (no percentConsumed) render as plain text rows without progressbar (R20.6)
 * - Empty insights array renders the empty state (R20)
 * - InsightStatusBadge renders within each row (R13.8)
 *
 * Property tests:
 * - Property 41: Progress bar fill color threshold is exact at 80%
 * - Property 42: Progress bar ARIA attributes reflect exact percentConsumed
 */

import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import * as fc from "fast-check";

import { CreditDepletionCard } from "@/components/insights/CreditDepletionCard";
import type { Insight } from "@/lib/insights/types";
import { colors } from "@/styles/theme";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a CSS hex color (e.g. "#7c3aed") to the rgb() string that jsdom
 * normalises inline styles to (e.g. "rgb(124, 58, 237)").
 */
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

const RGB_ACCENT = hexToRgb(colors.accent);   // fill when percentConsumed < 80
const RGB_ERROR  = hexToRgb(colors.error);    // fill when percentConsumed >= 80
const RGB_TEXT_MUTED = hexToRgb(colors.textMuted);

const RUNS = 100;

afterEach(() => {
  cleanup();
});

/** Build a remaining-balance insight that contains detail.percentConsumed. */
function makeBalanceInsight(
  id: string,
  percentConsumed: number,
  overrides: Partial<Insight> = {},
): Insight {
  return {
    id,
    category: "creditDepletion",
    title: `Balance insight ${id}`,
    description: `${Math.round(100 - percentConsumed)}% remaining.`,
    status: "ok",
    detail: { percentConsumed },
    ...overrides,
  };
}

/** Build a plain-text (non-balance) credit-depletion insight (no percentConsumed). */
function makePlainInsight(
  id: string,
  overrides: Partial<Insight> = {},
): Insight {
  return {
    id,
    category: "creditDepletion",
    title: `Plain insight ${id}`,
    description: `No progress bar for ${id}.`,
    status: "ok",
    ...overrides,
  };
}

/** Build an unavailable insight (optionally with percentConsumed). */
function makeUnavailableInsight(
  id: string,
  reason: string,
  percentConsumed?: number,
): Insight {
  const base: Insight = {
    id,
    category: "creditDepletion",
    title: `Unavailable insight ${id}`,
    description: `Cannot compute ${id}.`,
    status: "unavailable",
    unavailableReason: reason,
  };
  if (percentConsumed !== undefined) {
    base.detail = { percentConsumed };
  }
  return base;
}

// ── Empty state ───────────────────────────────────────────────────────────────

describe("CreditDepletionCard empty state", () => {
  test("renders credit-depletion-empty when insights is empty", () => {
    render(<CreditDepletionCard insights={[]} />);
    expect(screen.getByTestId("credit-depletion-empty")).toBeInTheDocument();
  });

  test("does not render credit-depletion-list when insights is empty", () => {
    render(<CreditDepletionCard insights={[]} />);
    expect(screen.queryByTestId("credit-depletion-list")).toBeNull();
  });

  test("empty state has non-empty text content", () => {
    render(<CreditDepletionCard insights={[]} />);
    const el = screen.getByTestId("credit-depletion-empty");
    expect(el.textContent?.length).toBeGreaterThan(0);
  });
});

// ── Non-empty state: list and row testids ────────────────────────────────────

describe("CreditDepletionCard non-empty state: list container and row testids", () => {
  test("renders credit-depletion-list when insights is non-empty", () => {
    const insights = [makeBalanceInsight("ins-1", 50)];
    render(<CreditDepletionCard insights={insights} />);
    expect(screen.getByTestId("credit-depletion-list")).toBeInTheDocument();
  });

  test("does not render credit-depletion-empty when insights is non-empty", () => {
    const insights = [makeBalanceInsight("ins-1", 50)];
    render(<CreditDepletionCard insights={insights} />);
    expect(screen.queryByTestId("credit-depletion-empty")).toBeNull();
  });

  test("each insight renders a credit-depletion-row-{id} container", () => {
    const insights = [
      makeBalanceInsight("abc", 40),
      makePlainInsight("xyz"),
    ];
    render(<CreditDepletionCard insights={insights} />);
    expect(screen.getByTestId("credit-depletion-row-abc")).toBeInTheDocument();
    expect(screen.getByTestId("credit-depletion-row-xyz")).toBeInTheDocument();
  });
});

// ── Progress bar presence (R20.1) ─────────────────────────────────────────────

describe("CreditDepletionCard progress bar presence (R20.1)", () => {
  test("renders role=progressbar for insight with detail.percentConsumed", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 55)]} />);
    expect(screen.getByTestId("credit-depletion-progressbar")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  test("does NOT render role=progressbar for insight without percentConsumed", () => {
    render(<CreditDepletionCard insights={[makePlainInsight("p1")]} />);
    expect(screen.queryByTestId("credit-depletion-progressbar")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  test("renders fill div credit-depletion-progressbar-fill inside the progressbar", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b2", 60)]} />);
    const progressbar = screen.getByTestId("credit-depletion-progressbar");
    const fill = within(progressbar).getByTestId("credit-depletion-progressbar-fill");
    expect(fill).toBeInTheDocument();
  });

  test("multiple balance insights each render their own progressbar", () => {
    const insights = [
      makeBalanceInsight("b1", 30),
      makeBalanceInsight("b2", 90),
    ];
    render(<CreditDepletionCard insights={insights} />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
  });
});

// ── Progress bar ARIA attributes (R20.5) ─────────────────────────────────────

describe("CreditDepletionCard ARIA attributes on progressbar (R20.5)", () => {
  test("aria-valuemin is 0", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 50)]} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
  });

  test("aria-valuemax is 100", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 50)]} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  test("aria-valuenow equals Math.round(percentConsumed) for a fractional value", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 73.6)]} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", String(Math.round(73.6)));
  });

  test("aria-valuenow equals Math.round(percentConsumed) for an integer value", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 45)]} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "45");
  });

  test("aria-valuenow rounds half-up correctly", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 79.5)]} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", String(Math.round(79.5)));
  });

  test("aria-valuenow equals 0 for percentConsumed = 0", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 0)]} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
  });

  test("aria-valuenow equals 100 for percentConsumed = 100", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 100)]} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
  });
});

// ── Fill color threshold (R20.2) ─────────────────────────────────────────────

describe("CreditDepletionCard fill color threshold (R20.2)", () => {
  function getFillBgColor(container?: HTMLElement): string {
    const fill = container
      ? within(container).getByTestId("credit-depletion-progressbar-fill")
      : screen.getByTestId("credit-depletion-progressbar-fill");
    return fill.style.backgroundColor;
  }

  test("fill is colors.accent (rgb) when percentConsumed = 0 (well below 80)", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 0)]} />);
    expect(getFillBgColor()).toBe(RGB_ACCENT);
  });

  test("fill is colors.accent (rgb) when percentConsumed = 50 (below 80)", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 50)]} />);
    expect(getFillBgColor()).toBe(RGB_ACCENT);
  });

  test("fill is colors.accent (rgb) when percentConsumed = 79 (one below threshold)", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 79)]} />);
    expect(getFillBgColor()).toBe(RGB_ACCENT);
  });

  test("fill is colors.error (rgb) when percentConsumed = 80 (exactly at threshold)", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 80)]} />);
    expect(getFillBgColor()).toBe(RGB_ERROR);
  });

  test("fill is colors.error (rgb) when percentConsumed = 81 (just above threshold)", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 81)]} />);
    expect(getFillBgColor()).toBe(RGB_ERROR);
  });

  test("fill is colors.error (rgb) when percentConsumed = 100", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 100)]} />);
    expect(getFillBgColor()).toBe(RGB_ERROR);
  });

  test("fill is colors.error (rgb) when percentConsumed = 120 (over 100%)", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 120)]} />);
    expect(getFillBgColor()).toBe(RGB_ERROR);
  });
});

// ── Fill width clamping ───────────────────────────────────────────────────────

describe("CreditDepletionCard fill div width clamping", () => {
  function getFillWidth(): string {
    const fill = screen.getByTestId("credit-depletion-progressbar-fill");
    return fill.style.width;
  }

  test("fill width equals percentConsumed% when <= 100", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 60)]} />);
    expect(getFillWidth()).toBe("60%");
  });

  test("fill width is clamped to 100% when percentConsumed > 100", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 150)]} />);
    expect(getFillWidth()).toBe("100%");
  });

  test("fill width is 0% when percentConsumed = 0", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 0)]} />);
    expect(getFillWidth()).toBe("0%");
  });
});

// ── Unavailable insights: opacity and textMuted color (R20.3) ────────────────

describe("CreditDepletionCard unavailable insight styling (R20.3)", () => {
  test("unavailable insight container has opacity: 0.5", () => {
    const insight = makeUnavailableInsight("u1", "per-tier Allowance configuration");
    render(<CreditDepletionCard insights={[insight]} />);
    const row = screen.getByTestId("credit-depletion-row-u1");
    expect(row.style.opacity).toBe("0.5");
  });

  test("unavailable insight container has color: colors.textMuted (as rgb)", () => {
    const insight = makeUnavailableInsight("u1", "per-tier Allowance configuration");
    render(<CreditDepletionCard insights={[insight]} />);
    const row = screen.getByTestId("credit-depletion-row-u1");
    expect(row.style.color).toBe(RGB_TEXT_MUTED);
  });

  test("available insight container does NOT have opacity: 0.5", () => {
    const insight = makeBalanceInsight("b1", 50);
    render(<CreditDepletionCard insights={[insight]} />);
    const row = screen.getByTestId("credit-depletion-row-b1");
    expect(row.style.opacity).not.toBe("0.5");
  });

  test("unavailable insight with percentConsumed still renders a progressbar", () => {
    const insight = makeUnavailableInsight("u2", "missing allowance", 60);
    render(<CreditDepletionCard insights={[insight]} />);
    const row = screen.getByTestId("credit-depletion-row-u2");
    expect(within(row).getByRole("progressbar")).toBeInTheDocument();
    // But the row itself remains muted
    expect(row.style.opacity).toBe("0.5");
  });
});

// ── Unavailable reason text (R20.4) ──────────────────────────────────────────

describe("CreditDepletionCard unavailableReason text (R20.4)", () => {
  test("renders unavailable reason text alongside muted row", () => {
    const insight = makeUnavailableInsight("u1", "per-tier Allowance configuration");
    render(<CreditDepletionCard insights={[insight]} />);
    const reason = screen.getByTestId("credit-depletion-unavailable-reason-u1");
    expect(reason).toBeInTheDocument();
    expect(reason.textContent).toBe("per-tier Allowance configuration");
  });

  test("does NOT render unavailableReason element for available insight", () => {
    const insight = makeBalanceInsight("b1", 50);
    render(<CreditDepletionCard insights={[insight]} />);
    expect(
      screen.queryByTestId("credit-depletion-unavailable-reason-b1"),
    ).toBeNull();
  });

  test("unavailableReason is not rendered when field is absent on unavailable insight", () => {
    const insight: Insight = {
      id: "u-no-reason",
      category: "creditDepletion",
      title: "Unavailable no reason",
      description: "No reason string.",
      status: "unavailable",
      // No unavailableReason field
    };
    render(<CreditDepletionCard insights={[insight]} />);
    expect(
      screen.queryByTestId("credit-depletion-unavailable-reason-u-no-reason"),
    ).toBeNull();
  });
});

// ── Non-balance insights (R20.6) ─────────────────────────────────────────────

describe("CreditDepletionCard non-balance insight rendering (R20.6)", () => {
  test("insight without percentConsumed renders no progressbar", () => {
    render(<CreditDepletionCard insights={[makePlainInsight("p1")]} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  test("insight without percentConsumed still shows title text", () => {
    const insight = makePlainInsight("p1");
    render(<CreditDepletionCard insights={[insight]} />);
    const row = screen.getByTestId("credit-depletion-row-p1");
    expect(row.textContent).toContain(insight.title);
  });

  test("insight without percentConsumed still shows description text", () => {
    const insight = makePlainInsight("p1");
    render(<CreditDepletionCard insights={[insight]} />);
    const row = screen.getByTestId("credit-depletion-row-p1");
    expect(row.textContent).toContain(insight.description);
  });

  test("insight with detail that does NOT include percentConsumed renders no progressbar", () => {
    const insight: Insight = {
      id: "p2",
      category: "creditDepletion",
      title: "Early burner",
      description: "User depleted within 3 days.",
      status: "ok",
      detail: { daysToDepletion: 3 }, // no percentConsumed key
    };
    render(<CreditDepletionCard insights={[insight]} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

// ── InsightStatusBadge presence (R13.8) ──────────────────────────────────────

describe("CreditDepletionCard InsightStatusBadge presence (R13.8)", () => {
  test("InsightStatusBadge renders inside a balance insight row", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("b1", 50)]} />);
    const row = screen.getByTestId("credit-depletion-row-b1");
    expect(within(row).getByTestId("insight-status-ok")).toBeInTheDocument();
  });

  test("InsightStatusBadge renders inside a plain-text insight row", () => {
    render(<CreditDepletionCard insights={[makePlainInsight("p1")]} />);
    const row = screen.getByTestId("credit-depletion-row-p1");
    expect(within(row).getByTestId("insight-status-ok")).toBeInTheDocument();
  });

  test("InsightStatusBadge renders 'unavailable' status for unavailable insights", () => {
    const insight = makeUnavailableInsight("u1", "missing allowance");
    render(<CreditDepletionCard insights={[insight]} />);
    const row = screen.getByTestId("credit-depletion-row-u1");
    expect(
      within(row).getByTestId("insight-status-unavailable"),
    ).toBeInTheDocument();
  });
});

// ── Property 41: Progress bar fill color threshold is exact at 80% ───────────

describe("Property 41: Progress bar fill color threshold is exact at 80%", () => {
  /**
   * Validates: Requirements 20.2
   *
   * For ALL percentConsumed values < 80, fill color is colors.accent.
   * For ALL percentConsumed values >= 80, fill color is colors.error.
   * The boundary is exact at 80 (79.xxx → accent, 80.000 → error).
   */
  test("Property 41: fill color is always colors.accent when percentConsumed < 80", () => {
    const pctArb = fc.float({ min: Math.fround(0), max: Math.fround(79.9), noNaN: true });

    fc.assert(
      fc.property(pctArb, (pct) => {
        const insight = makeBalanceInsight("pbt41a", pct);
        const { unmount } = render(<CreditDepletionCard insights={[insight]} />);

        const fills = screen.getAllByTestId("credit-depletion-progressbar-fill");
        const fill = fills[fills.length - 1];
        expect(fill.style.backgroundColor).toBe(RGB_ACCENT);

        unmount();
      }),
      { numRuns: RUNS },
    );
  });

  test("Property 41: fill color is always colors.error when percentConsumed >= 80", () => {
    // Generate values from 80 up to 200 (clamped in display but color still applies)
    const pctArb = fc.float({ min: Math.fround(80), max: Math.fround(200), noNaN: true });

    fc.assert(
      fc.property(pctArb, (pct) => {
        const insight = makeBalanceInsight("pbt41b", pct);
        const { unmount } = render(<CreditDepletionCard insights={[insight]} />);

        const fills = screen.getAllByTestId("credit-depletion-progressbar-fill");
        const fill = fills[fills.length - 1];
        expect(fill.style.backgroundColor).toBe(RGB_ERROR);

        unmount();
      }),
      { numRuns: RUNS },
    );
  });

  test("Property 41: exact boundary — 79.9999 (< 80) → colors.accent", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("bnd-low", 79.9999)]} />);
    const fill = screen.getByTestId("credit-depletion-progressbar-fill");
    expect(fill.style.backgroundColor).toBe(RGB_ACCENT);
  });

  test("Property 41: exact boundary — 80.0 (>= 80) → colors.error", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("bnd-high", 80.0)]} />);
    const fill = screen.getByTestId("credit-depletion-progressbar-fill");
    expect(fill.style.backgroundColor).toBe(RGB_ERROR);
  });
});

// ── Property 42: Progress bar ARIA attributes reflect exact percentConsumed ───

describe("Property 42: Progress bar ARIA attributes reflect exact percentConsumed", () => {
  /**
   * Validates: Requirements 20.5
   *
   * For ALL arbitrary percentConsumed values, the progressbar element must have:
   * - aria-valuenow === Math.round(percentConsumed)
   * - aria-valuemin === "0"
   * - aria-valuemax === "100"
   */
  test("Property 42: aria-valuenow always equals Math.round(percentConsumed)", () => {
    // Use a wide range including decimals, negatives, and values > 100
    const pctArb = fc.float({ min: Math.fround(-50), max: Math.fround(200), noNaN: true });

    fc.assert(
      fc.property(pctArb, (pct) => {
        const insight = makeBalanceInsight("pbt42", pct);
        const { unmount } = render(<CreditDepletionCard insights={[insight]} />);

        const bars = screen.getAllByRole("progressbar");
        const bar = bars[bars.length - 1];

        expect(bar).toHaveAttribute(
          "aria-valuenow",
          String(Math.round(pct)),
        );

        unmount();
      }),
      { numRuns: RUNS },
    );
  });

  test("Property 42: aria-valuemin is always '0'", () => {
    const pctArb = fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true });

    fc.assert(
      fc.property(pctArb, (pct) => {
        const insight = makeBalanceInsight("pbt42min", pct);
        const { unmount } = render(<CreditDepletionCard insights={[insight]} />);

        const bars = screen.getAllByRole("progressbar");
        const bar = bars[bars.length - 1];
        expect(bar).toHaveAttribute("aria-valuemin", "0");

        unmount();
      }),
      { numRuns: RUNS },
    );
  });

  test("Property 42: aria-valuemax is always '100'", () => {
    const pctArb = fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true });

    fc.assert(
      fc.property(pctArb, (pct) => {
        const insight = makeBalanceInsight("pbt42max", pct);
        const { unmount } = render(<CreditDepletionCard insights={[insight]} />);

        const bars = screen.getAllByRole("progressbar");
        const bar = bars[bars.length - 1];
        expect(bar).toHaveAttribute("aria-valuemax", "100");

        unmount();
      }),
      { numRuns: RUNS },
    );
  });
});
