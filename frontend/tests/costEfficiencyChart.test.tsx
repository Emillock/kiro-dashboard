// @vitest-environment jsdom
/**
 * Component tests and property-based tests for CostEfficiencyChart (task 15.4).
 *
 * Feature: insights-section
 * Validates: Requirements 16.1, 16.2, 16.3, 16.7, 7.3
 *
 * Unit tests cover:
 * - Renders BarChart wrapper (data-testid="cost-efficiency-chart") when ≥2 users (R16.1)
 * - Falls back to plain text list when <2 users (0 or 1) (R16.5)
 * - Each bar entry has aria-label in format "{userId}: {creditEfficiency} credits per message" (R16.7)
 * - XAxis label "Credits per Message" is present in DOM (R16.6)
 *
 * Property tests:
 * - Property 32: Bar count and order match engine high-cost users
 * - Property 33: Bar aria-labels follow the specified format
 */

import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import * as fc from "fast-check";

import { CostEfficiencyChart } from "@/components/insights/CostEfficiencyChart";

const RUNS = 100;

afterEach(() => {
  cleanup();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(userId: string, creditEfficiency: number) {
  return { userId, creditEfficiency };
}

/**
 * Retrieve all list items from the accessible bar list.
 * The component renders a visually-hidden <ul data-testid="cost-efficiency-bar-list">
 * with one <li aria-label="..."> per bar (Requirement 16.7).
 */
function getBarAriaLabels(container: HTMLElement): string[] {
  const list = container.querySelector('[data-testid="cost-efficiency-bar-list"]');
  if (!list) return [];
  return Array.from(list.querySelectorAll("li[aria-label]")).map(
    (el) => el.getAttribute("aria-label") ?? "",
  );
}

// ── Fallback rendering when <2 users (R16.5) ─────────────────────────────────

describe("CostEfficiencyChart fallback when < 2 users (R16.5)", () => {
  test("renders 'no high-cost users' message when array is empty", () => {
    render(<CostEfficiencyChart highCostUsers={[]} />);
    expect(screen.getByText(/no high-cost users/i)).toBeInTheDocument();
    // No chart wrapper present
    expect(screen.queryByTestId("cost-efficiency-chart")).toBeNull();
  });

  test("renders plain list (not chart) when exactly 1 user", () => {
    const { container } = render(
      <CostEfficiencyChart highCostUsers={[makeUser("alice", 3.5)]} />,
    );
    // Should render a list, not the chart
    const list = container.querySelector("ul");
    expect(list).not.toBeNull();
    // Chart wrapper should NOT be rendered for 1 user
    expect(screen.queryByTestId("cost-efficiency-chart")).toBeNull();
  });

  test("renders the single user's info in fallback list", () => {
    render(
      <CostEfficiencyChart highCostUsers={[makeUser("bob@example.com", 7.25)]} />,
    );
    // The user identifier and value should appear in the DOM
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.getByText(/7\.25/)).toBeInTheDocument();
  });
});

// ── Chart rendering when ≥2 users (R16.1) ─────────────────────────────────────

describe("CostEfficiencyChart renders chart when ≥2 users (R16.1)", () => {
  test("renders cost-efficiency-chart wrapper (not fallback list) for 2 users", () => {
    const { container } = render(
      <CostEfficiencyChart
        highCostUsers={[makeUser("alice", 5.0), makeUser("bob", 3.2)]}
      />,
    );
    // Chart wrapper present
    expect(screen.getByTestId("cost-efficiency-chart")).toBeInTheDocument();
    // No plain fallback list (plain fallback uses aria-label="High-cost users")
    const fallbackList = container.querySelector("ul[aria-label='High-cost users']");
    expect(fallbackList).toBeNull();
  });

  test("renders chart wrapper for 10 users", () => {
    const users = Array.from({ length: 10 }, (_, i) =>
      makeUser(`user-${i}`, 10 - i),
    );
    render(<CostEfficiencyChart highCostUsers={users} />);
    expect(screen.getByTestId("cost-efficiency-chart")).toBeInTheDocument();
  });

  test("accessible bar list is present for 2 users", () => {
    const { container } = render(
      <CostEfficiencyChart
        highCostUsers={[makeUser("alice", 5.0), makeUser("bob", 3.2)]}
      />,
    );
    const barList = container.querySelector('[data-testid="cost-efficiency-bar-list"]');
    expect(barList).not.toBeNull();
    const items = barList!.querySelectorAll("li");
    expect(items.length).toBe(2);
  });
});

// ── XAxis label "Credits per Message" (R16.6) ────────────────────────────────

describe("CostEfficiencyChart XAxis label (R16.6)", () => {
  test("renders 'Credits per Message' text label when ≥2 users", () => {
    const { container } = render(
      <CostEfficiencyChart
        highCostUsers={[
          makeUser("user-a", 4.5),
          makeUser("user-b", 2.1),
        ]}
      />,
    );
    // The label is rendered as an SVG text element by Recharts
    const svgTexts = Array.from(container.querySelectorAll("text"));
    const labelNode = svgTexts.find(
      (el) => el.textContent === "Credits per Message",
    );
    expect(labelNode).toBeDefined();
  });
});

// ── Cell aria-labels via accessible bar list (R16.7) ─────────────────────────

describe("CostEfficiencyChart Cell aria-labels (R16.7)", () => {
  test("each bar entry has aria-label in format '{userId}: {creditEfficiency} credits per message'", () => {
    const users = [
      makeUser("alice@corp.com", 3.5),
      makeUser("bob@corp.com", 7.0),
    ];
    const { container } = render(<CostEfficiencyChart highCostUsers={users} />);

    for (const { userId, creditEfficiency } of users) {
      const expectedLabel = `${userId}: ${creditEfficiency} credits per message`;
      const el = container.querySelector(`[aria-label="${expectedLabel}"]`);
      expect(el).not.toBeNull();
    }
  });

  test("aria-labels use exact numeric values (no rounding by component)", () => {
    const users = [
      makeUser("precise-user", 3.14),
      makeUser("another-user", 0.01),
    ];
    const { container } = render(<CostEfficiencyChart highCostUsers={users} />);
    for (const { userId, creditEfficiency } of users) {
      const el = container.querySelector(
        `[aria-label="${userId}: ${creditEfficiency} credits per message"]`,
      );
      expect(el).not.toBeNull();
    }
  });
});

// ── Property 32: Bar count and order match engine high-cost users ──────────────

describe("Property 32: Bar count and order match engine high-cost users", () => {
  /**
   * Feature: insights-section
   * Property 32: Bar count and order match engine high-cost users
   * Validates: Requirements 16.1, 7.3
   *
   * For all arrays of ≥2 high-cost users (capped at 10 by the engine), the number
   * of rendered bar entries equals the array length, and they appear in the given order.
   */
  test("Property 32: rendered bar count equals input length for all valid inputs", () => {
    // Generate arrays of 2..10 unique users with descending creditEfficiency
    const highCostUsersArb = fc
      .integer({ min: 2, max: 10 })
      .chain((n) =>
        fc
          .uniqueArray(
            fc.record({
              userId: fc.string({ minLength: 1, maxLength: 20 }).filter(
                (s) => !s.includes('"') && !s.includes("\\") && s.trim().length > 0,
              ),
              // Use Math.fround to satisfy fast-check v4 32-bit float constraint
              creditEfficiency: fc
                .integer({ min: 1, max: 10000 })
                .map((n) => Math.round(n) / 100),
            }),
            { minLength: n, maxLength: n, selector: (r) => r.userId },
          )
          // Sort descending by creditEfficiency to match engine output contract
          .map((arr) =>
            [...arr].sort((a, b) => b.creditEfficiency - a.creditEfficiency),
          ),
      );

    fc.assert(
      fc.property(highCostUsersArb, (users) => {
        const { container, unmount } = render(
          <CostEfficiencyChart highCostUsers={users} />,
        );

        // Chart must render (not fallback) — use container to avoid multi-element error
        const chartWrapper = container.querySelector('[data-testid="cost-efficiency-chart"]');
        expect(chartWrapper).not.toBeNull();

        // Count items in the accessible bar list
        const labels = getBarAriaLabels(container);
        expect(labels.length).toBe(users.length);

        // Verify each expected aria-label is present
        for (const { userId, creditEfficiency } of users) {
          const expectedLabel = `${userId}: ${creditEfficiency} credits per message`;
          // Use the accessible list instead of querySelector (avoids CSS escaping issues)
          const found = labels.includes(expectedLabel);
          expect(found).toBe(true);
        }

        unmount();
      }),
      { numRuns: RUNS },
    );
  });

  test("Property 32: rendered bars appear in the same order as the input array", () => {
    const highCostUsersArb = fc
      .integer({ min: 2, max: 10 })
      .chain((n) =>
        fc
          .uniqueArray(
            fc.record({
              userId: fc.string({ minLength: 1, maxLength: 20 }).filter(
                (s) => !s.includes('"') && !s.includes("\\") && s.trim().length > 0,
              ),
              creditEfficiency: fc
                .integer({ min: 1, max: 10000 })
                .map((n) => Math.round(n) / 100),
            }),
            { minLength: n, maxLength: n, selector: (r) => r.userId },
          )
          .map((arr) =>
            [...arr].sort((a, b) => b.creditEfficiency - a.creditEfficiency),
          ),
      );

    fc.assert(
      fc.property(highCostUsersArb, (users) => {
        const { container, unmount } = render(
          <CostEfficiencyChart highCostUsers={users} />,
        );

        // Collect all matching aria-label li elements in DOM order
        const labels = getBarAriaLabels(container);

        // Each label should correspond to the input user at that index
        labels.forEach((label, index) => {
          const { userId, creditEfficiency } = users[index];
          expect(label).toBe(
            `${userId}: ${creditEfficiency} credits per message`,
          );
        });

        unmount();
      }),
      { numRuns: RUNS },
    );
  });
});

// ── Property 33: Bar aria-labels follow the specified format ──────────────────

describe("Property 33: Bar aria-labels follow the specified format", () => {
  /**
   * Feature: insights-section
   * Property 33: Bar aria-labels follow the specified format
   * Validates: Requirements 16.7
   *
   * For all valid userId/creditEfficiency pairs, each bar's aria-label exactly
   * matches the format "{userId}: {creditEfficiency} credits per message".
   * No truncation, rounding, or reformatting occurs.
   */
  test("Property 33: every bar aria-label exactly matches format for arbitrary inputs", () => {
    // Generate 2..10 users with safe userId strings and non-negative efficiencies
    const highCostUsersArb = fc
      .integer({ min: 2, max: 10 })
      .chain((n) =>
        fc.uniqueArray(
          fc.record({
            userId: fc
              .string({ minLength: 1, maxLength: 30 })
              .filter(
                (s) =>
                  !s.includes('"') &&
                  !s.includes("\\") &&
                  !s.includes("\n") &&
                  !s.includes("\r") &&
                  s.trim().length > 0,
              ),
            creditEfficiency: fc
              .integer({ min: 0, max: 50000 })
              .map((n) => n / 100),
          }),
          { minLength: n, maxLength: n, selector: (r) => r.userId },
        ),
      );

    fc.assert(
      fc.property(highCostUsersArb, (users) => {
        const { container, unmount } = render(
          <CostEfficiencyChart highCostUsers={users} />,
        );

        // Use the accessible bar list for matching — avoids CSS escaping issues with
        // special characters in userId strings.
        const labels = getBarAriaLabels(container);

        for (const { userId, creditEfficiency } of users) {
          const expectedLabel = `${userId}: ${creditEfficiency} credits per message`;
          // Every user must have an exactly-matching aria-label in the list
          expect(labels).toContain(expectedLabel);
        }

        unmount();
      }),
      { numRuns: RUNS },
    );
  });

  test("Property 33: aria-label format holds for edge-case efficiency values (0, integers, decimals)", () => {
    const edgeCases = [
      makeUser("user-zero", 0),
      makeUser("user-int", 5),
      makeUser("user-decimal", 3.14),
      makeUser("user-large", 999.99),
    ];

    // Test subsets of ≥2 users at a time
    const pairs = [
      [edgeCases[0], edgeCases[1]],
      [edgeCases[1], edgeCases[2]],
      [edgeCases[2], edgeCases[3]],
      [edgeCases[0], edgeCases[3]],
    ];

    for (const subset of pairs) {
      const { container, unmount } = render(
        <CostEfficiencyChart highCostUsers={subset} />,
      );
      const labels = getBarAriaLabels(container);
      for (const { userId, creditEfficiency } of subset) {
        const expectedLabel = `${userId}: ${creditEfficiency} credits per message`;
        expect(labels).toContain(expectedLabel);
      }
      unmount();
    }
  });
});
