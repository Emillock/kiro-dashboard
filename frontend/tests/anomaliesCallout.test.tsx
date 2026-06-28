// @vitest-environment jsdom
/**
 * Component tests and property-based tests for AnomaliesCallout (task 15.10).
 *
 * Validates: Requirements 19.2, 19.3, 19.4, 19.5
 *
 * Unit tests cover:
 * - Empty insights array renders data-testid="anomalies-callout-empty" and no
 *   callout <div> elements (R19.4)
 * - Non-empty insights array renders data-testid="anomalies-callout-list" (R19.3)
 * - Each insight has a data-testid="anomaly-callout-{id}" div (R19.1, R19.3)
 * - Each callout contains the insight title text (R19.3)
 * - Each callout contains the insight description text (R19.3)
 * - InsightStatusBadge renders inside each callout (R19.3, R19.5)
 * - borderLeft style: colors.error when status === "anomaly" (R19.2)
 * - borderLeft style: colors.warning when status === "decrease" (R19.2)
 *
 * Property tests:
 * - Property 39: Anomaly callout border color matches insight status
 * - Property 40: Anomaly callouts always include title, description, and status badge
 */

import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import * as fc from "fast-check";

import { AnomaliesCallout } from "@/components/insights/AnomaliesCallout";
import type { Insight } from "@/lib/insights/types";
import { colors } from "@/styles/theme";

/**
 * Convert a CSS hex color (e.g. "#f85149") to the rgb() string jsdom
 * normalises inline styles to (e.g. "rgb(248, 81, 73)").
 */
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

const RGB_ERROR = hexToRgb(colors.error);
const RGB_WARNING = hexToRgb(colors.warning);

const RUNS = 100;

afterEach(() => {
  cleanup();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInsight(
  id: string,
  status: Insight["status"],
  title?: string,
  description?: string,
): Insight {
  return {
    id,
    category: "anomalies",
    title: title ?? `Title for ${id}`,
    description: description ?? `Description for ${id}`,
    status,
  };
}

// ── Empty state (R19.4) ───────────────────────────────────────────────────────

describe("AnomaliesCallout empty state (R19.4)", () => {
  test("renders anomalies-callout-empty when insights is empty", () => {
    render(<AnomaliesCallout insights={[]} />);
    expect(
      screen.getByTestId("anomalies-callout-empty"),
    ).toBeInTheDocument();
  });

  test("renders no anomaly-callout-{id} elements when insights is empty", () => {
    render(<AnomaliesCallout insights={[]} />);
    // No list container
    expect(screen.queryByTestId("anomalies-callout-list")).toBeNull();
  });

  test("anomalies-callout-empty has meaningful text content", () => {
    render(<AnomaliesCallout insights={[]} />);
    const emptyEl = screen.getByTestId("anomalies-callout-empty");
    expect(emptyEl.textContent?.length).toBeGreaterThan(0);
  });
});

// ── Non-empty state: list container and per-callout testids (R19.1, R19.3) ────

describe("AnomaliesCallout non-empty rendering (R19.1, R19.3)", () => {
  test("renders anomalies-callout-list when insights is non-empty", () => {
    const insights = [makeInsight("ins-1", "anomaly")];
    render(<AnomaliesCallout insights={insights} />);
    expect(screen.getByTestId("anomalies-callout-list")).toBeInTheDocument();
  });

  test("renders no anomalies-callout-empty when insights is non-empty", () => {
    const insights = [makeInsight("ins-1", "anomaly")];
    render(<AnomaliesCallout insights={insights} />);
    expect(screen.queryByTestId("anomalies-callout-empty")).toBeNull();
  });

  test("each insight has a data-testid='anomaly-callout-{id}' div", () => {
    const insights = [
      makeInsight("abc", "anomaly"),
      makeInsight("xyz", "decrease"),
    ];
    render(<AnomaliesCallout insights={insights} />);
    expect(screen.getByTestId("anomaly-callout-abc")).toBeInTheDocument();
    expect(screen.getByTestId("anomaly-callout-xyz")).toBeInTheDocument();
  });

  test("renders the correct count of callout divs", () => {
    const insights = [
      makeInsight("a", "anomaly"),
      makeInsight("b", "decrease"),
      makeInsight("c", "anomaly"),
    ];
    render(<AnomaliesCallout insights={insights} />);
    // Each callout testid starts with "anomaly-callout-"
    expect(screen.getByTestId("anomaly-callout-a")).toBeInTheDocument();
    expect(screen.getByTestId("anomaly-callout-b")).toBeInTheDocument();
    expect(screen.getByTestId("anomaly-callout-c")).toBeInTheDocument();
  });
});

// ── Callout content: title and description (R19.3) ────────────────────────────

describe("AnomaliesCallout content: title and description (R19.3)", () => {
  test("each callout contains the insight title text", () => {
    const insights = [
      makeInsight("ins-1", "anomaly", "Activity Drop Detected", "Messages dropped 40%."),
      makeInsight("ins-2", "decrease", "Cost Spike", "Credits per message spiked 60%."),
    ];
    render(<AnomaliesCallout insights={insights} />);

    const callout1 = screen.getByTestId("anomaly-callout-ins-1");
    expect(callout1.textContent).toContain("Activity Drop Detected");

    const callout2 = screen.getByTestId("anomaly-callout-ins-2");
    expect(callout2.textContent).toContain("Cost Spike");
  });

  test("each callout contains the insight description text", () => {
    const insights = [
      makeInsight("ins-1", "anomaly", "Title A", "Messages dropped 40%."),
      makeInsight("ins-2", "decrease", "Title B", "Credits per message spiked 60%."),
    ];
    render(<AnomaliesCallout insights={insights} />);

    const callout1 = screen.getByTestId("anomaly-callout-ins-1");
    expect(callout1.textContent).toContain("Messages dropped 40%.");

    const callout2 = screen.getByTestId("anomaly-callout-ins-2");
    expect(callout2.textContent).toContain("Credits per message spiked 60%.");
  });
});

// ── InsightStatusBadge presence (R19.3, R19.5) ───────────────────────────────

describe("AnomaliesCallout InsightStatusBadge presence (R19.3, R19.5)", () => {
  test("InsightStatusBadge renders inside each callout for status=anomaly", () => {
    const insights = [makeInsight("ins-1", "anomaly")];
    render(<AnomaliesCallout insights={insights} />);
    const callout = screen.getByTestId("anomaly-callout-ins-1");
    // InsightStatusBadge renders data-testid="insight-status-{status}"
    const badge = within(callout).getByTestId("insight-status-anomaly");
    expect(badge).toBeInTheDocument();
  });

  test("InsightStatusBadge renders inside each callout for status=decrease", () => {
    const insights = [makeInsight("ins-1", "decrease")];
    render(<AnomaliesCallout insights={insights} />);
    const callout = screen.getByTestId("anomaly-callout-ins-1");
    const badge = within(callout).getByTestId("insight-status-decrease");
    expect(badge).toBeInTheDocument();
  });

  test("badges are present in all callouts for multiple insights", () => {
    const insights = [
      makeInsight("a", "anomaly"),
      makeInsight("b", "decrease"),
      makeInsight("c", "anomaly"),
    ];
    render(<AnomaliesCallout insights={insights} />);

    const calloutA = screen.getByTestId("anomaly-callout-a");
    const calloutB = screen.getByTestId("anomaly-callout-b");
    const calloutC = screen.getByTestId("anomaly-callout-c");

    expect(within(calloutA).getByTestId("insight-status-anomaly")).toBeInTheDocument();
    expect(within(calloutB).getByTestId("insight-status-decrease")).toBeInTheDocument();
    expect(within(calloutC).getByTestId("insight-status-anomaly")).toBeInTheDocument();
  });
});

// ── Border color by status (R19.2) ───────────────────────────────────────────

describe("AnomaliesCallout border color matches status (R19.2)", () => {
  test("callout borderLeft includes colors.error (as rgb) when status === 'anomaly'", () => {
    const insights = [makeInsight("err-1", "anomaly")];
    render(<AnomaliesCallout insights={insights} />);
    const callout = screen.getByTestId("anomaly-callout-err-1");
    const borderLeft = callout.style.borderLeft;
    // jsdom normalises hex colors to rgb() in computed styles
    expect(borderLeft).toContain(RGB_ERROR);
  });

  test("callout borderLeft includes colors.warning (as rgb) when status === 'decrease'", () => {
    const insights = [makeInsight("warn-1", "decrease")];
    render(<AnomaliesCallout insights={insights} />);
    const callout = screen.getByTestId("anomaly-callout-warn-1");
    const borderLeft = callout.style.borderLeft;
    expect(borderLeft).toContain(RGB_WARNING);
  });

  test("anomaly and decrease callouts render distinct border colors", () => {
    const insights = [
      makeInsight("err", "anomaly"),
      makeInsight("warn", "decrease"),
    ];
    render(<AnomaliesCallout insights={insights} />);

    const errCallout = screen.getByTestId("anomaly-callout-err");
    const warnCallout = screen.getByTestId("anomaly-callout-warn");

    expect(errCallout.style.borderLeft).toContain(RGB_ERROR);
    expect(warnCallout.style.borderLeft).toContain(RGB_WARNING);

    // Confirm the two colors are distinct
    expect(RGB_ERROR).not.toBe(RGB_WARNING);
    expect(errCallout.style.borderLeft).not.toBe(warnCallout.style.borderLeft);
  });

  test("borderLeft style includes a width of at least 3px (R19.1)", () => {
    const insights = [makeInsight("ins", "anomaly")];
    render(<AnomaliesCallout insights={insights} />);
    const callout = screen.getByTestId("anomaly-callout-ins");
    const borderLeft = callout.style.borderLeft;
    // The component sets 4px — extract the pixel width from the string
    const match = borderLeft.match(/(\d+)px/);
    expect(match).not.toBeNull();
    const pxWidth = parseInt(match![1], 10);
    expect(pxWidth).toBeGreaterThanOrEqual(3);
  });
});

// ── Property 39: Anomaly callout border color matches insight status ───────────

describe("Property 39: Anomaly callout border color matches insight status", () => {
  /**
   * Validates: Requirements 19.2
   *
   * For all insights with status === "anomaly", the callout's borderLeft style
   * includes colors.error. For all insights with status === "decrease", the
   * callout's borderLeft style includes colors.warning.
   */
  test("Property 39: border color always matches status for anomaly and decrease", () => {
    // Arbitrarily generate mixed arrays of anomaly and decrease insights
    const insightArb = fc
      .integer({ min: 1, max: 10 })
      .chain((n) =>
        fc.array(
          fc.record({
            id: fc.uuid(),
            status: fc.constantFrom("anomaly" as const, "decrease" as const),
            title: fc.string({ minLength: 1, maxLength: 50 }),
            description: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          { minLength: n, maxLength: n },
        ),
      )
      .map((arr) =>
        // Deduplicate ids to avoid test collision
        arr.map((item, i) => ({ ...item, id: `pbt39-insight-${i}` })),
      );

    fc.assert(
      fc.property(insightArb, (rawInsights) => {
        const insights: Insight[] = rawInsights.map((r) => ({
          id: r.id,
          category: "anomalies" as const,
          title: r.title,
          description: r.description,
          status: r.status,
        }));

        const { unmount } = render(<AnomaliesCallout insights={insights} />);

        for (const insight of insights) {
          // Use getAllByTestId to tolerate residual DOM from prior iterations,
          // then check the last rendered element (the one from this render).
          const callouts = screen.getAllByTestId(`anomaly-callout-${insight.id}`);
          const callout = callouts[callouts.length - 1];
          const borderLeft = callout.style.borderLeft;

          if (insight.status === "anomaly") {
            // jsdom normalises hex colors to rgb() in inline styles
            expect(borderLeft).toContain(RGB_ERROR);
          } else if (insight.status === "decrease") {
            expect(borderLeft).toContain(RGB_WARNING);
          }
        }

        unmount();
      }),
      { numRuns: RUNS },
    );
  });
});

// ── Property 40: Anomaly callouts always include title, description, and badge ─

describe("Property 40: Anomaly callouts always include title, description, and status badge", () => {
  /**
   * Validates: Requirements 19.3, 19.5
   *
   * For all non-empty insight arrays, every callout div must contain the insight's
   * title text, description text, and an InsightStatusBadge element.
   */
  test("Property 40: every callout always contains title, description, and InsightStatusBadge", () => {
    const insightArb = fc
      .integer({ min: 1, max: 10 })
      .chain((n) =>
        fc.array(
          fc.record({
            status: fc.constantFrom(
              "anomaly" as const,
              "decrease" as const,
              "ok" as const,
              "increase" as const,
            ),
            title: fc.string({ minLength: 1, maxLength: 60 }),
            description: fc.string({ minLength: 1, maxLength: 120 }),
          }),
          { minLength: n, maxLength: n },
        ),
      )
      .map((arr) =>
        arr.map((item, i) => ({ ...item, id: `pbt40-insight-${i}` })),
      );

    fc.assert(
      fc.property(insightArb, (rawInsights) => {
        const insights: Insight[] = rawInsights.map((r) => ({
          id: r.id,
          category: "anomalies" as const,
          title: r.title,
          description: r.description,
          status: r.status,
        }));

        const { unmount } = render(<AnomaliesCallout insights={insights} />);

        for (const insight of insights) {
          const callouts = screen.getAllByTestId(`anomaly-callout-${insight.id}`);
          const callout = callouts[callouts.length - 1];

          // Title must be present
          expect(callout.textContent).toContain(insight.title);

          // Description must be present
          expect(callout.textContent).toContain(insight.description);

          // InsightStatusBadge must be present inside the callout
          // The badge renders with data-testid="insight-status-{status}"
          const badge = within(callout).getByTestId(
            `insight-status-${insight.status}`,
          );
          expect(badge).toBeInTheDocument();
        }

        unmount();
      }),
      { numRuns: RUNS },
    );
  });

  test("Property 40: non-empty insight arrays always render the list container (never empty state)", () => {
    const nonEmptyInsightsArb = fc
      .array(
        fc.record({
          status: fc.constantFrom("anomaly" as const, "decrease" as const),
          title: fc.string({ minLength: 1, maxLength: 60 }),
          description: fc.string({ minLength: 1, maxLength: 120 }),
        }),
        { minLength: 1, maxLength: 10 },
      )
      .map((arr) =>
        arr.map((item, i) => ({ ...item, id: `pbt40b-insight-${i}` })),
      );

    fc.assert(
      fc.property(nonEmptyInsightsArb, (rawInsights) => {
        const insights: Insight[] = rawInsights.map((r) => ({
          id: r.id,
          category: "anomalies" as const,
          title: r.title,
          description: r.description,
          status: r.status,
        }));

        const { unmount } = render(<AnomaliesCallout insights={insights} />);

        // Non-empty → list container present, empty state absent
        const lists = screen.getAllByTestId("anomalies-callout-list");
        expect(lists[lists.length - 1]).toBeInTheDocument();
        expect(screen.queryByTestId("anomalies-callout-empty")).toBeNull();

        unmount();
      }),
      { numRuns: RUNS },
    );
  });
});
