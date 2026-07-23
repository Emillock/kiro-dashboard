/**
 * Feature: insights-section, Task 13.3 — Reset_Day derivation (unit tests).
 *
 * Example-based unit tests for `deriveResetDay(input)` from
 * `lib/insights/creditDepletion.ts`. The Reset_Day is the first day of the
 * calendar month covering the selected Range, returned as a `YYYY-MM-01` string.
 *
 * Derivation rules under test (see `deriveResetDay`):
 *   - Prefer `aggregate.start_date`.
 *   - Otherwise fall back to the earliest date across `aggregate.daily_totals`
 *     and `userMetrics[].daily_breakdown`.
 *   - Return `null` when no date data is available at all.
 *
 * Validates: Requirements 9.1
 */
import { describe, expect, test } from "vitest";
import {
  deriveResetDay,
  type CreditDepletionInput,
} from "../lib/insights/creditDepletion";
import type {
  AggregateMetrics,
  DailyTotal,
  UserMetrics,
} from "../lib/insights/types";

// ── Minimal builders ─────────────────────────────────────────────────────────

/** A `DailyTotal` carrying only the date (other metrics are irrelevant here). */
function day(date: string): DailyTotal {
  return {
    date,
    total_messages: 0,
    chat_conversations: 0,
    credits_used: 0,
    active_users: 0,
  };
}

/** Build an `AggregateMetrics` with an optional `start_date` and daily totals. */
function aggregateWith(
  startDate: string | undefined,
  dailyDates: string[] = [],
): AggregateMetrics {
  return {
    range: "month",
    // `deriveResetDay` prefers `aggregate.start_date` and falls back to the
    // earliest daily date only when it is nullish. To model "no start_date
    // available" we leave it absent (undefined) so the fallback path is taken.
    start_date: startDate as unknown as string,
    end_date: "",
    total_messages: 0,
    total_chat_conversations: 0,
    total_credits_used: 0,
    active_user_count: 0,
    avg_messages_per_user: 0,
    avg_conversations_per_user: 0,
    model_distribution: {},
    daily_totals: dailyDates.map(day),
  };
}

/** Build a `UserMetrics` whose only meaningful field is its daily breakdown. */
function userWith(userId: string, breakdownDates: string[]): UserMetrics {
  return {
    user_id: userId,
    label: userId,
    total_messages: 0,
    chat_conversations: 0,
    credits_used: 0,
    active_days: breakdownDates.length,
    model_messages: {},
    subscription_tier: "pro",
    adoption_score: 0,
    daily_breakdown: breakdownDates.map(day),
    overage_cap: 0,
    overage_credits_used: 0,
  };
}

/** Build a full input with sensible defaults for the unused fields. */
function inputWith(
  partial: Partial<CreditDepletionInput>,
): CreditDepletionInput {
  return {
    range: "month",
    aggregate: null,
    userMetrics: null,
    ...partial,
  };
}

// ── 1. aggregate.start_date maps to the first of its calendar month ──────────

describe("deriveResetDay — aggregate.start_date mapped to first of month", () => {
  test("mid-month start_date 2024-03-15 -> 2024-03-01", () => {
    const input = inputWith({ aggregate: aggregateWith("2024-03-15") });
    expect(deriveResetDay(input)).toBe("2024-03-01");
  });

  test("start_date already on the first 2024-07-01 -> 2024-07-01", () => {
    const input = inputWith({ aggregate: aggregateWith("2024-07-01") });
    expect(deriveResetDay(input)).toBe("2024-07-01");
  });

  test("start_date on the last day of the month 2024-12-31 -> 2024-12-01", () => {
    const input = inputWith({ aggregate: aggregateWith("2024-12-31") });
    expect(deriveResetDay(input)).toBe("2024-12-01");
  });
});

// ── 2. Single-digit months are zero-padded ───────────────────────────────────

describe("deriveResetDay — zero-padded single-digit months", () => {
  const cases: Array<[string, string]> = [
    ["2024-01-20", "2024-01-01"],
    ["2024-02-29", "2024-02-01"], // leap-year February, still first-of-month
    ["2024-09-05", "2024-09-01"],
    ["2023-08-31", "2023-08-01"],
  ];

  test.each(cases)("start_date %s -> %s", (start, expected) => {
    const input = inputWith({ aggregate: aggregateWith(start) });
    expect(deriveResetDay(input)).toBe(expected);
  });
});

// ── 3. Fallback to the earliest date across daily series ─────────────────────

describe("deriveResetDay — earliest-date fallback when no start_date", () => {
  test("no start_date: earliest aggregate.daily_totals date -> first of that month", () => {
    const input = inputWith({
      aggregate: aggregateWith(undefined, [
        "2024-05-18",
        "2024-05-09",
        "2024-05-22",
      ]),
    });
    // Earliest is 2024-05-09 -> first of May.
    expect(deriveResetDay(input)).toBe("2024-05-01");
  });

  test("no aggregate: earliest userMetrics.daily_breakdown date -> first of that month", () => {
    const input = inputWith({
      aggregate: null,
      userMetrics: [
        userWith("u1", ["2024-06-14", "2024-06-30"]),
        userWith("u2", ["2024-06-03", "2024-06-21"]),
      ],
    });
    // Earliest across all users is 2024-06-03 -> first of June.
    expect(deriveResetDay(input)).toBe("2024-06-01");
  });

  test("earliest date spans aggregate + user data across months", () => {
    const input = inputWith({
      aggregate: aggregateWith(undefined, ["2024-04-15"]),
      userMetrics: [userWith("u1", ["2024-03-28"])],
    });
    // Earliest overall is 2024-03-28 -> first of March.
    expect(deriveResetDay(input)).toBe("2024-03-01");
  });
});

// ── 4. aggregate.start_date takes precedence over earliest daily date ────────

describe("deriveResetDay — start_date precedence", () => {
  test("start_date wins even when an earlier daily date exists", () => {
    const input = inputWith({
      aggregate: aggregateWith("2024-10-15", ["2024-08-01"]),
      userMetrics: [userWith("u1", ["2024-07-05"])],
    });
    // start_date 2024-10-15 is preferred over the earlier 2024-07-05 daily date.
    expect(deriveResetDay(input)).toBe("2024-10-01");
  });
});

// ── 5. No date data at all -> null ───────────────────────────────────────────

describe("deriveResetDay — no date data available", () => {
  test("aggregate null and userMetrics null -> null", () => {
    const input = inputWith({ aggregate: null, userMetrics: null });
    expect(deriveResetDay(input)).toBeNull();
  });

  test("no start_date and empty daily series -> null", () => {
    const input = inputWith({
      aggregate: aggregateWith(undefined, []),
      userMetrics: [],
    });
    expect(deriveResetDay(input)).toBeNull();
  });
});
