/**
 * Property-based tests for lib/layout.ts (PBT-02 round-trip, PBT-03 invariant).
 * Uses fast-check.
 */
import * as fc from "fast-check";
import { BlockState, DEFAULT_BLOCKS, loadLayout, saveLayout, reorderBlocks, toggleLock } from "../lib/layout";

// Polyfill localStorage for Node.js test environment.
const store: Record<string, string> = {};
global.localStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  length: 0,
  key: () => null,
};

function clearStorage() {
  Object.keys(store).forEach((k) => delete store[k]);
}

// fast-check strategy for a valid BlockState array.
const blockStateArb = (): fc.Arbitrary<BlockState[]> =>
  fc.array(
    fc.record({
      id: fc.constantFrom("top-adopters", "stat-cards", "messages-over-time", "model-distribution"),
      order: fc.nat({ max: 10 }),
      locked: fc.boolean(),
    }),
    { minLength: 1, maxLength: 6 }
  );

// ── Example-based tests ──────────────────────────────────────────────────────

test("loadLayout returns DEFAULT_BLOCKS when nothing stored", () => {
  clearStorage();
  const layout = loadLayout();
  expect(layout).toEqual(DEFAULT_BLOCKS);
});

test("saveLayout then loadLayout returns same value", () => {
  clearStorage();
  saveLayout(DEFAULT_BLOCKS);
  expect(loadLayout()).toEqual(DEFAULT_BLOCKS);
});

test("toggleLock flips the locked state", () => {
  const blocks: BlockState[] = [{ id: "a", order: 0, locked: false }];
  expect(toggleLock(blocks, "a")[0].locked).toBe(true);
  expect(toggleLock(toggleLock(blocks, "a"), "a")[0].locked).toBe(false);
});

test("reorderBlocks changes the order without losing blocks", () => {
  const blocks: BlockState[] = [
    { id: "a", order: 0, locked: false },
    { id: "b", order: 1, locked: false },
    { id: "c", order: 2, locked: false },
  ];
  const result = reorderBlocks(blocks, 0, 2);
  expect(result.length).toBe(3);
  const sorted = [...result].sort((a, b) => a.order - b.order);
  expect(sorted[2].id).toBe("a");
});

// ── Property-based tests (fast-check) ───────────────────────────────────────

test("PBT-02: saveLayout then loadLayout is a round-trip", () => {
  fc.assert(
    fc.property(blockStateArb(), (blocks) => {
      clearStorage();
      saveLayout(blocks);
      const loaded = loadLayout();
      expect(loaded).toEqual(blocks);
    })
  );
});

test("PBT-03: loadLayout with empty storage always returns DEFAULT_BLOCKS", () => {
  fc.assert(
    fc.property(fc.constant(null), () => {
      clearStorage();
      expect(loadLayout()).toEqual(DEFAULT_BLOCKS);
    })
  );
});

test("PBT-03: reorderBlocks preserves the number of blocks", () => {
  fc.assert(
    fc.property(
      blockStateArb(),
      fc.nat({ max: 5 }),
      fc.nat({ max: 5 }),
      (blocks, from, to) => {
        const fromClamped = from % blocks.length;
        const toClamped   = to   % blocks.length;
        const result = reorderBlocks(blocks, fromClamped, toClamped);
        expect(result.length).toBe(blocks.length);
      }
    )
  );
});
