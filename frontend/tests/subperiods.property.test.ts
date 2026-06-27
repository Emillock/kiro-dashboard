/**
 * Feature: insights-section, Property 1: Sub-period split is a total, length-correct partition
 *
 * Property-based tests for `splitRange` in lib/insights/subperiods.ts.
 *
 * For all lists of length n, `splitRange` returns a `preceding` half of length
 * floor(n/2) and a `current` half of length ceil(n/2) (the middle day of an
 * odd-length range goes to `current`), and concatenating `preceding` then
 * `current` reproduces the original list in its original order.
 *
 * Validates: Requirements 3.1
 *
 * Uses fast-check + Vitest, minimum 100 iterations.
 */
import * as fc from "fast-check";
import { splitRange } from "../lib/insights/subperiods";

// Arbitrary array of arbitrary elements. Includes length 0, 1, even and odd
// lengths. Uses anything() so the property is exercised over heterogeneous,
// arbitrary element types (the function is generic over T).
const arbitraryList = (): fc.Arbitrary<unknown[]> =>
  fc.array(fc.anything(), { minLength: 0, maxLength: 50 });

test("Property 1: split lengths are floor(n/2) preceding and ceil(n/2) current", () => {
  fc.assert(
    fc.property(arbitraryList(), (list) => {
      const n = list.length;
      const { preceding, current } = splitRange(list);
      expect(preceding.length).toBe(Math.floor(n / 2));
      expect(current.length).toBe(Math.ceil(n / 2));
    }),
    { numRuns: 200 }
  );
});

test("Property 1: concatenating preceding then current reproduces the original list in order", () => {
  fc.assert(
    fc.property(arbitraryList(), (list) => {
      const { preceding, current } = splitRange(list);
      expect([...preceding, ...current]).toEqual(list);
    }),
    { numRuns: 200 }
  );
});

test("Property 1: the middle day of an odd-length range goes to current", () => {
  fc.assert(
    fc.property(
      // Force odd length by building from a non-negative even count plus one.
      fc.array(fc.anything(), { minLength: 0, maxLength: 24 }).map((xs) =>
        xs.length % 2 === 0 ? xs : xs.slice(0, xs.length - 1)
      ),
      fc.anything(),
      (evenList, middle) => {
        // evenList has even length; insert a middle element to make it odd.
        const half = evenList.length / 2;
        const oddList = [
          ...evenList.slice(0, half),
          middle,
          ...evenList.slice(half),
        ];
        const { preceding, current } = splitRange(oddList);
        // floor(odd/2) preceding => the middle element is the first of `current`.
        expect(preceding.length).toBe(Math.floor(oddList.length / 2));
        expect(current.length).toBe(Math.ceil(oddList.length / 2));
        expect(current[0]).toBe(middle);
      }
    ),
    { numRuns: 200 }
  );
});

// ── Example-based edge cases ────────────────────────────────────────────────

test("empty list splits into two empty halves", () => {
  expect(splitRange([])).toEqual({ preceding: [], current: [] });
});

test("single-element list puts the element in current (odd middle rule)", () => {
  expect(splitRange([42])).toEqual({ preceding: [], current: [42] });
});

test("even-length list splits evenly", () => {
  expect(splitRange([1, 2, 3, 4])).toEqual({
    preceding: [1, 2],
    current: [3, 4],
  });
});

test("odd-length list sends the middle element to current", () => {
  expect(splitRange([1, 2, 3, 4, 5])).toEqual({
    preceding: [1, 2],
    current: [3, 4, 5],
  });
});
