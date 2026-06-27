// @vitest-environment jsdom
/**
 * Component tests for InsightCard data states (task 14.3).
 *
 * Validates: Requirements 2.7, 2.8, 2.9, 2.10, 12.3, 12.4
 *  - 2.7  Loading state renders a scoped loading indicator on the card.
 *  - 2.8  Error state renders a message plus a visible Retry control.
 *  - 2.9  Activating Retry invokes the supplied retry() callback.
 *  - 2.10 Empty state renders a category empty-state message with no value.
 *  - 12.3 An individual insufficient_data/unavailable insight renders its
 *         message in place of a numeric value.
 *  - 12.4 An unavailable insight in a category does not suppress its siblings.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InsightCard } from "@/components/insights/InsightCard";
import type { Insight } from "@/lib/insights/types";

afterEach(() => {
  cleanup();
});

/** Builds a minimal valid Insight, overridable per test. */
function makeInsight(overrides: Partial<Insight> & Pick<Insight, "id">): Insight {
  return {
    category: "trends",
    title: "An insight",
    description: "A plain-language sentence.",
    status: "ok",
    ...overrides,
  };
}

describe("InsightCard loading state (R2.7)", () => {
  test("renders the scoped loading indicator and no ready/empty/error elements", () => {
    render(
      <InsightCard category="trends" title="Trends" state={{ kind: "loading" }} />,
    );

    const loading = screen.getByTestId("insight-card-loading-trends");
    expect(loading).toBeInTheDocument();
    expect(loading).toHaveAttribute("role", "status");

    // The card marks itself busy while loading.
    expect(screen.getByTestId("insight-card-trends")).toHaveAttribute(
      "aria-busy",
      "true",
    );

    // No other state's elements are present.
    expect(screen.queryByTestId("insight-card-empty-trends")).toBeNull();
    expect(screen.queryByTestId("insight-card-retry-trends")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("InsightCard error state (R2.8, R2.9)", () => {
  test("renders an alert message and a visible Retry button", () => {
    render(
      <InsightCard
        category="adoption"
        title="Adoption"
        state={{ kind: "error", retry: vi.fn() }}
      />,
    );

    // Alert message (R2.8).
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Visible Retry control (R2.8).
    const retryButton = screen.getByTestId("insight-card-retry-adoption");
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).toBeVisible();
    expect(retryButton).toHaveTextContent("Retry");

    // The card is not busy in the error state.
    expect(screen.getByTestId("insight-card-adoption")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });

  test("clicking Retry invokes the provided retry callback (R2.9)", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(
      <InsightCard
        category="anomalies"
        title="Anomalies"
        state={{ kind: "error", retry }}
      />,
    );

    await user.click(screen.getByTestId("insight-card-retry-anomalies"));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("InsightCard empty state (R2.10)", () => {
  test("renders the empty-state message with no insight rows", () => {
    render(
      <InsightCard
        category="engagement"
        title="Engagement"
        state={{ kind: "empty" }}
      />,
    );

    const empty = screen.getByTestId("insight-card-empty-engagement");
    expect(empty).toBeInTheDocument();
    // Names the category (R2.10/R12.2) and shows no numeric value.
    expect(empty).toHaveTextContent("Engagement");
    expect(empty.textContent ?? "").not.toMatch(/\d/);

    // No insight rows are rendered.
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("InsightCard ready state (R12.3, R12.4)", () => {
  const insights: Insight[] = [
    makeInsight({
      id: "trend-messages",
      title: "Messages",
      description: "Messages rose 12% versus the prior period.",
      status: "increase",
      magnitude: 12,
    }),
    makeInsight({
      id: "trend-active",
      title: "Active users",
      description: "Active users held steady.",
      status: "ok",
    }),
    makeInsight({
      id: "trend-credits",
      title: "Credits trend",
      description: "Not enough data points to compute this trend.",
      status: "insufficient_data",
    }),
    makeInsight({
      id: "trend-balance",
      title: "Remaining balance",
      description: "",
      status: "unavailable",
      unavailableReason: "per-tier Allowance configuration",
    }),
  ];

  test("renders a row for every insight, including unavailable ones (R12.4)", () => {
    render(
      <InsightCard category="trends" title="Trends" state={{ kind: "ready", insights }} />,
    );

    // All four insight rows render (siblings are not suppressed).
    for (const insight of insights) {
      expect(screen.getByTestId(`insight-${insight.id}`)).toBeInTheDocument();
    }

    // The "ok"-like insights render their description as the value.
    const messagesRow = screen.getByTestId("insight-trend-messages");
    expect(messagesRow).toHaveTextContent(
      "Messages rose 12% versus the prior period.",
    );
    expect(
      within(messagesRow).getByTestId("insight-status-increase"),
    ).toBeInTheDocument();
  });

  test("insufficient_data/unavailable insights render a message in place of a value (R12.3)", () => {
    render(
      <InsightCard category="trends" title="Trends" state={{ kind: "ready", insights }} />,
    );

    // insufficient_data renders its description via the message test id.
    const insufficientMessage = screen.getByTestId(
      "insight-message-trend-credits",
    );
    expect(insufficientMessage).toBeInTheDocument();
    expect(insufficientMessage).toHaveTextContent(
      "Not enough data points to compute this trend.",
    );
    expect(
      screen.getByTestId("insight-status-insufficient_data"),
    ).toBeInTheDocument();

    // unavailable renders its unavailableReason via the message test id.
    const unavailableMessage = screen.getByTestId(
      "insight-message-trend-balance",
    );
    expect(unavailableMessage).toBeInTheDocument();
    expect(unavailableMessage).toHaveTextContent(
      "per-tier Allowance configuration",
    );
    expect(screen.getByTestId("insight-status-unavailable")).toBeInTheDocument();

    // The "ok"-like siblings do NOT render a message test id (value path).
    expect(screen.queryByTestId("insight-message-trend-messages")).toBeNull();
    expect(screen.queryByTestId("insight-message-trend-active")).toBeNull();
  });

  test("renders the card title as an <h2> containing the category name", () => {
    render(
      <InsightCard category="trends" title="Trends" state={{ kind: "ready", insights }} />,
    );

    const heading = screen.getByRole("heading", { level: 2, name: "Trends" });
    expect(heading).toBeInTheDocument();
  });
});
