/**
 * Feature: insights-section, Property 2: Percentage_Change formula and sign correctness
 *
 * Property-based tests for `percentageChange` in lib/insights/math.ts.
 * Uses fast-check under Vitest, running a minimum of 100 iterations per property.
 *
 * Property 2 (design.md): For all non-zero baselines and any current value,
 * `percentageChange` equals `(current - baseline) / baseline * 100` within an
 * absolute tolerance of 0.0001, and its sign is positive when current > baseline,
 * negative when current < baseline, and zero when current == baseline.
 *
 * Validates: Requirements 3.2, 3.4
 */
import * as fc from "fast-check";
import { percentageChange } from "../lib/insights/math";

const NUM_RUNS = 100;

// Finite, non-extreme doubles keep the floating-point comparison meaningful and
// avoid overflow to Infinity when dividing by tiny baselines.
const finiteValue = (): fc.Arbitrary<number> =>
  fc.double({
    min: -1e6,
    max: 1e6,
    noNaN: true,
    noDefaultInfinity: true,
  });

// Non-zero baseline: a finite value whose magnitude is bounded away from zero so
// the division is well-conditioned.
const nonZeroBaseline = (): fc.Arbitrary<number> =>
  finiteValue()
    .filter((b) => Math.abs(b) >= 1e-3);

// ── Property 2: formula correctness ──────────────────────────────────────────

test("Property 2: percentageChange equals (current - baseline) / baseline * 100", () => {
  fc.assert(
    fc.property(finiteValue(), nonZeroBaseline(), (current, baseline) => {
      const result = percentageChange(current, baseline);
      expect(result).not.toBeNull();
      const expected = ((current - baseline) / baseline) * 100;
      expect(Math.abs((result as number) - expected)).toBeLessThanOrEqual(0.0001);
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 2: sign correctness ─────────────────────────────────────────────

test("Property 2: percentageChange sign matches the current-vs-baseline relation", () => {
  fc.assert(
    fc.property(finiteValue(), nonZeroBaseline(), (current, baseline) => {
      const result = percentageChange(current, baseline);
      expect(result).not.toBeNull();
      const value = result as number;
      // The sign of the percentage change is the sign of (current - baseline)
      // divided by the sign of the baseline.
      if (current === baseline) {
        // `0 / baseline * 100` yields JS negative zero when baseline < 0, which
        // is numerically equal to zero (`-0 === 0`). Adding `+ 0` normalizes -0
        // to +0 so the strict Object.is comparison in `toBe` succeeds,
        // consistent with the "exactly 0" test below.
        expect(value + 0).toBe(0);
      } else if (current > baseline) {
        if (baseline > 0) {
          expect(value).toBeGreaterThan(0);
        } else {
          expect(value).toBeLessThan(0);
        }
      } else {
        // current < baseline
        if (baseline > 0) {
          expect(value).toBeLessThan(0);
        } else {
          expect(value).toBeGreaterThan(0);
        }
      }
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 2: equal current and baseline yields exactly zero ───────────────

test("Property 2: percentageChange is exactly 0 when current === baseline", () => {
  fc.assert(
    fc.property(nonZeroBaseline(), (baseline) => {
      // `0 / baseline * 100` yields JS negative zero when baseline < 0; that is
      // numerically equal to zero (`-0 === 0`). Adding `+ 0` normalizes -0 to +0
      // so the strict Object.is comparison in `toBe` succeeds.
      const result = percentageChange(baseline, baseline);
      expect(result).not.toBeNull();
      expect((result as number) + 0).toBe(0);
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 2: zero baseline never fabricates a value ───────────────────────

test("Property 2: percentageChange returns null for a zero baseline", () => {
  fc.assert(
    fc.property(finiteValue(), (current) => {
      expect(percentageChange(current, 0)).toBeNull();
    }),
    { numRuns: NUM_RUNS },
  );
});
