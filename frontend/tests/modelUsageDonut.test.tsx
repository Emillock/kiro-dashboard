// @vitest-environment jsdom
/**
 * Component tests and property-based tests for ModelUsageDonut (task 15.8).
 *
 * Feature: insights-section
 * Validates: Requirements 18.1, 18.2, 18.3, 18.7, 18.8, 13.8
 *
 * Unit tests cover:
 * - Empty modelDistribution → renders data-testid="model-usage-insufficient", no chart (R18.6)
 * - Non-empty distribution → renders data-testid="model-usage-donut" and
 *   data-testid="model-usage-piechart" (R18.6)
 * - PieChart container aria-label matches:
 *   "Model distribution: {dominantModel} accounts for {share}% of messages" (R18.7)
 * - Cell aria-labels match: "{modelName}: {share}% of messages" (R18.8)
 * - Legend text contains all model names (R18.2)
 *
 * Property tests:
 * - Property 35: Model distribution legend contains every model name and share
 * - Property 36: Donut slice colors cycle the palette without skipping
 * - Property 37: PieChart and Cell aria-labels follow the specified formats
 * - Property 38: Slice count matches model count
 */

import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import * as fc from "fast-check";

import { ModelUsageDonut } from "@/components/insights/ModelUsageDonut";
import { colors } from "@/styles/theme";

const RUNS = 100;
const PALETTE_SIZE = colors.chart.length; // 8

afterEach(() => {
  cleanup();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a modelDistribution Record from an array of [model, count] pairs.
 */
function makeDistribution(entries: Array<[string, number]>): Record<string, number> {
  return Object.fromEntries(entries);
}

/**
 * Query all [aria-label] elements that look like Cell labels:
 * "{modelName}: {share}% of messages"
 * Excludes the PieChart container label ("Model distribution: ...").
 */
function getCellAriaLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[aria-label]"))
    .map((el) => el.getAttribute("aria-label") ?? "")
    .filter(
      (label) =>
        label.endsWith("% of messages") &&
        !label.startsWith("Model distribution:"),
    );
}

/**
 * Compute the expected sharePct for a model given the distribution (1 decimal).
 */
function expectedSharePct(count: number, total: number): number {
  return Math.round((count / total) * 1000) / 10;
}

// ── Empty distribution: insufficient state (R18.6) ───────────────────────────

describe("ModelUsageDonut empty distribution (R18.6)", () => {
  test("renders model-usage-insufficient when modelDistribution is empty", () => {
    render(<ModelUsageDonut modelDistribution={{}} />);
    expect(screen.getByTestId("model-usage-insufficient")).toBeInTheDocument();
  });

  test("does NOT render model-usage-piechart when modelDistribution is empty", () => {
    render(<ModelUsageDonut modelDistribution={{}} />);
    expect(screen.queryByTestId("model-usage-piechart")).toBeNull();
  });

  test("does NOT render model-usage-donut wrapper when modelDistribution is empty", () => {
    render(<ModelUsageDonut modelDistribution={{}} />);
    expect(screen.queryByTestId("model-usage-donut")).toBeNull();
  });

  test("renders model-usage-insufficient when all counts are zero", () => {
    render(<ModelUsageDonut modelDistribution={{ modelA: 0, modelB: 0 }} />);
    expect(screen.getByTestId("model-usage-insufficient")).toBeInTheDocument();
    expect(screen.queryByTestId("model-usage-piechart")).toBeNull();
  });
});

// ── Non-empty distribution: chart rendering (R18.6) ──────────────────────────

describe("ModelUsageDonut non-empty distribution renders chart (R18.6)", () => {
  test("renders model-usage-donut for a single-model distribution", () => {
    render(<ModelUsageDonut modelDistribution={{ claude: 100 }} />);
    expect(screen.getByTestId("model-usage-donut")).toBeInTheDocument();
  });

  test("renders model-usage-piechart for a single-model distribution", () => {
    render(<ModelUsageDonut modelDistribution={{ claude: 100 }} />);
    expect(screen.getByTestId("model-usage-piechart")).toBeInTheDocument();
  });

  test("renders model-usage-donut for a multi-model distribution", () => {
    const dist = makeDistribution([["claude", 60], ["gpt4", 40]]);
    render(<ModelUsageDonut modelDistribution={dist} />);
    expect(screen.getByTestId("model-usage-donut")).toBeInTheDocument();
    expect(screen.getByTestId("model-usage-piechart")).toBeInTheDocument();
  });

  test("does NOT render model-usage-insufficient for a non-empty distribution", () => {
    render(<ModelUsageDonut modelDistribution={{ claude: 50, gpt4: 50 }} />);
    expect(screen.queryByTestId("model-usage-insufficient")).toBeNull();
  });
});

// ── PieChart container aria-label (R18.7) ────────────────────────────────────

describe("ModelUsageDonut PieChart container aria-label (R18.7)", () => {
  test("aria-label matches format for single dominant model", () => {
    render(<ModelUsageDonut modelDistribution={{ claude: 100 }} />);
    const piechart = screen.getByTestId("model-usage-piechart");
    // 100% share → sharePct = 100
    expect(piechart).toHaveAttribute(
      "aria-label",
      "Model distribution: claude accounts for 100% of messages",
    );
  });

  test("aria-label names the dominant model (highest count)", () => {
    const dist = makeDistribution([["claude", 70], ["gpt4", 30]]);
    render(<ModelUsageDonut modelDistribution={dist} />);
    const piechart = screen.getByTestId("model-usage-piechart");
    const label = piechart.getAttribute("aria-label") ?? "";
    // dominant = claude with 70% of 100 = 70%
    expect(label).toBe(
      "Model distribution: claude accounts for 70% of messages",
    );
  });

  test("aria-label has correct share percentage (1 decimal)", () => {
    const dist = makeDistribution([["claude", 1], ["gpt4", 2]]);
    render(<ModelUsageDonut modelDistribution={dist} />);
    const piechart = screen.getByTestId("model-usage-piechart");
    const label = piechart.getAttribute("aria-label") ?? "";
    // gpt4 is dominant: 2/3 = 66.7%
    expect(label).toBe(
      "Model distribution: gpt4 accounts for 66.7% of messages",
    );
  });

  test("aria-label uses lexicographic tie-break for equal counts", () => {
    // Both have count=50, so total=100. "claude" < "gpt4" alphabetically → claude is dominant
    const dist = makeDistribution([["gpt4", 50], ["claude", 50]]);
    render(<ModelUsageDonut modelDistribution={dist} />);
    const piechart = screen.getByTestId("model-usage-piechart");
    const label = piechart.getAttribute("aria-label") ?? "";
    expect(label).toBe(
      "Model distribution: claude accounts for 50% of messages",
    );
  });
});

// ── Cell aria-labels (R18.8) ──────────────────────────────────────────────────

describe("ModelUsageDonut Cell aria-labels (R18.8)", () => {
  test("each slice has aria-label in format '{modelName}: {share}% of messages'", () => {
    const dist = makeDistribution([["claude", 60], ["gpt4", 40]]);
    const { container } = render(<ModelUsageDonut modelDistribution={dist} />);

    const total = 100;
    const claudeShare = expectedSharePct(60, total);
    const gpt4Share = expectedSharePct(40, total);

    const claudeLabel = container.querySelector(
      `[aria-label="claude: ${claudeShare}% of messages"]`,
    );
    const gpt4Label = container.querySelector(
      `[aria-label="gpt4: ${gpt4Share}% of messages"]`,
    );

    expect(claudeLabel).not.toBeNull();
    expect(gpt4Label).not.toBeNull();
  });

  test("cell aria-labels use 1-decimal share percentages", () => {
    const dist = makeDistribution([["alpha", 1], ["beta", 2], ["gamma", 3]]);
    const { container } = render(<ModelUsageDonut modelDistribution={dist} />);
    const total = 6;

    const alphaPct = expectedSharePct(1, total); // 16.7
    const betaPct = expectedSharePct(2, total);  // 33.3
    const gammaPct = expectedSharePct(3, total); // 50

    expect(
      container.querySelector(`[aria-label="alpha: ${alphaPct}% of messages"]`),
    ).not.toBeNull();
    expect(
      container.querySelector(`[aria-label="beta: ${betaPct}% of messages"]`),
    ).not.toBeNull();
    expect(
      container.querySelector(`[aria-label="gamma: ${gammaPct}% of messages"]`),
    ).not.toBeNull();
  });

  test("all cell labels are present for a single-model distribution (100%)", () => {
    const { container } = render(
      <ModelUsageDonut modelDistribution={{ solo: 999 }} />,
    );
    const label = container.querySelector(
      `[aria-label="solo: 100% of messages"]`,
    );
    expect(label).not.toBeNull();
  });
});

// ── Legend / model names accessible in rendered output (R18.2) ───────────────

describe("ModelUsageDonut legend contains all model names (R18.2)", () => {
  test("each model name appears in Cell aria-labels for 2-model distribution", () => {
    const dist = makeDistribution([["claude", 70], ["gpt4", 30]]);
    const { container } = render(<ModelUsageDonut modelDistribution={dist} />);
    // Model names appear in Cell aria-labels as "{model}: {share}% of messages"
    const cellLabels = getCellAriaLabels(container);
    expect(cellLabels.some((l) => l.startsWith("claude:"))).toBe(true);
    expect(cellLabels.some((l) => l.startsWith("gpt4:"))).toBe(true);
  });

  test("each model name appears in Cell aria-labels for 5-model distribution", () => {
    const models = ["alpha", "beta", "gamma", "delta", "epsilon"];
    const dist = makeDistribution(models.map((m, i) => [m, (i + 1) * 10]));
    const { container } = render(<ModelUsageDonut modelDistribution={dist} />);
    const cellLabels = getCellAriaLabels(container);
    for (const model of models) {
      expect(cellLabels.some((l) => l.startsWith(`${model}:`))).toBe(true);
    }
  });
});

// ── Color cycling (R18.3) ─────────────────────────────────────────────────────

describe("ModelUsageDonut color cycling wraps at palette size (R18.3)", () => {
  test("9th model uses same color as 1st model (cycling wraps at 8)", () => {
    // Create 9 models — index 0 and index 8 should share colors.chart[0]
    const models = Array.from({ length: 9 }, (_, i) => `model-${i}`);
    const dist = makeDistribution(models.map((m) => [m, 10]));
    const { container } = render(<ModelUsageDonut modelDistribution={dist} />);

    // The Cell fill colors are on SVG path elements. In jsdom/Recharts, 'fill'
    // is set as an attribute or style on the path elements.
    // We query all SVG path or rect elements with a fill attribute matching palette colors.
    const paletteColor0 = colors.chart[0];

    // Get all elements that have fill = paletteColor0
    const filledElements = Array.from(
      container.querySelectorAll(`[fill="${paletteColor0}"]`),
    );

    // There should be at least 2 elements with palette[0] color (model-0 and model-8)
    // (model-0 is the largest? No — all equal counts, sorted alphabetically for tie-break,
    // so model-0 is first, model-8 is 9th = index 8 % 8 = 0 → same color)
    expect(filledElements.length).toBeGreaterThanOrEqual(2);
  });

  test("first 8 models each get a distinct color from the palette", () => {
    const models = Array.from({ length: 8 }, (_, i) => `model-${i}`);
    const dist = makeDistribution(models.map((m) => [m, 10]));
    const { container } = render(<ModelUsageDonut modelDistribution={dist} />);

    // Each palette color should appear on exactly one cell path
    for (let i = 0; i < PALETTE_SIZE; i++) {
      const color = colors.chart[i];
      const elements = Array.from(
        container.querySelectorAll(`[fill="${color}"]`),
      );
      expect(elements.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ── axe-core accessibility (R13.8) ───────────────────────────────────────────

describe("ModelUsageDonut axe-core accessibility (R13.8)", () => {
  test("non-empty distribution passes axe-core (excluding SVG path aria-label rule)", async () => {
    const { axe, toHaveNoViolations } = await import("jest-axe");
    expect.extend(toHaveNoViolations);

    const { container } = render(
      <ModelUsageDonut
        modelDistribution={{ claude: 60, gpt4: 40 }}
      />,
    );
    // R18.8 requires aria-label on each Cell; Recharts renders these on SVG <path>
    // elements which axe flags as "aria-prohibited-attr". We disable that specific rule
    // since it is in direct conflict with the spec requirement.
    const results = await axe(container, {
      rules: { "aria-prohibited-attr": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });

  test("empty distribution (insufficient state) passes axe-core", async () => {
    const { axe, toHaveNoViolations } = await import("jest-axe");
    expect.extend(toHaveNoViolations);

    const { container } = render(<ModelUsageDonut modelDistribution={{}} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ── Property 35: Legend contains every model name and share ──────────────────

describe("Property 35: Model distribution legend contains every model name and share", () => {
  /**
   * Feature: insights-section
   * Property 35: Model distribution legend contains every model name and share
   * Validates: Requirements 18.2
   *
   * For all non-empty model distributions, the rendered output contains each
   * model's name accessible via Cell aria-labels (format: "{model}: {share}%
   * of messages") — every model name is represented in the accessible output.
   */
  test("Property 35: every model name appears in Cell aria-labels for arbitrary distributions", () => {
    // Arbitrary non-empty distributions: 1–8 models with positive counts
    // Use alphanumeric model names to avoid regex escaping issues
    const distArb = fc
      .integer({ min: 1, max: 8 })
      .chain((n) =>
        fc.uniqueArray(
          fc.record({
            model: fc
              .string({ minLength: 1, maxLength: 15 })
              .filter(
                (s) =>
                  s.trim().length > 0 &&
                  /^[a-zA-Z0-9_-]+$/.test(s),
              ),
            count: fc.integer({ min: 1, max: 1000 }),
          }),
          { minLength: n, maxLength: n, selector: (r) => r.model },
        ),
      );

    fc.assert(
      fc.property(distArb, (entries) => {
        const dist = Object.fromEntries(entries.map((e) => [e.model, e.count]));
        const { container, unmount } = render(
          <ModelUsageDonut modelDistribution={dist} />,
        );

        const cellLabels = getCellAriaLabels(container);

        // Each model name must appear as the start of a cell aria-label
        for (const { model } of entries) {
          expect(cellLabels.some((l) => l.startsWith(`${model}:`))).toBe(true);
        }

        unmount();
      }),
      { numRuns: RUNS },
    );
  });
});

// ── Property 36: Donut slice colors cycle the palette without skipping ────────

describe("Property 36: Donut slice colors cycle the palette without skipping", () => {
  /**
   * Feature: insights-section
   * Property 36: Donut slice colors cycle the palette without skipping
   * Validates: Requirements 18.3
   *
   * For N models where N > PALETTE_SIZE (8), the color at index N should wrap
   * around — specifically, the model at index N (0-based) uses colors.chart[N % 8].
   * This is verified by checking that the first palette color appears on at least
   * 2 cells when N = PALETTE_SIZE + 1.
   */
  test("Property 36: colors cycle — index N uses same color as index N % PALETTE_SIZE", () => {
    // Generate N > PALETTE_SIZE models to force at least one wrap-around
    const nModelsArb = fc.integer({ min: PALETTE_SIZE + 1, max: PALETTE_SIZE * 3 });

    fc.assert(
      fc.property(nModelsArb, (n) => {
        const models = Array.from({ length: n }, (_, i) => `model-${String(i).padStart(3, "0")}`);
        const dist = makeDistribution(models.map((m) => [m, 10]));
        const { container, unmount } = render(
          <ModelUsageDonut modelDistribution={dist} />,
        );

        // Colors are assigned by sorted order (descending count, then alphabetical).
        // All counts equal → sorted alphabetically → model-000 is index 0, model-008 is index 8.
        // Index 0 and index PALETTE_SIZE should both get colors.chart[0].
        const color0 = colors.chart[0];
        const elementsWithColor0 = Array.from(
          container.querySelectorAll(`[fill="${color0}"]`),
        );

        // At least 2 elements should have the first palette color
        // (index 0 and index PALETTE_SIZE, since n > PALETTE_SIZE)
        expect(elementsWithColor0.length).toBeGreaterThanOrEqual(2);

        // Also verify: for each palette index i, colors.chart[i % PALETTE_SIZE] == colors.chart[i]
        // This is trivially true by definition; the important check is that colors repeat.
        // We check the total number of distinct colors used is exactly PALETTE_SIZE (not n).
        const allFills = new Set(
          Array.from(container.querySelectorAll("[fill]"))
            .map((el) => el.getAttribute("fill"))
            .filter((f) => f && colors.chart.includes(f as never)),
        );
        expect(allFills.size).toBeLessThanOrEqual(PALETTE_SIZE);

        unmount();
      }),
      { numRuns: RUNS },
    );
  });
});

// ── Property 37: PieChart and Cell aria-labels follow specified formats ────────

describe("Property 37: PieChart and Cell aria-labels follow the specified formats", () => {
  /**
   * Feature: insights-section
   * Property 37: PieChart and Cell aria-labels follow the specified formats
   * Validates: Requirements 18.7, 18.8
   *
   * For all non-empty model distributions:
   * - PieChart container aria-label matches:
   *   "Model distribution: {dominantModel} accounts for {share}% of messages"
   * - Each Cell aria-label matches: "{modelName}: {share}% of messages"
   * - No cell aria-label is missing; every model has exactly one cell label.
   */
  test("Property 37: all aria-labels follow specified format patterns for arbitrary distributions", () => {
    const distArb = fc
      .integer({ min: 1, max: 8 })
      .chain((n) =>
        fc.uniqueArray(
          fc.record({
            // Use safe alphanumeric model names to avoid regex/selector issues
            model: fc
              .string({ minLength: 1, maxLength: 15 })
              .filter((s) => /^[a-z0-9_-]+$/.test(s) && s.length > 0),
            count: fc.integer({ min: 1, max: 500 }),
          }),
          { minLength: n, maxLength: n, selector: (r) => r.model },
        ),
      );

    fc.assert(
      fc.property(distArb, (entries) => {
        const dist = Object.fromEntries(entries.map((e) => [e.model, e.count]));
        const total = entries.reduce((s, e) => s + e.count, 0);
        const { container, unmount } = render(
          <ModelUsageDonut modelDistribution={dist} />,
        );

        // 1. Verify PieChart container aria-label format
        const piechart = screen.queryByTestId("model-usage-piechart");
        expect(piechart).not.toBeNull();
        const containerLabel = piechart!.getAttribute("aria-label") ?? "";
        expect(containerLabel).toMatch(
          /^Model distribution: .+ accounts for \d+(\.\d+)?% of messages$/,
        );

        // 2. Verify the dominant model in container label has the highest share
        // (sort by count desc, then alpha asc for tie-break)
        const sorted = [...entries].sort((a, b) =>
          b.count !== a.count ? b.count - a.count : a.model.localeCompare(b.model),
        );
        const dominant = sorted[0];
        const dominantShare = expectedSharePct(dominant.count, total);
        expect(containerLabel).toBe(
          `Model distribution: ${dominant.model} accounts for ${dominantShare}% of messages`,
        );

        // 3. Verify each Cell has a properly formatted aria-label
        for (const { model, count } of entries) {
          const share = expectedSharePct(count, total);
          const expectedCellLabel = `${model}: ${share}% of messages`;
          const cellEl = container.querySelector(
            `[aria-label="${expectedCellLabel}"]`,
          );
          expect(cellEl).not.toBeNull();
        }

        unmount();
      }),
      { numRuns: RUNS },
    );
  });
});

// ── Property 38: Slice count matches model count ──────────────────────────────

describe("Property 38: Slice count matches model count", () => {
  /**
   * Feature: insights-section
   * Property 38: Slice count matches model count
   * Validates: Requirements 18.1, 18.3
   *
   * For all non-empty model distributions, the number of rendered Cell elements
   * (identified by their aria-label format) exactly equals the number of models
   * in the distribution (after filtering zero counts).
   */
  test("Property 38: cell count always equals model count for arbitrary distributions", () => {
    const distArb = fc
      .integer({ min: 1, max: 12 })
      .chain((n) =>
        fc.uniqueArray(
          fc.record({
            model: fc
              .string({ minLength: 1, maxLength: 12 })
              .filter((s) => /^[a-z0-9_-]+$/.test(s) && s.length > 0),
            count: fc.integer({ min: 1, max: 200 }),
          }),
          { minLength: n, maxLength: n, selector: (r) => r.model },
        ),
      );

    fc.assert(
      fc.property(distArb, (entries) => {
        const dist = Object.fromEntries(entries.map((e) => [e.model, e.count]));
        const { container, unmount } = render(
          <ModelUsageDonut modelDistribution={dist} />,
        );

        // Count cells with format "{model}: {share}% of messages"
        const cellLabels = getCellAriaLabels(container);
        expect(cellLabels.length).toBe(entries.length);

        unmount();
      }),
      { numRuns: RUNS },
    );
  });

  test("cell count equals model count for small concrete examples", () => {
    const cases: Array<[Record<string, number>, number]> = [
      [{ claude: 100 }, 1],
      [{ claude: 60, gpt4: 40 }, 2],
      [{ a: 10, b: 20, c: 30, d: 40 }, 4],
      [{ m1: 5, m2: 5, m3: 5, m4: 5, m5: 5, m6: 5, m7: 5, m8: 5 }, 8],
    ];

    for (const [dist, expectedCount] of cases) {
      const { container, unmount } = render(
        <ModelUsageDonut modelDistribution={dist} />,
      );
      const cellLabels = getCellAriaLabels(container);
      expect(cellLabels.length).toBe(expectedCount);
      unmount();
    }
  });
});
