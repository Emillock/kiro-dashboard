/**
 * Feature: insights-section, Property 4: Trend classification against a tolerance band
 *
 * Property 4 (design.md): For all pairs of (current, preceding) values and any
 * non-negative tolerance band, `classifyTrend` returns `increase` when current
 * exceeds preceding beyond the band, `decrease` when current falls below
 * preceding beyond the band, and `unchanged` when the (relative or
 * percentage-point) difference lies within the inclusive band.
 *
 * Validates: Requirements 3.10, 5.3, 7.2
 *
 * The function under test compares the absolute difference `current - preceding`
 * against `band` (treated as a magnitude, i.e. `Math.abs(band)`):
 *   - increase  when difference >  band
 *   - decrease  when difference < -band
 *   - unchanged when |difference| <= band   (inclusive band)
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { classifyTrend } from "../lib/insights/math";

const RUNS = 200; // >= 100 iterations required for property tests

// Finite, bounded doubles keep the arithmetic well away from precision blow-up
// at the boundary so each targeted region is unambiguous.
const value = (): fc.Arbitrary<number> =>
  fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true });

// A non-negative band magnitude.
const band = (): fc.Arbitrary<number> =>
  fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true });

// A strictly-positive gap used to push a value clearly beyond the band so the
// expected classification is unambiguous regardless of floating-point rounding.
const gap = (): fc.Arbitrary<number> =>
  fc.double({ min: 1e-3, max: 1e6, noNaN: true, noDefaultInfinity: true });

// ── Targeted region tests (each exercises one branch) ────────────────────────

test("Property 4: increase when current exceeds preceding beyond the band", () => {
  fc.assert(
    fc.property(value(), band(), gap(), (preceding, b, g) => {
      const current = preceding + b + g; // difference = b + g > b
      expect(classifyTrend(current, preceding, b)).toBe("increase");
    }),
    { numRuns: RUNS },
  );
});

test("Property 4: decrease when current falls below preceding beyond the band", () => {
  fc.assert(
    fc.property(value(), band(), gap(), (preceding, b, g) => {
      const current = preceding - b - g; // difference = -(b + g) < -b
      expect(classifyTrend(current, preceding, b)).toBe("decrease");
    }),
    { numRuns: RUNS },
  );
});

test("Property 4: unchanged when the difference lies within the inclusive band", () => {
  fc.assert(
    fc.property(
      value(),
      band(),
      // offsetFraction in [-1, 1] targets the inclusive band including its
      // endpoints. Reconstructing `current` introduces floating-point rounding,
      // so `current - preceding` is not exactly `offsetFraction * b`; near ±1
      // the realized difference can land just outside ±b. Rather than asserting
      // a reconstructed expectation, assert CONSISTENCY with the function's own
      // definition computed from the SAME floating-point difference, which stays
      // robust while still exercising near-boundary inputs.
      fc.double({ min: -1, max: 1, noNaN: true, noDefaultInfinity: true }),
      (preceding, b, offsetFraction) => {
        const offset = offsetFraction * b; // |offset| ~<= b (target region)
        const current = preceding + offset;
        const diff = current - preceding; // the actual realized difference
        const tol = Math.abs(b);
        if (diff > tol) {
          expect(classifyTrend(current, preceding, b)).toBe("increase");
        } else if (diff < -tol) {
          expect(classifyTrend(current, preceding, b)).toBe("decrease");
        } else {
          expect(classifyTrend(current, preceding, b)).toBe("unchanged");
        }
      },
    ),
    { numRuns: RUNS },
  );
});

test("Property 4: a band built to cover the difference is deterministically unchanged", () => {
  fc.assert(
    fc.property(
      // Arbitrary finite current and preceding, plus a non-negative `extra`.
      value(),
      value(),
      fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true }),
      (current, preceding, extra) => {
        // Construct the band FROM the chosen values so the inclusive-band
        // property holds BY CONSTRUCTION, independent of floating-point
        // rounding: `Math.abs(current - preceding)` is the *exact* realized
        // difference, so `band = |current - preceding| + extra` satisfies
        // `|current - preceding| <= band` exactly in IEEE-754 (extra >= 0). The
        // `extra === 0` case exercises the exact-boundary, and there is zero
        // reconstruction fragility because `current` is never recomputed from
        // `preceding` and a fraction of the band.
        const band = Math.abs(current - preceding) + extra;
        expect(classifyTrend(current, preceding, band)).toBe("unchanged");
      },
    ),
    { numRuns: RUNS },
  );
});

test("Property 4: difference exactly equal to the band is unchanged (inclusive)", () => {
  fc.assert(
    fc.property(value(), value(), (current, preceding) => {
      // Derive the band from the *actual* difference so the boundary is exact
      // in floating point (avoids `(preceding + b) - preceding !== b` drift).
      const exactBand = Math.abs(current - preceding); // |difference| === band
      expect(classifyTrend(current, preceding, exactBand)).toBe("unchanged");
    }),
    { numRuns: RUNS },
  );
});

// ── General consistency over arbitrary inputs ────────────────────────────────

test("Property 4: classification is consistent with the absolute-difference definition", () => {
  fc.assert(
    fc.property(value(), value(), band(), (current, preceding, b) => {
      const tolerance = Math.abs(b);
      const difference = current - preceding;
      const result = classifyTrend(current, preceding, b);
      if (difference > tolerance) {
        expect(result).toBe("increase");
      } else if (difference < -tolerance) {
        expect(result).toBe("decrease");
      } else {
        expect(result).toBe("unchanged");
      }
      // Result is always one of the three valid directions.
      expect(["increase", "decrease", "unchanged"]).toContain(result);
    }),
    { numRuns: RUNS },
  );
});

test("Property 4: band magnitude is used, so a negative band matches its absolute value", () => {
  fc.assert(
    fc.property(value(), value(), band(), (current, preceding, b) => {
      expect(classifyTrend(current, preceding, -b)).toBe(
        classifyTrend(current, preceding, b),
      );
    }),
    { numRuns: RUNS },
  );
});

// ── Relative-tolerance framing (Requirements 5.3, 7.2) ───────────────────────
// Callers express a relative band as `tolerance * |preceding|`; verify the
// inclusive relative band classifies as the requirements describe.

test("Property 4: relative-tolerance band classifies sub-period values correctly", () => {
  fc.assert(
    fc.property(
      // Positive preceding so the relative band has a meaningful magnitude.
      fc.double({ min: 1, max: 1e6, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), // tolerance fraction 0..1
      gap(),
      (preceding, tolerance, g) => {
        const relativeBand = tolerance * Math.abs(preceding);

        // Beyond the band above -> increase.
        expect(
          classifyTrend(preceding + relativeBand + g, preceding, relativeBand),
        ).toBe("increase");

        // Beyond the band below -> decrease.
        expect(
          classifyTrend(preceding - relativeBand - g, preceding, relativeBand),
        ).toBe("decrease");

        // Within the band -> unchanged.
        expect(classifyTrend(preceding, preceding, relativeBand)).toBe(
          "unchanged",
        );
      },
    ),
    { numRuns: RUNS },
  );
});
