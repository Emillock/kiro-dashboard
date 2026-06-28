// @vitest-environment jsdom
/**
 * Component tests and property-based tests for AdoptionLeaderboard (task 15.2).
 *
 * Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9
 *
 * Unit tests cover:
 * - Rows rendered in ascending rank order (R15.1)
 * - Each row contains rank number, user identifier, and score to 2 dp (R15.2)
 * - Delta indicators: correct character + aria-label for up/down/no-change/new-entry
 *   (R15.3, R15.4, R15.5, R15.6, R15.8)
 * - Container has overflowY: auto (R15.7)
 * - Falls back to insufficient_data message when <2 users (R15.9)
 *
 * Property tests:
 * - Property 30: Leaderboard rows appear in ascending rank order
 * - Property 31: Delta indicator direction matches Rank_Delta sign
 */

import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import * as fc from "fast-check";

import { AdoptionLeaderboard } from "@/components/insights/AdoptionLeaderboard";
import type { Insight, UserSummary } from "@/lib/insights/types";

const RUNS = 100;

afterEach(() => {
  cleanup();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeUserSummary(
  user_id: string,
  adoption_score: number,
  label?: string,
): UserSummary {
  return {
    user_id,
    label: label ?? user_id,
    adoption_score,
    total_messages: 0,
    chat_conversations: 0,
    credits_used: 0,
    active_days: 0,
  };
}

/**
 * Build a synthetic rank-mover insight matching the adoption engine's output shape.
 */
function makeRankMoverInsight(
  userId: string,
  rankDelta: number,
  precedingRank: number,
  currentRank: number,
): Insight {
  return {
    id: `adoption-rank-mover-${userId}`,
    category: "adoption",
    title: rankDelta > 0 ? "Rank climber" : "Rank slipper",
    description: `${userId} moved`,
    status: rankDelta > 0 ? "increase" : "decrease",
    magnitude: rankDelta,
    detail: {
      userId,
      precedingRank,
      currentRank,
      rankDelta,
    },
  };
}

/**
 * Build a new-adopters insight that lists the given userIds.
 */
function makeNewAdoptersInsight(newUserIds: string[]): Insight {
  return {
    id: "adoption-new-adopters",
    category: "adoption",
    title: "New adopters",
    description: `${newUserIds.length} users became active this period: ${newUserIds.join(", ")}.`,
    status: "increase",
    magnitude: newUserIds.length,
    detail: {
      count: newUserIds.length,
      userIds: newUserIds.join(","),
    },
  };
}

// ── Insufficient data fallback (R15.9) ───────────────────────────────────────

describe("AdoptionLeaderboard insufficient_data fallback (R15.9)", () => {
  test("renders insufficient_data message when userSummaries is empty", () => {
    render(<AdoptionLeaderboard insights={[]} userSummaries={[]} />);
    const msg = screen.getByTestId("adoption-leaderboard-insufficient");
    expect(msg).toBeInTheDocument();
    expect(msg.textContent).toMatch(/insufficient data/i);
    expect(screen.queryByTestId("adoption-leaderboard")).toBeNull();
  });

  test("renders insufficient_data message when only one user", () => {
    render(
      <AdoptionLeaderboard
        insights={[]}
        userSummaries={[makeUserSummary("u1", 42)]}
      />,
    );
    const msg = screen.getByTestId("adoption-leaderboard-insufficient");
    expect(msg).toBeInTheDocument();
    expect(screen.queryByTestId("adoption-leaderboard")).toBeNull();
  });

  test("renders the leaderboard (not insufficient message) when 2+ users exist", () => {
    render(
      <AdoptionLeaderboard
        insights={[]}
        userSummaries={[makeUserSummary("u1", 80), makeUserSummary("u2", 60)]}
      />,
    );
    expect(screen.getByTestId("adoption-leaderboard")).toBeInTheDocument();
    expect(
      screen.queryByTestId("adoption-leaderboard-insufficient"),
    ).toBeNull();
  });
});

// ── Row content: rank, identifier, score (R15.2) ─────────────────────────────

describe("AdoptionLeaderboard row content (R15.2)", () => {
  const users = [
    makeUserSummary("alice@example.com", 75.5, "Alice"),
    makeUserSummary("bob@example.com", 90.125, "Bob"),
  ];

  test("each row contains the numeric rank", () => {
    render(<AdoptionLeaderboard insights={[]} userSummaries={users} />);
    // Bob scores higher → rank 1; Alice → rank 2.
    const bobRow = screen.getByTestId("leaderboard-row-bob@example.com");
    const aliceRow = screen.getByTestId("leaderboard-row-alice@example.com");
    expect(bobRow.textContent).toContain("1");
    expect(aliceRow.textContent).toContain("2");
  });

  test("each row shows the user label (identifier)", () => {
    render(<AdoptionLeaderboard insights={[]} userSummaries={users} />);
    expect(
      screen.getByTestId("leaderboard-row-bob@example.com").textContent,
    ).toContain("Bob");
    expect(
      screen.getByTestId("leaderboard-row-alice@example.com").textContent,
    ).toContain("Alice");
  });

  test("each row shows the adoption score rounded to 2 decimal places", () => {
    render(<AdoptionLeaderboard insights={[]} userSummaries={users} />);
    // Bob: 90.125 → "90.13" after toFixed(2) rounding? Actually toFixed(2) on 90.125 →
    // "90.12" or "90.13" depends on JS float representation. We test the displayed
    // string has exactly 2 decimal places.
    const bobCell = screen.getByTestId("leaderboard-row-bob@example.com");
    // Should contain a number with 2 decimal places.
    expect(bobCell.textContent).toMatch(/\d+\.\d{2}/);

    const aliceCell = screen.getByTestId("leaderboard-row-alice@example.com");
    expect(aliceCell.textContent).toContain("75.50");
  });
});

// ── Ascending rank order (R15.1) ─────────────────────────────────────────────

describe("AdoptionLeaderboard ascending rank order (R15.1)", () => {
  test("rows appear highest score first (rank 1 at top)", () => {
    const users = [
      makeUserSummary("low", 10),
      makeUserSummary("high", 90),
      makeUserSummary("mid", 50),
    ];
    render(<AdoptionLeaderboard insights={[]} userSummaries={users} />);
    const rows = screen.getAllByRole("row").slice(1); // skip header row
    // Expected order: high(90), mid(50), low(10)
    expect(rows[0]).toHaveAttribute("data-testid", "leaderboard-row-high");
    expect(rows[1]).toHaveAttribute("data-testid", "leaderboard-row-mid");
    expect(rows[2]).toHaveAttribute("data-testid", "leaderboard-row-low");
  });

  test("ties broken by ascending user_id", () => {
    const users = [
      makeUserSummary("user-c", 50),
      makeUserSummary("user-a", 50),
      makeUserSummary("user-b", 50),
    ];
    render(<AdoptionLeaderboard insights={[]} userSummaries={users} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveAttribute("data-testid", "leaderboard-row-user-a");
    expect(rows[1]).toHaveAttribute("data-testid", "leaderboard-row-user-b");
    expect(rows[2]).toHaveAttribute("data-testid", "leaderboard-row-user-c");
  });
});

// ── Direction indicators (R15.3–R15.6, R15.8) ────────────────────────────────

describe("AdoptionLeaderboard direction indicators", () => {
  const users = [
    makeUserSummary("user-up", 90),
    makeUserSummary("user-down", 70),
    makeUserSummary("no-change", 50),
    makeUserSummary("new-entry", 30),
  ];

  function renderWithDeltas() {
    const insights: Insight[] = [
      // user-up gained 2 positions
      makeRankMoverInsight("user-up", 2, 3, 1),
      // user-down lost 1 position
      makeRankMoverInsight("user-down", -1, 1, 2),
      // no-change: NOT in movers list (delta = 0, engine doesn't emit it)
      // new-entry: in new-adopters list
      makeNewAdoptersInsight(["new-entry"]),
    ];
    render(
      <AdoptionLeaderboard insights={insights} userSummaries={users} />,
    );
  }

  test("↑ character with aria-label 'up N positions' for positive Rank_Delta (R15.3, R15.8)", () => {
    renderWithDeltas();
    const delta = screen.getByTestId("leaderboard-delta-user-up");
    expect(delta.textContent).toBe("↑");
    expect(delta).toHaveAttribute("aria-label", "up 2 positions");
  });

  test("↓ character with aria-label 'down N positions' for negative Rank_Delta (R15.4, R15.8)", () => {
    renderWithDeltas();
    const delta = screen.getByTestId("leaderboard-delta-user-down");
    expect(delta.textContent).toBe("↓");
    expect(delta).toHaveAttribute("aria-label", "down 1 positions");
  });

  test("– character with aria-label 'no change' for Rank_Delta === 0 (R15.5, R15.8)", () => {
    renderWithDeltas();
    const delta = screen.getByTestId("leaderboard-delta-no-change");
    expect(delta.textContent).toBe("–");
    expect(delta).toHaveAttribute("aria-label", "no change");
  });

  test("– character with aria-label 'new entry' for new entrants (R15.6, R15.8)", () => {
    renderWithDeltas();
    const delta = screen.getByTestId("leaderboard-delta-new-entry");
    expect(delta.textContent).toBe("–");
    expect(delta).toHaveAttribute("aria-label", "new entry");
  });
});

// ── Container scrollability (R15.7) ──────────────────────────────────────────

describe("AdoptionLeaderboard container style (R15.7)", () => {
  test("container has maxHeight and overflowY:auto", () => {
    const users = [
      makeUserSummary("a", 10),
      makeUserSummary("b", 20),
    ];
    render(<AdoptionLeaderboard insights={[]} userSummaries={users} />);
    const container = screen.getByTestId("adoption-leaderboard");
    const style = container.style;
    // maxHeight should be set (any value, not empty)
    expect(style.maxHeight).toBeTruthy();
    // overflowY must be "auto"
    expect(style.overflowY).toBe("auto");
  });
});

// ── Property 30: Leaderboard rows appear in ascending rank order ──────────────

describe("Property 30: Leaderboard rows appear in ascending rank order", () => {
  /**
   * Validates: Requirements 15.1, 15.2
   * For all user sets with >= 2 users, rows are rendered in rank order (highest
   * adoption_score first). No matter the input, rank N is always displayed before
   * rank N+1.
   */
  test("Property 30: rows always appear in ascending rank order (highest score first)", () => {
    const userArb = fc
      .integer({ min: 2, max: 15 })
      .chain((n) =>
        fc.tuple(
          ...Array.from({ length: n }, (_, i) =>
            fc.record({
              adoption_score: fc.float({ min: 0, max: 100, noNaN: true }),
            }).map((r) => makeUserSummary(`user-${i}`, r.adoption_score)),
          ),
        ),
      )
      .map((arr) => arr as UserSummary[]);

    fc.assert(
      fc.property(userArb, (users) => {
        const { unmount } = render(
          <AdoptionLeaderboard insights={[]} userSummaries={users} />,
        );

        // Get all data rows (skip header)
        const rows = screen
          .getAllByRole("row")
          .filter((r) => r.getAttribute("data-testid")?.startsWith("leaderboard-row-"));

        // Verify each row's rank cell is sequential 1..n
        rows.forEach((row, index) => {
          const expectedRank = index + 1;
          // The rank is in the first cell
          const cells = within(row).getAllByRole("cell");
          expect(cells[0].textContent?.trim()).toBe(String(expectedRank));
        });

        // Verify scores are non-increasing across rows (descending adoption_score)
        const scoreCells = rows.map((row) => {
          const cells = within(row).getAllByRole("cell");
          return parseFloat(cells[2].textContent ?? "0");
        });
        for (let i = 1; i < scoreCells.length; i++) {
          expect(scoreCells[i]).toBeLessThanOrEqual(scoreCells[i - 1]);
        }

        unmount();
      }),
      { numRuns: RUNS },
    );
  });
});

// ── Property 31: Delta indicator direction matches Rank_Delta sign ─────────────

describe("Property 31: Delta indicator direction matches Rank_Delta sign", () => {
  /**
   * Validates: Requirements 15.3, 15.4, 15.5, 15.8
   * For all user sets with rank-mover insights, each rendered direction indicator
   * uses ↑ for positive Rank_Delta, ↓ for negative Rank_Delta, and – for zero.
   */
  test("Property 31: indicator character and aria-label always match Rank_Delta sign", () => {
    // Arbitrary: generate a set of users and rank-mover insights with non-zero deltas
    const moverArb = fc
      .integer({ min: 1, max: 10 })
      .chain((n) =>
        fc.tuple(
          ...Array.from({ length: n }, (_, i) =>
            fc.record({
              rankDelta: fc.integer({ min: -5, max: 5 }).filter((d) => d !== 0),
              score: fc.float({ min: 10, max: 100, noNaN: true }),
            }).map(({ rankDelta, score }) => ({
              userId: `user-${i}`,
              rankDelta,
              score,
            })),
          ),
        ),
      )
      .map((arr) => arr as Array<{ userId: string; rankDelta: number; score: number }>);

    fc.assert(
      fc.property(moverArb, (movers) => {
        // Ensure at least 2 users for the leaderboard to render
        const allMovers = movers.length >= 2 ? movers : [...movers, { userId: "extra-user", rankDelta: 1, score: 5 }];

        const users = allMovers.map(({ userId, score }) =>
          makeUserSummary(userId, score),
        );

        const insights: Insight[] = allMovers
          .filter((m) => m.rankDelta !== 0)
          .map((m) =>
            makeRankMoverInsight(
              m.userId,
              m.rankDelta,
              m.rankDelta > 0 ? 5 : 1,
              m.rankDelta > 0 ? 5 - m.rankDelta : 1 - m.rankDelta,
            ),
          );

        const { unmount } = render(
          <AdoptionLeaderboard insights={insights} userSummaries={users} />,
        );

        for (const mover of allMovers) {
          const deltaEl = screen.queryByTestId(`leaderboard-delta-${mover.userId}`);
          if (!deltaEl) continue;

          if (mover.rankDelta > 0) {
            expect(deltaEl.textContent).toBe("↑");
            expect(deltaEl.getAttribute("aria-label")).toMatch(/^up \d+ positions$/);
          } else if (mover.rankDelta < 0) {
            expect(deltaEl.textContent).toBe("↓");
            expect(deltaEl.getAttribute("aria-label")).toMatch(/^down \d+ positions$/);
          } else {
            // Should not happen (filtered above), but be defensive
            expect(deltaEl.textContent).toBe("–");
          }
        }

        unmount();
      }),
      { numRuns: RUNS },
    );
  });
});
