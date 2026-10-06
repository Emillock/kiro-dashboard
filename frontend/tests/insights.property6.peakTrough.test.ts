/**
 * Feature: insights-section, Property 6: Peak/trough extreme membership with earliest-tie
 *
 * Property 6 (design.md): For all non-empty ranges, the reported peak
 * total_messages value is greater than or equal to every daily value and the
 * trough value is less than or equal to every daily value, and when multiple
 * days tie for the extreme the chosen day is the earliest date.
 *
 * Validates: Requirements 3.7, 3.8
 *
 * The function under test is `computeTrendInsights(dailyTotals, config)` from
 * lib/insights/trends.ts. It emits a peak insight (id `trends-peak-day`) and a
 * trough insight (id `trends-trough-day`), each with `magnitude` = the extreme
 * total_messages value and `detail.date` = the chosen date. On ties the
 * earliest (lexicographically smallest) date among the tied extreme days is
 * chosen.
 *
 * Determinism notes: total_messages values are INTEGERS so equal extremes are
 * exact (no floating-point tie ambiguity), and generated dates are UNIQUE and
 * fixed-width zero-padded so lexicographic string ordering equals chronological
 * ordering ("earliest date").
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeTrendInsights } from "../lib/insights/trends";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import type { DailyTotal } from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const PEAK_ID = "trends-peak-day";
const TROUGH_ID = "trends-trough-day";

/**
 * Convert a numeric day index into a fixed-width, lexicographically orderable
 * ISO-like date string. Fixed-width zero-padding guarantees that string `<`
 * comparison matches numeric (chronological) ordering, which is exactly the
 * tie-break the engine relies on.
 */
function toDate(idx: number): string {
  return `2024-${String(idx).padStart(5, "0")}`;
}

/**
 * A non-empty `DailyTotal[]` with UNIQUE, orderable dates and INTEGER
 * total_messages. Date indices are drawn as a unique array (no duplicate dates)
 * and are NOT necessarily sorted, so the "earliest date" tie-break is exercised
 * independently of array position. total_messages is drawn from a small integer
 * range so ties for the extreme are common.
 */
const dailyTotalsArb = (): fc.Arbitrary<DailyTotal[]> =>
  fc
    .uniqueArray(fc.integer({ min: 1, max: 9999 }), {
      minLength: 1,
      maxLength: 30,
    })
    .chain((dateIdxs) =>
      fc
        .array(fc.integer({ min: 0, max: 8 }), {
          minLength: dateIdxs.length,
          maxLength: dateIdxs.length,
        })
        .map((messages) =>
          dateIdxs.map((idx, i) => ({
            date: toDate(idx),
            total_messages: messages[i],
            chat_conversations: 0,
            credits_used: 0,
            active_users: 0,
          })),
        ),
    );

/** Earliest (lexicographically smallest) date among days whose total_messages equals `value`. */
function earliestDateWithValue(days: DailyTotal[], value: number): string {
  return days
    .filter((d) => d.total_messages === value)
    .map((d) => d.date)
    .reduce((a, b) => (a < b ? a : b));
}

// ── Property 6: peak is an upper bound and trough is a lower bound ────────────

test("Property 6: peak >= every daily value and trough <= every daily value", () => {
  fc.assert(
    fc.property(dailyTotalsArb(), (days) => {
      const insights = computeTrendInsights(days, DEFAULT_INSIGHT_CONFIG);
      const peak = insights.find((i) => i.id === PEAK_ID);
      const trough = insights.find((i) => i.id === TROUGH_ID);

      expect(peak).toBeDefined();
      expect(trough).toBeDefined();
      expect(peak!.status).toBe("ok");
      expect(trough!.status).toBe("ok");

      const peakVal = peak!.magnitude as number;
      const troughVal = trough!.magnitude as number;

      for (const d of days) {
        expect(peakVal).toBeGreaterThanOrEqual(d.total_messages);
        expect(troughVal).toBeLessThanOrEqual(d.total_messages);
      }
    }),
    { numRuns: RUNS },
  );
});

// ── Property 6: reported extremes equal the true max/min ─────────────────────

test("Property 6: peak magnitude equals the max and trough magnitude equals the min", () => {
  fc.assert(
    fc.property(dailyTotalsArb(), (days) => {
      const insights = computeTrendInsights(days, DEFAULT_INSIGHT_CONFIG);
      const peak = insights.find((i) => i.id === PEAK_ID);
      const trough = insights.find((i) => i.id === TROUGH_ID);

      const values = days.map((d) => d.total_messages);
      const max = Math.max(...values);
      const min = Math.min(...values);

      expect(peak!.magnitude).toBe(max);
      expect(trough!.magnitude).toBe(min);
    }),
    { numRuns: RUNS },
  );
});

// ── Property 6: chosen dates are extreme members, earliest on ties ───────────

test("Property 6: peak/trough dates are extreme members and are the earliest tied date", () => {
  fc.assert(
    fc.property(dailyTotalsArb(), (days) => {
      const insights = computeTrendInsights(days, DEFAULT_INSIGHT_CONFIG);
      const peak = insights.find((i) => i.id === PEAK_ID);
      const trough = insights.find((i) => i.id === TROUGH_ID);

      const values = days.map((d) => d.total_messages);
      const max = Math.max(...values);
      const min = Math.min(...values);

      const peakDate = peak!.detail!.date as string;
      const troughDate = trough!.detail!.date as string;

      // Membership: the chosen date corresponds to a day actually holding the extreme.
      const peakDay = days.find((d) => d.date === peakDate);
      const troughDay = days.find((d) => d.date === troughDate);
      expect(peakDay).toBeDefined();
      expect(troughDay).toBeDefined();
      expect(peakDay!.total_messages).toBe(max);
      expect(troughDay!.total_messages).toBe(min);

      // Earliest-tie: the chosen date is the lexicographically smallest among tied days.
      expect(peakDate).toBe(earliestDateWithValue(days, max));
      expect(troughDate).toBe(earliestDateWithValue(days, min));
    }),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

function fromPairs(pairs: [string, number][]): DailyTotal[] {
  return pairs.map(([date, total_messages]) => ({
    date,
    total_messages,
    chat_conversations: 0,
    credits_used: 0,
    active_users: 0,
  }));
}

test("single-day range reports that day as both peak and trough", () => {
  const insights = computeTrendInsights(
    fromPairs([["2024-00001", 7]]),
    DEFAULT_INSIGHT_CONFIG,
  );
  const peak = insights.find((i) => i.id === PEAK_ID)!;
  const trough = insights.find((i) => i.id === TROUGH_ID)!;
  expect(peak.magnitude).toBe(7);
  expect(peak.detail!.date).toBe("2024-00001");
  expect(trough.magnitude).toBe(7);
  expect(trough.detail!.date).toBe("2024-00001");
});

test("tied maxima: earliest date wins even when a later array position holds the same max", () => {
  // Two days tie for the max (9); the earliest date "2024-00002" must win,
  // though it does not appear first in array order.
  const insights = computeTrendInsights(
    fromPairs([
      ["2024-00005", 9],
      ["2024-00002", 9],
      ["2024-00009", 3],
    ]),
    DEFAULT_INSIGHT_CONFIG,
  );
  const peak = insights.find((i) => i.id === PEAK_ID)!;
  expect(peak.magnitude).toBe(9);
  expect(peak.detail!.date).toBe("2024-00002");
});

test("tied minima: earliest date wins", () => {
  const insights = computeTrendInsights(
    fromPairs([
      ["2024-00008", 1],
      ["2024-00003", 1],
      ["2024-00001", 6],
    ]),
    DEFAULT_INSIGHT_CONFIG,
  );
  const trough = insights.find((i) => i.id === TROUGH_ID)!;
  expect(trough.magnitude).toBe(1);
  expect(trough.detail!.date).toBe("2024-00003");
});

test("all-equal series reports the earliest date for both peak and trough", () => {
  const insights = computeTrendInsights(
    fromPairs([
      ["2024-00004", 5],
      ["2024-00002", 5],
      ["2024-00006", 5],
    ]),
    DEFAULT_INSIGHT_CONFIG,
  );
  const peak = insights.find((i) => i.id === PEAK_ID)!;
  const trough = insights.find((i) => i.id === TROUGH_ID)!;
  expect(peak.magnitude).toBe(5);
  expect(trough.magnitude).toBe(5);
  expect(peak.detail!.date).toBe("2024-00002");
  expect(trough.detail!.date).toBe("2024-00002");
});
