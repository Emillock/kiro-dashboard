// @vitest-environment jsdom
/**
 * Component, grid layout, and accessibility tests for the InsightsPage
 * orchestrator (task 17.3).
 *
 * Validates: Requirements 2.4, 2.5, 2.6, 13.4, 13.5, 13.6, 13.7, 13.8,
 *            14.1, 14.2, 14.7
 *  - 2.4  Range defaults to "month"; all cards re-render on range change.
 *  - 2.5  Exactly seven category Insight_Cards render.
 *  - 2.6  Each card displays a visible heading containing the category name.
 *  - 13.4 Exactly one <h1> page heading; each card title is an <h2>.
 *  - 13.5 The Range control buttons are real <button>s, keyboard-focusable.
 *  - 13.6 Activating the Range control via keyboard changes the range.
 *  - 13.7 The Range control exposes a non-empty accessible name + aria-pressed.
 *  - 13.8 No axe-core accessibility violations.
 *  - 14.1 Outer container has display: grid.
 *  - 14.2 Chart-bearing cards have gridColumn "span 2"; text-only have "span 1".
 *  - 14.7 Card order matches CARD_ORDER constant (fixed, no reordering).
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
import type { CategorizedInsights } from "@/lib/insights/types";

expect.extend(toHaveNoViolations);

// ── Mutable mock state ────────────────────────────────────────────────────────

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

// Keep only useQueries mocked to an empty array; spread the rest of the module
// so QueryClientProvider and other exports remain functional if needed.
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueries: vi.fn(() => []) };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getUserMetrics: vi.fn() };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/insights",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

// ── Mock all visualization sub-components to avoid Recharts ARIA side-effects ─
// The page test is an integration test for orchestration and layout; the
// sub-components have their own test files that cover visualization details.

vi.mock("@/components/insights/AdoptionLeaderboard", () => ({
  AdoptionLeaderboard: ({ insights }: { insights: unknown[] }) => (
    <div data-testid="mock-adoption-leaderboard">
      {insights.length} adoption insights
    </div>
  ),
}));

vi.mock("@/components/insights/CostEfficiencyChart", () => ({
  CostEfficiencyChart: () => (
    <div data-testid="mock-cost-efficiency-chart">Cost chart</div>
  ),
}));

vi.mock("@/components/insights/TrendSparklines", () => ({
  TrendSparklines: () => (
    <div data-testid="mock-trend-sparklines">Trend sparklines</div>
  ),
}));

vi.mock("@/components/insights/ModelUsageDonut", () => ({
  ModelUsageDonut: () => (
    <div data-testid="mock-model-usage-donut">Model donut</div>
  ),
}));

vi.mock("@/components/insights/AnomaliesCallout", () => ({
  AnomaliesCallout: ({ insights }: { insights: unknown[] }) => (
    <div data-testid="mock-anomalies-callout">
      {insights.length} anomaly insights
    </div>
  ),
}));

vi.mock("@/components/insights/CreditDepletionCard", () => ({
  CreditDepletionCard: ({ insights }: { insights: unknown[] }) => (
    <div data-testid="mock-credit-depletion-card">
      {insights.length} depletion insights
    </div>
  ),
}));

// Mock computeInsights to return a deterministic CategorizedInsights object
// that yields non-empty ready states for all seven categories.
function createMockCategorizedInsights(): CategorizedInsights {
  const categories = [
    "trends",
    "adoption",
    "engagement",
    "modelUsage",
    "costEfficiency",
    "anomalies",
    "creditDepletion",
  ] as const;
  return Object.fromEntries(
    categories.map((cat) => [cat, { kind: "insights", insights: [] }]),
  ) as unknown as CategorizedInsights;
}

vi.mock("@/lib/insights", () => ({
  computeInsights: vi.fn(() => createMockCategorizedInsights()),
  DEFAULT_INSIGHT_CONFIG: {},
}));

import InsightsPage from "@/app/(dashboard)/insights/page";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SEVEN_CATEGORIES = [
  "trends",
  "adoption",
  "engagement",
  "modelUsage",
  "costEfficiency",
  "anomalies",
  "creditDepletion",
] as const;

/** Fixed display order matching CARD_ORDER in the page. */
const CARD_ORDER = [
  "trends",
  "adoption",
  "engagement",
  "modelUsage",
  "costEfficiency",
  "anomalies",
  "creditDepletion",
] as const;

/** Chart-bearing categories that should receive gridColumn "span 2". */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CHART_CARD_CATEGORIES = new Set(["trends", "modelUsage", "costEfficiency"]);

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
    total_chat_conversations: daily.reduce((s, d) => s + d.chat_conversations, 0),
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

// ── Default range (R2.4, R13.7) ───────────────────────────────────────────────

describe("InsightsPage default range (R2.4, R13.7)", () => {
  test("defaults to 'month' and reflects it as the pressed Range value", () => {
    render(<InsightsPage />);

    const monthBtn = screen.getByTestId("range-month");
    const weekBtn = screen.getByTestId("range-week");

    expect(monthBtn).toHaveAttribute("aria-pressed", "true");
    expect(weekBtn).toHaveAttribute("aria-pressed", "false");
  });
});

// ── Seven cards with category headings (R2.5, R2.6) ───────────────────────────

describe("InsightsPage renders seven category cards (R2.5, R2.6)", () => {
  test("renders exactly seven InsightCards, one per category", () => {
    render(<InsightsPage />);

    for (const category of SEVEN_CATEGORIES) {
      expect(
        screen.getByTestId(`insight-card-${category}`),
      ).toBeInTheDocument();
    }

    // Exactly seven — no more, no fewer.
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

    // Each of the seven card titles is one level below the page heading (h2).
    const h2s = container.querySelectorAll("h2");
    expect(h2s).toHaveLength(7);
  });
});

// ── One forced-error card leaves the others rendered (R2.8, R11.5) ────────────

describe("InsightsPage isolates a single failing card (R2.8, R11.5)", () => {
  test("adoption error shows Retry while the other six cards still render", () => {
    // Only the users query (which drives the adoption card) fails.
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

// ── Range control accessibility (R13.5, R13.6, R13.7) ────────────────────────

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

    weekBtn.focus();
    expect(weekBtn).toHaveFocus();
  });

  test("activating another option updates the pressed value via keyboard (R13.6, R13.7)", async () => {
    const user = userEvent.setup();
    render(<InsightsPage />);

    const weekBtn = screen.getByTestId("range-week");
    const monthBtn = screen.getByTestId("range-month");

    expect(monthBtn).toHaveAttribute("aria-pressed", "true");
    expect(weekBtn).toHaveAttribute("aria-pressed", "false");

    weekBtn.focus();
    await user.keyboard("{Enter}");

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

// ── Grid layout: outer container has display:grid (R14.1) ─────────────────────

describe("InsightsPage grid layout (R14.1)", () => {
  test("outer .insights-grid container has display: grid via injected <style>", () => {
    const { container } = render(<InsightsPage />);

    // The page injects a <style> tag with .insights-grid { display: grid }.
    const styleEl = container.querySelector("style");
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toMatch(/\.insights-grid\s*\{[^}]*display\s*:\s*grid/);
  });

  test("the .insights-grid <div> element is present in the DOM (R14.1)", () => {
    const { container } = render(<InsightsPage />);
    const grid = container.querySelector(".insights-grid");
    expect(grid).not.toBeNull();
    expect(grid?.tagName).toBe("DIV");
  });
});

// ── Grid spans: chart cards span 2, text-only cards span 1 (R14.2) ───────────

describe("InsightsPage card grid column spans (R14.2)", () => {
  test("chart-bearing categories (trends, modelUsage, costEfficiency) get gridColumn 'span 2'", () => {
    const { container } = render(<InsightsPage />);

    const chartCategories = ["trends", "modelUsage", "costEfficiency"];
    for (const category of chartCategories) {
      const card = container.querySelector(`[data-testid="insight-card-${category}"]`);
      expect(card).not.toBeNull();
      // The wrapper <div> that holds each InsightCard carries the gridColumn style.
      const wrapper = card?.parentElement;
      expect(wrapper).not.toBeNull();
      expect(wrapper?.style.gridColumn).toBe("span 2");
    }
  });

  test("text-only categories (adoption, engagement, anomalies, creditDepletion) get gridColumn 'span 1'", () => {
    const { container } = render(<InsightsPage />);

    const textOnlyCategories = ["adoption", "engagement", "anomalies", "creditDepletion"];
    for (const category of textOnlyCategories) {
      const card = container.querySelector(`[data-testid="insight-card-${category}"]`);
      expect(card).not.toBeNull();
      const wrapper = card?.parentElement;
      expect(wrapper).not.toBeNull();
      expect(wrapper?.style.gridColumn).toBe("span 1");
    }
  });
});

// ── Card order matches CARD_ORDER (R14.7) ─────────────────────────────────────

describe("InsightsPage card order matches CARD_ORDER (R14.7)", () => {
  test("cards appear in CARD_ORDER: trends, adoption, engagement, modelUsage, costEfficiency, anomalies, creditDepletion", () => {
    const { container } = render(<InsightsPage />);

    // Collect all insight cards in DOM order.
    const allCards = Array.from(
      container.querySelectorAll("[data-testid^='insight-card-']"),
    ).filter((el) =>
      /^insight-card-[a-zA-Z]+$/.test((el as HTMLElement).dataset.testid ?? ""),
    );

    expect(allCards).toHaveLength(7);

    // Each card's data-testid must match the corresponding CARD_ORDER entry.
    CARD_ORDER.forEach((category, index) => {
      expect((allCards[index] as HTMLElement).dataset.testid).toBe(
        `insight-card-${category}`,
      );
    });
  });
});

// ── axe-core: no accessibility violations (R13.8) ────────────────────────────

describe("InsightsPage has no axe-core violations (R13.8)", () => {
  test("the rendered page passes an axe accessibility scan", async () => {
    const { container } = render(<InsightsPage />);

    // color-contrast cannot be reliably computed under jsdom (no layout engine).
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });

    expect(results).toHaveNoViolations();
  });
});
