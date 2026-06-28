// @vitest-environment jsdom
/**
 * Component tests and property-based tests for CreditDepletionCard (task 15.12).
 *
 * Feature: insights-section
 * Validates: Requirements 20.2, 20.3, 20.4, 20.5, 20.6, 13.8
 *
 * Unit tests cover:
 * - Empty insights → data-testid="credit-depletion-empty", no list (R20.1)
 * - Non-empty insights → data-testid="credit-depletion-list" (R20.1)
 * - Insights with detail.percentConsumed → role="progressbar" with correct
 *   ARIA attributes (R20.5)
 * - Fill color boundary: percentConsumed=79 → colors.accent (R20.2)
 * - Fill color boundary: percentConsumed=80 → colors.error (R20.2)
 * - unavailable insights → opacity: 0.5 on the row container (R20.3)
 * - unavailableReason rendered in data-testid="credit-depletion-unavailable-reason-{id}" (R20.4)
 * - Insights without detail.percentConsumed → no role="progressbar" in that row (R20.6)
 * - axe-core accessibility pass (R13.8)
 *
 * Property tests:
 * - Property 41: Progress bar fill color threshold is exact at 80%
 * - Property 42: Progress bar ARIA attributes reflect exact percentConsumed
 */

import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import * as fc from "fast-check";
import { axe, toHaveNoViolations } from "jest-axe";

import { CreditDepletionCard } from "@/components/insights/CreditDepletionCard";
import type { Insight } from "@/lib/insights/types";
import { colors } from "@/styles/theme";

// Register jest-axe matchers with vitest's expect
expect.extend(toHaveNoViolations);

// ── Color helpers ─────────────────────────────────────────────────────────────

/**
 * Convert a CSS hex color (e.g. "#7c3aed") to the rgb() string jsdom
 * normalises inline styles to (e.g. "rgb(124, 58, 237)").
 */
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

const RGB_ACCENT = hexToRgb(colors.accent);  // colors.accent = fill when percentConsumed < 80
const RGB_ERROR = hexToRgb(colors.error);    // colors.error  = fill when percentConsumed >= 80

const RUNS = 100;

afterEach(() => {
  cleanup();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInsight(
  id: string,
  status: Insight["status"] = "ok",
  overrides: Partial<Insight> = {},
): Insight {
  return {
    id,
    category: "creditDepletion",
    title: `Title ${id}`,
    description: `Description for ${id}`,
    status,
    ...overrides,
  };
}

function makeBalanceInsight(
  id: string,
  percentConsumed: number,
  status: Insight["status"] = "ok",
  overrides: Partial<Insight> = {},
): Insight {
  return {
    ...makeInsight(id, status, overrides),
    detail: { percentConsumed },
  };
}

// ── Empty state ───────────────────────────────────────────────────────────────

describe("CreditDepletionCard empty state", () => {
  test("renders credit-depletion-empty when insights array is empty", () => {
    render(<CreditDepletionCard insights={[]} />);
    expect(screen.getByTestId("credit-depletion-empty")).toBeInTheDocument();
  });

  test("does not render credit-depletion-list when insights array is empty", () => {
    render(<CreditDepletionCard insights={[]} />);
    expect(screen.queryByTestId("credit-depletion-list")).toBeNull();
  });

  test("empty state element has meaningful text content", () => {
    render(<CreditDepletionCard insights={[]} />);
    const el = screen.getByTestId("credit-depletion-empty");
    expect(el.textContent?.trim().length).toBeGreaterThan(0);
  });
});

// ── Non-empty state: list container ──────────────────────────────────────────

describe("CreditDepletionCard non-empty state", () => {
  test("renders credit-depletion-list when insights is non-empty", () => {
    render(<CreditDepletionCard insights={[makeInsight("ins-1")]} />);
    expect(screen.getByTestId("credit-depletion-list")).toBeInTheDocument();
  });

  test("does not render credit-depletion-empty when insights is non-empty", () => {
    render(<CreditDepletionCard insights={[makeInsight("ins-1")]} />);
    expect(screen.queryByTestId("credit-depletion-empty")).toBeNull();
  });

  test("renders a row for each insight", () => {
    const insights = [makeInsight("a"), makeInsight("b"), makeInsight("c")];
    render(<CreditDepletionCard insights={insights} />);
    expect(screen.getByTestId("credit-depletion-row-a")).toBeInTheDocument();
    expect(screen.getByTestId("credit-depletion-row-b")).toBeInTheDocument();
    expect(screen.getByTestId("credit-depletion-row-c")).toBeInTheDocument();
  });
});

// ── ARIA attributes on progressbar (R20.5) ───────────────────────────────────

describe("CreditDepletionCard progressbar ARIA attributes (R20.5)", () => {
  test("progressbar has role='progressbar'", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("ins-1", 50)]} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  test("aria-valuenow equals Math.round(percentConsumed) for integer value", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("ins-1", 55)]} />);
    const pb = screen.getByTestId("credit-depletion-progressbar");
    expect(pb.getAttribute("aria-valuenow")).toBe("55");
  });

  test("aria-valuenow rounds fractional percentConsumed", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("ins-1", 55.6)]} />);
    const pb = screen.getByTestId("credit-depletion-progressbar");
    expect(pb.getAttribute("aria-valuenow")).toBe("56");
  });

  test("aria-valuenow rounds down at 0.4", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("ins-1", 30.4)]} />);
    const pb = screen.getByTestId("credit-depletion-progressbar");
    expect(pb.getAttribute("aria-valuenow")).toBe("30");
  });

  test("aria-valuemin is 0", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("ins-1", 50)]} />);
    const pb = screen.getByTestId("credit-depletion-progressbar");
    expect(pb.getAttribute("aria-valuemin")).toBe("0");
  });

  test("aria-valuemax is 100", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("ins-1", 50)]} />);
    const pb = screen.getByTestId("credit-depletion-progressbar");
    expect(pb.getAttribute("aria-valuemax")).toBe("100");
  });

  test("progressbar is present for each balance insight", () => {
    const insights = [
      makeBalanceInsight("a", 20),
      makeBalanceInsight("b", 90),
    ];
    render(<CreditDepletionCard insights={insights} />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
  });
});

// ── Fill color threshold (R20.2) ─────────────────────────────────────────────

describe("CreditDepletionCard fill color threshold at 80% (R20.2)", () => {
  test("fill is colors.accent when percentConsumed = 79 (below threshold)", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("ins-1", 79)]} />);
    const fill = screen.getByTestId("credit-depletion-progressbar-fill");
    expect(fill.style.backgroundColor).toBe(RGB_ACCENT);
  });

  test("fill is colors.error when percentConsumed = 80 (exact threshold)", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("ins-1", 80)]} />);
    const fill = screen.getByTestId("credit-depletion-progressbar-fill");
    expect(fill.style.backgroundColor).toBe(RGB_ERROR);
  });

  test("fill is colors.accent when percentConsumed = 0", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("ins-1", 0)]} />);
    const fill = screen.getByTestId("credit-depletion-progressbar-fill");
    expect(fill.style.backgroundColor).toBe(RGB_ACCENT);
  });

  test("fill is colors.accent when percentConsumed = 79.99", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("ins-1", 79.99)]} />);
    const fill = screen.getByTestId("credit-depletion-progressbar-fill");
    expect(fill.style.backgroundColor).toBe(RGB_ACCENT);
  });

  test("fill is colors.error when percentConsumed = 80.01", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("ins-1", 80.01)]} />);
    const fill = screen.getByTestId("credit-depletion-progressbar-fill");
    expect(fill.style.backgroundColor).toBe(RGB_ERROR);
  });

  test("fill is colors.error when percentConsumed = 100", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("ins-1", 100)]} />);
    const fill = screen.getByTestId("credit-depletion-progressbar-fill");
    expect(fill.style.backgroundColor).toBe(RGB_ERROR);
  });

  test("fill is colors.error when percentConsumed > 100 (clamped width but same color)", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("ins-1", 150)]} />);
    const fill = screen.getByTestId("credit-depletion-progressbar-fill");
    expect(fill.style.backgroundColor).toBe(RGB_ERROR);
  });
});

// ── Progress bar fill width clamped at 100% ───────────────────────────────────

describe("CreditDepletionCard fill width clamping", () => {
  test("fill width is clamped to 100% when percentConsumed > 100", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("ins-1", 150)]} />);
    const fill = screen.getByTestId("credit-depletion-progressbar-fill");
    expect(fill.style.width).toBe("100%");
  });

  test("fill width equals percentConsumed% when percentConsumed <= 100", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("ins-1", 60)]} />);
    const fill = screen.getByTestId("credit-depletion-progressbar-fill");
    expect(fill.style.width).toBe("60%");
  });
});

// ── Unavailable insights: opacity and textMuted (R20.3) ──────────────────────

describe("CreditDepletionCard unavailable insights (R20.3)", () => {
  test("row container has opacity: 0.5 when status is unavailable (balance insight)", () => {
    render(
      <CreditDepletionCard
        insights={[makeBalanceInsight("ins-1", 60, "unavailable")]}
      />,
    );
    const row = screen.getByTestId("credit-depletion-row-ins-1");
    expect(row.style.opacity).toBe("0.5");
  });

  test("row container has opacity: 0.5 when status is unavailable (plain text insight)", () => {
    render(
      <CreditDepletionCard
        insights={[makeInsight("ins-1", "unavailable")]}
      />,
    );
    const row = screen.getByTestId("credit-depletion-row-ins-1");
    expect(row.style.opacity).toBe("0.5");
  });

  test("row container does NOT have opacity: 0.5 when status is ok", () => {
    render(<CreditDepletionCard insights={[makeInsight("ins-1", "ok")]} />);
    const row = screen.getByTestId("credit-depletion-row-ins-1");
    // opacity should be empty string or not 0.5
    expect(row.style.opacity).not.toBe("0.5");
  });

  test("row container does NOT have opacity: 0.5 when status is insufficient_data", () => {
    render(
      <CreditDepletionCard insights={[makeInsight("ins-1", "insufficient_data")]} />,
    );
    const row = screen.getByTestId("credit-depletion-row-ins-1");
    expect(row.style.opacity).not.toBe("0.5");
  });
});

// ── Unavailable reason text (R20.4) ──────────────────────────────────────────

describe("CreditDepletionCard unavailableReason (R20.4)", () => {
  test("renders unavailableReason in correct testid for unavailable balance insight", () => {
    const insight = makeBalanceInsight("ins-1", 50, "unavailable", {
      unavailableReason: "Allowance data not available",
    });
    render(<CreditDepletionCard insights={[insight]} />);
    const reasonEl = screen.getByTestId("credit-depletion-unavailable-reason-ins-1");
    expect(reasonEl).toBeInTheDocument();
    expect(reasonEl.textContent).toBe("Allowance data not available");
  });

  test("renders unavailableReason in correct testid for unavailable plain text insight", () => {
    const insight = makeInsight("ins-2", "unavailable", {
      unavailableReason: "Overage data not yet exposed",
    });
    render(<CreditDepletionCard insights={[insight]} />);
    const reasonEl = screen.getByTestId("credit-depletion-unavailable-reason-ins-2");
    expect(reasonEl).toBeInTheDocument();
    expect(reasonEl.textContent).toBe("Overage data not yet exposed");
  });

  test("does NOT render unavailableReason testid when insight is ok", () => {
    const insight = makeInsight("ins-3", "ok");
    render(<CreditDepletionCard insights={[insight]} />);
    expect(
      screen.queryByTestId("credit-depletion-unavailable-reason-ins-3"),
    ).toBeNull();
  });

  test("does NOT render unavailableReason testid when unavailableReason is absent", () => {
    const insight = makeInsight("ins-4", "unavailable"); // no unavailableReason field
    render(<CreditDepletionCard insights={[insight]} />);
    expect(
      screen.queryByTestId("credit-depletion-unavailable-reason-ins-4"),
    ).toBeNull();
  });
});

// ── Non-balance insights: no progressbar (R20.6) ─────────────────────────────

describe("CreditDepletionCard plain text rows (R20.6)", () => {
  test("no role='progressbar' is rendered for insight without percentConsumed", () => {
    render(<CreditDepletionCard insights={[makeInsight("ins-1")]} />);
    // No progressbar for a plain text insight
    const rows = screen.queryAllByRole("progressbar");
    expect(rows).toHaveLength(0);
  });

  test("insight without percentConsumed renders its title and description", () => {
    const insight = makeInsight("ins-1", "ok", {
      title: "Overage Total",
      description: "No overage this period.",
    });
    render(<CreditDepletionCard insights={[insight]} />);
    const row = screen.getByTestId("credit-depletion-row-ins-1");
    expect(row.textContent).toContain("Overage Total");
    expect(row.textContent).toContain("No overage this period.");
  });

  test("mix of balance and plain text insights renders correct progressbar count", () => {
    const insights = [
      makeBalanceInsight("balance-1", 40),
      makeInsight("plain-1"),
      makeBalanceInsight("balance-2", 90),
      makeInsight("plain-2"),
    ];
    render(<CreditDepletionCard insights={insights} />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
  });
});

// ── InsightStatusBadge presence (R13.8) ──────────────────────────────────────

describe("CreditDepletionCard InsightStatusBadge presence (R13.8)", () => {
  test("renders InsightStatusBadge inside balance insight row", () => {
    render(<CreditDepletionCard insights={[makeBalanceInsight("ins-1", 50, "ok")]} />);
    const row = screen.getByTestId("credit-depletion-row-ins-1");
    expect(within(row).getByTestId("insight-status-ok")).toBeInTheDocument();
  });

  test("renders InsightStatusBadge inside plain text insight row", () => {
    render(<CreditDepletionCard insights={[makeInsight("ins-1", "unavailable")]} />);
    const row = screen.getByTestId("credit-depletion-row-ins-1");
    expect(within(row).getByTestId("insight-status-unavailable")).toBeInTheDocument();
  });
});

// ── axe-core accessibility pass (R13.8) ──────────────────────────────────────

describe("CreditDepletionCard axe-core accessibility", () => {
  test("passes axe for empty state", async () => {
    const { container } = render(<CreditDepletionCard insights={[]} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test("passes axe for balance insights", async () => {
    const insights = [
      makeBalanceInsight("a", 40),
      makeBalanceInsight("b", 85),
    ];
    const { container } = render(<CreditDepletionCard insights={insights} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test("passes axe for unavailable insights with reason", async () => {
    const insights = [
      makeInsight("c", "unavailable", { unavailableReason: "Missing data" }),
    ];
    const { container } = render(<CreditDepletionCard insights={insights} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test("passes axe for mixed balance and plain text insights", async () => {
    const insights = [
      makeBalanceInsight("d", 79),
      makeInsight("e", "ok"),
      makeBalanceInsight("f", 80, "unavailable", {
        unavailableReason: "No allowance config",
      }),
    ];
    const { container } = render(<CreditDepletionCard insights={insights} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ── Property 41: Progress bar fill color threshold is exact at 80% ───────────

describe("Property 41: Progress bar fill color threshold is exact at 80%", () => {
  /**
   * Feature: insights-section
   * Property 41: Progress bar fill color threshold is exact at 80%
   * Validates: Requirements 20.2
   *
   * For any percentConsumed < 80, fill backgroundColor equals colors.accent.
   * For any percentConsumed >= 80, fill backgroundColor equals colors.error.
   * The threshold is exact: 79.999... → accent, 80.000 → error.
   */
  test("Property 41: fill color is colors.accent for all percentConsumed < 80", () => {
    // Generate values strictly below 80 (use fc.double for non-32-bit-constrained max)
    const pctArb = fc.double({ min: 0, max: 79.9999999, noNaN: true }).filter(
      (v) => Number.isFinite(v) && v < 80,
    );

    fc.assert(
      fc.property(pctArb, (pct) => {
        const insight = makeBalanceInsight("pbt41-below", pct);
        const { unmount } = render(
          <CreditDepletionCard insights={[insight]} />,
        );
        const fills = screen.getAllByTestId("credit-depletion-progressbar-fill");
        const fill = fills[fills.length - 1];
        expect(fill.style.backgroundColor).toBe(RGB_ACCENT);
        unmount();
      }),
      { numRuns: RUNS },
    );
  });

  test("Property 41: fill color is colors.error for all percentConsumed >= 80", () => {
    // Generate values at or above 80 (up to a generous 200 to test over-100 case)
    const pctArb = fc.double({ min: 80, max: 200, noNaN: true }).filter(
      (v) => Number.isFinite(v) && v >= 80,
    );

    fc.assert(
      fc.property(pctArb, (pct) => {
        const insight = makeBalanceInsight("pbt41-above", pct);
        const { unmount } = render(
          <CreditDepletionCard insights={[insight]} />,
        );
        const fills = screen.getAllByTestId("credit-depletion-progressbar-fill");
        const fill = fills[fills.length - 1];
        expect(fill.style.backgroundColor).toBe(RGB_ERROR);
        unmount();
      }),
      { numRuns: RUNS },
    );
  });

  test("Property 41: exact boundary — 80.0 is colors.error, values below are colors.accent", () => {
    // Test a range of values straddling 80 to ensure the boundary is sharp
    const belowArb = fc.double({ min: 0, max: 79.999, noNaN: true }).filter(
      (v) => Number.isFinite(v) && v < 80,
    );
    const atOrAboveArb = fc.double({ min: 80, max: 200, noNaN: true }).filter(
      (v) => Number.isFinite(v) && v >= 80,
    );

    fc.assert(
      fc.property(belowArb, (pct) => {
        const insight = makeBalanceInsight("pbt41-straddle-below", pct);
        const { unmount } = render(
          <CreditDepletionCard insights={[insight]} />,
        );
        const fills = screen.getAllByTestId("credit-depletion-progressbar-fill");
        expect(fills[fills.length - 1].style.backgroundColor).toBe(RGB_ACCENT);
        unmount();
      }),
      { numRuns: Math.floor(RUNS / 2) },
    );

    fc.assert(
      fc.property(atOrAboveArb, (pct) => {
        const insight = makeBalanceInsight("pbt41-straddle-above", pct);
        const { unmount } = render(
          <CreditDepletionCard insights={[insight]} />,
        );
        const fills = screen.getAllByTestId("credit-depletion-progressbar-fill");
        expect(fills[fills.length - 1].style.backgroundColor).toBe(RGB_ERROR);
        unmount();
      }),
      { numRuns: Math.floor(RUNS / 2) },
    );
  });
});

// ── Property 42: Progress bar ARIA attributes reflect exact percentConsumed ───

describe("Property 42: Progress bar ARIA attributes reflect exact percentConsumed", () => {
  /**
   * Feature: insights-section
   * Property 42: Progress bar ARIA attributes reflect exact percentConsumed
   * Validates: Requirements 20.5
   *
   * For all numeric percentConsumed values, the progressbar's aria-valuenow
   * equals Math.round(percentConsumed). aria-valuemin is always "0",
   * aria-valuemax is always "100".
   */
  test("Property 42: aria-valuenow always equals Math.round(percentConsumed)", () => {
    const pctArb = fc.double({ min: 0, max: 200, noNaN: true }).filter(
      Number.isFinite,
    );

    fc.assert(
      fc.property(pctArb, (pct) => {
        const insight = makeBalanceInsight("pbt42-id", pct);
        const { unmount } = render(
          <CreditDepletionCard insights={[insight]} />,
        );
        const bars = screen.getAllByTestId("credit-depletion-progressbar");
        const bar = bars[bars.length - 1];
        const expected = String(Math.round(pct));
        expect(bar.getAttribute("aria-valuenow")).toBe(expected);
        unmount();
      }),
      { numRuns: RUNS },
    );
  });

  test("Property 42: aria-valuemin is always '0' regardless of percentConsumed", () => {
    const pctArb = fc.double({ min: 0, max: 200, noNaN: true }).filter(
      Number.isFinite,
    );

    fc.assert(
      fc.property(pctArb, (pct) => {
        const insight = makeBalanceInsight("pbt42-min", pct);
        const { unmount } = render(
          <CreditDepletionCard insights={[insight]} />,
        );
        const bars = screen.getAllByTestId("credit-depletion-progressbar");
        const bar = bars[bars.length - 1];
        expect(bar.getAttribute("aria-valuemin")).toBe("0");
        unmount();
      }),
      { numRuns: RUNS },
    );
  });

  test("Property 42: aria-valuemax is always '100' regardless of percentConsumed", () => {
    const pctArb = fc.double({ min: 0, max: 200, noNaN: true }).filter(
      Number.isFinite,
    );

    fc.assert(
      fc.property(pctArb, (pct) => {
        const insight = makeBalanceInsight("pbt42-max", pct);
        const { unmount } = render(
          <CreditDepletionCard insights={[insight]} />,
        );
        const bars = screen.getAllByTestId("credit-depletion-progressbar");
        const bar = bars[bars.length - 1];
        expect(bar.getAttribute("aria-valuemax")).toBe("100");
        unmount();
      }),
      { numRuns: RUNS },
    );
  });

  test("Property 42: all three ARIA attributes are correct simultaneously", () => {
    const pctArb = fc.double({ min: 0, max: 150, noNaN: true }).filter(
      Number.isFinite,
    );

    fc.assert(
      fc.property(pctArb, (pct) => {
        const insight = makeBalanceInsight("pbt42-all", pct);
        const { unmount } = render(
          <CreditDepletionCard insights={[insight]} />,
        );
        const bars = screen.getAllByTestId("credit-depletion-progressbar");
        const bar = bars[bars.length - 1];
        expect(bar.getAttribute("aria-valuenow")).toBe(String(Math.round(pct)));
        expect(bar.getAttribute("aria-valuemin")).toBe("0");
        expect(bar.getAttribute("aria-valuemax")).toBe("100");
        unmount();
      }),
      { numRuns: RUNS },
    );
  });
});
