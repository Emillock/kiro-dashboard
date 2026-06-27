// @vitest-environment jsdom
/**
 * Component tests for the Sidebar "Insights" Nav_Item (task 16.2).
 *
 * Validates: Requirements 1.2, 1.6, 13.1, 13.2, 13.3
 *  - 1.2  Insights item positioned between Overview and Individual.
 *  - 1.6  Insights item exposes data-testid="nav-insights".
 *  - 13.1 List/navigation semantics (item rendered inside the nav list).
 *  - 13.2 aria-current="page" only when the active route is /insights.
 *  - 13.3 Leading icon is aria-hidden.
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

// Controllable pathname for usePathname(); mutated per test.
let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock("@/lib/queries", () => ({
  useAuthConfig: () => ({ data: { auth_disabled: true } }),
}));

// next/link renders a plain anchor that forwards href and children.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string | { toString(): string };
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={typeof href === "string" ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

import { Sidebar } from "@/components/layout/Sidebar";

beforeEach(() => {
  mockPathname = "/";
});

afterEach(() => {
  cleanup();
});

describe("Sidebar Insights Nav_Item", () => {
  test("renders nav-insights with label 'Insights' targeting /insights (R1.6)", () => {
    render(<Sidebar />);
    const insights = screen.getByTestId("nav-insights");
    expect(insights).toBeInTheDocument();
    expect(insights).toHaveTextContent("Insights");
    expect(insights).toHaveAttribute("href", "/insights");
  });

  test("is positioned between Overview and Individual items (R1.2)", () => {
    render(<Sidebar />);
    const overview = screen.getByTestId("nav-overview");
    const insights = screen.getByTestId("nav-insights");
    const individual = screen.getByTestId("nav-individual");

    // DOCUMENT_POSITION_FOLLOWING (4) means the argument node comes after.
    expect(
      overview.compareDocumentPosition(insights) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      insights.compareDocumentPosition(individual) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("is rendered as an item within the navigation list (R13.1)", () => {
    render(<Sidebar />);
    const nav = screen.getByRole("navigation");
    const insights = within(nav).getByTestId("nav-insights");
    expect(insights.closest("li")).not.toBeNull();
    expect(insights.closest("ul")).not.toBeNull();
  });

  test("has aria-current='page' when the active route is /insights (R13.2)", () => {
    mockPathname = "/insights";
    render(<Sidebar />);
    expect(screen.getByTestId("nav-insights")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("does NOT have aria-current='page' when another route is active (R13.2)", () => {
    mockPathname = "/individual";
    render(<Sidebar />);
    expect(screen.getByTestId("nav-insights")).not.toHaveAttribute(
      "aria-current",
    );
  });

  test("renders a leading icon marked aria-hidden (R13.3)", () => {
    render(<Sidebar />);
    const insights = screen.getByTestId("nav-insights");
    const icon = insights.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });
});
