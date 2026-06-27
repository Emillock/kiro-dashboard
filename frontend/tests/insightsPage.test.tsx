// @vitest-environment jsdom
/**
 * Component + accessibility tests for the InsightsPage orchestrator (task 15.2).
 *
 * Validates: Requirements 2.4, 2.5, 2.6, 13.4, 13.5, 13.6, 13.7, 13.8
 *  - 2.4  Range defaults to "month"; the Range control reflects the active value.
 *  - 2.5  Exactly seven category Insight_Cards render.
 *  - 2.6  Each card displays a visible heading containing the category name.
 *  - 13.4 Exactly one <h1> page heading; each card title is an <h2> (one level
 *         below the page heading, no skipped levels).
 *  - 13.5 The Range control is keyboard-focusable (its buttons are real
 *         <button>s) with a visible focus path.
 *  - 13.6 Activating the Range control via keyboard/pointer changes the range
 *         without a pointing device requirement.
 *  - 13.7 The Range control is exposed to assistive tech with a non-empty
 *         accessible name and an exposed current value (aria-pressed).
 *  - 13.8 No axe-core accessibility violations (status conveyed via text/aria,
 *         not color alone).
 *
 * The data layer is mocked so the page renders deterministically without
 * network. The real RangeToggle and the real (pure) computeInsights engine are
 * exercised so the test reflects actual card content and the real Range control.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";

import type {
  AggregateMetrics,
  DailyTotal,
  UserSummary,
} from "@/lib/api";

expect.extend(toHaveNoViolations);

// ── Mutable mock state, set per test (mirrors the sidebar test pattern) ──────

interface QueryLike {
  data: unknown;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

let aggregateState: QueryLike;
let usersState: QueryLike;

vi.mock("@/lib/queries", () => ({
  useAggregateMetrics: () => aggregateState,
  useUsers: () => usersState,
  useRefreshInterval: () => false,
}));

// The per-user fan-out is mocked to resolve to an empty array so the engine
// receives a null userMetrics list and degrades gracefully (no network).
vi.mock("@tanstack/react-query", () => ({
  useQueries: () => [],
}));

// getUserMetrics is only referenced inside the (bypassed) useQueries queryFn.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getUserMetrics: vi.fn() };
});

import InsightsPage from "@/app/(dashboard)/insights/page";

// ── Deterministic fixtures ───────────────────────────────────────────────────

const SEVEN_CATEGORIES = [
  "trends",
  "adoption",
  "engagement",
  "modelUsage",
  "costEfficiency",
  "anomalies",
  "creditDepletion",
] as const;

function makeDailyTotals(): DailyTotal[] {
  return Array.from({ length: 30 }, (_, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, "0")}`,
    total_messages: 100 + i * 2,
    chat_conversations: 10 + i,
    credits_used: 50 + i,
    active_users: 5 + (i % 4),
  }));
}

function makeAggregate(): AggregateMetrics {
  const daily = makeDailyTotals();
  return {
    range: "month",
    start_date: "2024-01-01",
    end_date: "2024-01-30",
    total_messages: daily.reduce((s, d) => s + d.total_messages, 0),
    total_chat_conversations: daily.reduce(
      (s, d) => s + d.chat_conversations,
      0,
    ),
    total_credits_used: daily.reduce((s, d) => s + d.credits_used, 0),
    active_user_count: 8,
    avg_messages_per_user: 12.5,
    avg_conversations_per_user: 2.5,
    model_distribution: { "gpt-4": 600, "claude-3": 400, "gpt-3.5": 200 },
    daily_totals: daily,
  };
}

function makeUsers(): UserSummary[] {
  return [
    {
      user_id: "u1",
      label: "User One",
      adoption_score: 82,
      total_messages: 500,
      chat_conversations: 50,
      credits_used: 300,
      active_days: 22,
    },
    {
      user_id: "u2",
      label: "User Two",
      adoption_score: 41,
      total_messages: 200,
      chat_conversations: 20,
      credits_used: 120,
      active_days: 11,
    },
    {
      user_id: "u3",
      label: "User Three",
      adoption_score: 5,
      total_messages: 12,
      chat_conversations: 2,
      credits_used: 8,
      active_days: 2,
    },
  ];
}

beforeEach(() => {
  aggregateState = {
    data: makeAggregate(),
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  };
  usersState = {
    data: { users: makeUsers() },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
});

// ── Default range (R2.4, R13.7) ──────────────────────────────────────────────

describe("InsightsPage default range (R2.4, R13.7)", () => {
  test("defaults to 'month' and reflects it as the pressed Range value", () => {
    render(<InsightsPage />);

    const monthBtn = screen.getByTestId("range-month");
    const weekBtn = screen.getByTestId("range-week");

    // The exposed current value (aria-pressed) reflects "month" by default.
    expect(monthBtn).toHaveAttribute("aria-pressed", "true");
    expect(weekBtn).toHaveAttribute("aria-pressed", "false");
  });
});

// ── Seven cards with category headings (R2.5, R2.6) ──────────────────────────

describe("InsightsPage renders seven category cards (R2.5, R2.6)", () => {
  test("renders exactly seven InsightCards, one per category", () => {
    render(<InsightsPage />);

    for (const category of SEVEN_CATEGORIES) {
      expect(
        screen.getByTestId(`insight-card-${category}`),
      ).toBeInTheDocument();
    }

    // Exactly seven cards — no more, no fewer.
    const cards = screen
      .getAllByTestId(/^insight-card-[a-zA-Z]+$/)
      .filter((el) => /^insight-card-[a-zA-Z]+$/.test(el.dataset.testid ?? ""));
    expect(cards).toHaveLength(7);
  });

  test("each card shows a visible <h2> heading naming its category (R2.6)", () => {
    render(<InsightsPage />);

    const expectedTitles = [
      "Trends",
      "Adoption",
      "Engagement",
      "Model Usage",
      "Cost & Efficiency",
      "Anomalies",
      "Credit Depletion",
    ];

    for (const title of expectedTitles) {
      const heading = screen.getByRole("heading", { level: 2, name: title });
      expect(heading).toBeInTheDocument();
      expect(heading).toBeVisible();
    }
  });
});

// ── Heading structure (R13.4) ─────────────────────────────────────────────────

describe("InsightsPage heading structure (R13.4)", () => {
  test("renders exactly one <h1> 'Insights' and seven <h2> card titles", () => {
    const { container } = render(<InsightsPage />);

    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Insights");

    // Each of the seven card titles is one level below the page heading (h2),
    // with no skipped levels (no h3+ titles used for cards).
    const h2s = container.querySelectorAll("h2");
    expect(h2s).toHaveLength(7);
  });
});

// ── One forced-error card leaves the others rendered (R2.8, R11.5) ───────────

describe("InsightsPage isolates a single failing card (R2.8, R11.5)", () => {
  test("adoption error shows Retry while the other six cards still render", () => {
    // Only the users query (which drives the adoption card) fails; the
    // aggregate query that drives the other six cards resolves normally.
    usersState = {
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
      refetch: vi.fn(),
    };

    render(<InsightsPage />);

    // The adoption card is in its error state with a visible Retry control.
    const adoptionRetry = screen.getByTestId("insight-card-retry-adoption");
    expect(adoptionRetry).toBeInTheDocument();
    expect(adoptionRetry).toBeVisible();
    const adoptionCard = screen.getByTestId("insight-card-adoption");
    expect(within(adoptionCard).getByRole("alert")).toBeInTheDocument();

    // The other six cards still render and are NOT in an error state.
    for (const category of SEVEN_CATEGORIES) {
      if (category === "adoption") continue;
      expect(
        screen.getByTestId(`insight-card-${category}`),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(`insight-card-retry-${category}`),
      ).toBeNull();
    }
  });
});

// ── Range control: keyboard operability + accessible name + value ────────────

describe("InsightsPage Range control accessibility (R13.5, R13.6, R13.7)", () => {
  test("the Range control exposes a non-empty group accessible name (R13.7)", () => {
    render(<InsightsPage />);
    const group = screen.getByRole("group", { name: "Time range" });
    expect(group).toBeInTheDocument();
  });

  test("Range buttons are real <button>s, keyboard-focusable (R13.5)", () => {
    render(<InsightsPage />);
    const weekBtn = screen.getByTestId("range-week");
    const monthBtn = screen.getByTestId("range-month");

    expect(weekBtn.tagName).toBe("BUTTON");
    expect(monthBtn.tagName).toBe("BUTTON");

    // A native <button> is in the tab order and can hold focus.
    weekBtn.focus();
    expect(weekBtn).toHaveFocus();
  });

  test("activating another option updates the exposed pressed value via keyboard (R13.6, R13.7)", async () => {
    const user = userEvent.setup();
    render(<InsightsPage />);

    const weekBtn = screen.getByTestId("range-week");
    const monthBtn = screen.getByTestId("range-month");

    // Initially "month" is the pressed value.
    expect(monthBtn).toHaveAttribute("aria-pressed", "true");
    expect(weekBtn).toHaveAttribute("aria-pressed", "false");

    // Focus and activate "week" with the keyboard (no pointing device).
    weekBtn.focus();
    await user.keyboard("{Enter}");

    // The exposed current value flips to "week".
    expect(screen.getByTestId("range-week")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("range-month")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

// ── axe-core: no accessibility violations (R13.8 and overall) ────────────────

describe("InsightsPage has no axe-core violations (R13.8)", () => {
  test("the rendered page passes an axe accessibility scan", async () => {
    const { container } = render(<InsightsPage />);

    // color-contrast cannot be reliably computed under jsdom (no layout engine),
    // so it is disabled here; the remaining structural/ARIA rules run normally.
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });

    expect(results).toHaveNoViolations();
  });
});
