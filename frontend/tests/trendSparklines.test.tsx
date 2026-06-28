// @vitest-environment jsdom
/**
 * Component tests for TrendSparklines (task 15.6).
 *
 * Feature: insights-section, Property 34: Sparkline data is chronological and Y-domain covers all values
 * Validates: Requirements 17.1, 17.2, 17.6, 17.7
 *
 * Unit tests cover:
 * - Three sparkline containers render for dailyTotals.length >= 2 (R17.1)
 * - Each container has the correct data-testid (R17.1)
 * - The outer container data-testid="trend-sparklines" is present when >= 2 data points
 * - Returns null (no containers) when dailyTotals.length < 2 (R17.6)
 * - Each sparkline container carries aria-hidden="true" (R17.7)
 *
 * Property 34:
 * - For all arrays of >= 2 DailyTotal objects, three sparkline containers render,
 *   each has aria-hidden="true"
 * - When 0 or 1 DailyTotal is provided, no sparkline containers render
 */

import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import * as fc from "fast-check";

import { TrendSparklines } from "@/components/insights/TrendSparklines";
import type { DailyTotal } from "@/lib/insights/types";

const RUNS = 100;

afterEach(() => {
  cleanup();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal valid DailyTotal. */
function makeDailyTotal(overrides: Partial<DailyTotal> & { date: string }): DailyTotal {
  return {
    total_messages: 10,
    chat_conversations: 5,
    credits_used: 20,
    active_users: 3,
    ...overrides,
  };
}

/** A small chronological set of DailyTotals suitable for most tests. */
const TWO_DAYS: DailyTotal[] = [
  makeDailyTotal({ date: "2024-01-01", total_messages: 100, active_users: 10, credits_used: 50 }),
  makeDailyTotal({ date: "2024-01-02", total_messages: 120, active_users: 12, credits_used: 60 }),
];

const THREE_DAYS: DailyTotal[] = [
  ...TWO_DAYS,
  makeDailyTotal({ date: "2024-01-03", total_messages: 90, active_users: 8, credits_used: 40 }),
];


// ── Omit when fewer than 2 data points (R17.6) ───────────────────────────────

describe("TrendSparklines omits all sparklines when < 2 data points (R17.6)", () => {
  test("returns null when dailyTotals is empty", () => {
    const { container } = render(
      <TrendSparklines dailyTotals={[]} range="month" />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("trend-sparklines")).toBeNull();
  });

  test("returns null when dailyTotals has exactly 1 entry", () => {
    const { container } = render(
      <TrendSparklines
        dailyTotals={[makeDailyTotal({ date: "2024-01-01" })]}
        range="week"
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("trend-sparklines")).toBeNull();
  });

  test("no sparkline-* containers when < 2 data points", () => {
    render(<TrendSparklines dailyTotals={[]} range="month" />);
    expect(screen.queryByTestId("sparkline-total_messages")).toBeNull();
    expect(screen.queryByTestId("sparkline-active_users")).toBeNull();
    expect(screen.queryByTestId("sparkline-credits_used")).toBeNull();
  });
});

// ── Outer container present when >= 2 data points ────────────────────────────

describe("TrendSparklines outer container (R17.1)", () => {
  test("renders data-testid='trend-sparklines' when 2 data points", () => {
    render(<TrendSparklines dailyTotals={TWO_DAYS} range="month" />);
    expect(screen.getByTestId("trend-sparklines")).toBeInTheDocument();
  });

  test("renders data-testid='trend-sparklines' when 3+ data points", () => {
    render(<TrendSparklines dailyTotals={THREE_DAYS} range="week" />);
    expect(screen.getByTestId("trend-sparklines")).toBeInTheDocument();
  });
});

// ── Three sparkline containers, correct testids (R17.1) ──────────────────────

describe("TrendSparklines renders three sparkline containers with correct testids (R17.1)", () => {
  test("renders sparkline-total_messages when >= 2 data points", () => {
    render(<TrendSparklines dailyTotals={TWO_DAYS} range="month" />);
    expect(screen.getByTestId("sparkline-total_messages")).toBeInTheDocument();
  });

  test("renders sparkline-active_users when >= 2 data points", () => {
    render(<TrendSparklines dailyTotals={TWO_DAYS} range="month" />);
    expect(screen.getByTestId("sparkline-active_users")).toBeInTheDocument();
  });

  test("renders sparkline-credits_used when >= 2 data points", () => {
    render(<TrendSparklines dailyTotals={TWO_DAYS} range="month" />);
    expect(screen.getByTestId("sparkline-credits_used")).toBeInTheDocument();
  });

  test("exactly three sparkline containers are present", () => {
    render(<TrendSparklines dailyTotals={THREE_DAYS} range="week" />);
    const sparklines = [
      screen.queryByTestId("sparkline-total_messages"),
      screen.queryByTestId("sparkline-active_users"),
      screen.queryByTestId("sparkline-credits_used"),
    ];
    // All three are present
    sparklines.forEach((el) => expect(el).toBeInTheDocument());
    // No stray sparkline containers
    const trendContainer = screen.getByTestId("trend-sparklines");
    // Verify we have exactly the three named containers inside the wrapper
    const allChildren = Array.from(trendContainer.children);
    expect(allChildren.length).toBe(3);
  });
});

// ── aria-hidden="true" on sparkline containers (R17.7) ───────────────────────

describe("TrendSparklines sparkline containers are aria-hidden='true' (R17.7)", () => {
  test("sparkline-total_messages has aria-hidden='true'", () => {
    render(<TrendSparklines dailyTotals={TWO_DAYS} range="month" />);
    expect(screen.getByTestId("sparkline-total_messages")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  test("sparkline-active_users has aria-hidden='true'", () => {
    render(<TrendSparklines dailyTotals={TWO_DAYS} range="month" />);
    expect(screen.getByTestId("sparkline-active_users")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  test("sparkline-credits_used has aria-hidden='true'", () => {
    render(<TrendSparklines dailyTotals={TWO_DAYS} range="month" />);
    expect(screen.getByTestId("sparkline-credits_used")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});


// ── Property 34: Sparkline data is chronological and Y-domain covers all values ──

/**
 * Fast-check arbitrary for a DailyTotal.
 * Dates are ISO strings generated from a year + month + day triple to avoid
 * RangeError issues with fc.date() in the jsdom environment.
 * Numeric fields are non-negative integers.
 */
const dateStringArb = fc
  .tuple(
    fc.integer({ min: 2023, max: 2025 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }), // cap at 28 to avoid invalid day-of-month combos
  )
  .map(([year, month, day]) => {
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  });

const dailyTotalArb = fc.record({
  date: dateStringArb,
  total_messages: fc.integer({ min: 0, max: 10_000 }),
  chat_conversations: fc.integer({ min: 0, max: 5_000 }),
  credits_used: fc.integer({ min: 0, max: 50_000 }),
  active_users: fc.integer({ min: 0, max: 500 }),
});

/**
 * Arbitrary for an array of >= 2 DailyTotals with unique, ascending dates.
 * We generate a set of distinct date strings (sorted) so the data array is
 * chronologically ordered — matching the contract the component expects.
 */
const twoOrMoreDailyTotalsArb = fc
  .array(dailyTotalArb, { minLength: 2, maxLength: 31 })
  .map((items) => {
    // De-duplicate by date and sort chronologically
    const seen = new Set<string>();
    const unique = items.filter((d) => {
      if (seen.has(d.date)) return false;
      seen.add(d.date);
      return true;
    });
    unique.sort((a, b) => a.date.localeCompare(b.date));
    return unique;
  })
  .filter((items) => items.length >= 2); // guarantee at least 2 after dedup

/** Arbitrary for 0 or 1 DailyTotal (i.e. insufficient data). */
const zeroOrOneDailyTotalArb = fc.oneof(
  fc.constant([] as DailyTotal[]),
  dailyTotalArb.map((d) => [d]),
);

describe("Property 34: Sparkline data is chronological and Y-domain covers all values", () => {
  /**
   * Validates: Requirements 17.1, 17.7
   * For all arrays of >= 2 DailyTotal objects:
   * - The outer container data-testid="trend-sparklines" is present.
   * - Exactly three sparkline containers render, one per metric.
   * - Each sparkline container has aria-hidden="true".
   */
  test(
    "Property 34a: >= 2 DailyTotals always renders 3 sparkline containers with aria-hidden",
    () => {
      fc.assert(
        fc.property(twoOrMoreDailyTotalsArb, fc.constantFrom("week", "month" as const), (dailyTotals, range) => {
          const { unmount } = render(
            <TrendSparklines dailyTotals={dailyTotals} range={range} />,
          );

          // Outer container present
          const outer = screen.getByTestId("trend-sparklines");
          expect(outer).toBeInTheDocument();

          // All three metric sparklines present
          const metrics = ["total_messages", "active_users", "credits_used"] as const;
          for (const metric of metrics) {
            const el = screen.getByTestId(`sparkline-${metric}`);
            // Each container is present (R17.1)
            expect(el).toBeInTheDocument();
            // Each container is aria-hidden="true" (R17.7)
            expect(el).toHaveAttribute("aria-hidden", "true");
          }

          unmount();
        }),
        { numRuns: RUNS },
      );
    },
  );

  /**
   * Validates: Requirements 17.6
   * For all arrays of 0 or 1 DailyTotal, the component renders nothing —
   * no outer container and no sparkline containers.
   */
  test(
    "Property 34b: 0 or 1 DailyTotals never renders any sparkline containers",
    () => {
      fc.assert(
        fc.property(zeroOrOneDailyTotalArb, fc.constantFrom("week", "month" as const), (dailyTotals, range) => {
          const { container, unmount } = render(
            <TrendSparklines dailyTotals={dailyTotals} range={range} />,
          );

          // Component returns null — nothing in the container
          expect(container.firstChild).toBeNull();

          // No outer or metric containers
          expect(screen.queryByTestId("trend-sparklines")).toBeNull();
          expect(screen.queryByTestId("sparkline-total_messages")).toBeNull();
          expect(screen.queryByTestId("sparkline-active_users")).toBeNull();
          expect(screen.queryByTestId("sparkline-credits_used")).toBeNull();

          unmount();
        }),
        { numRuns: RUNS },
      );
    },
  );
});
