/**
 * Dashboard block layout persistence (localStorage, Q4=C).
 * Stores the ordered list of blocks + their locked state.
 * This module is pure (no React), so it can be tested with fast-check (PBT-02 round-trip).
 */

export interface BlockState {
  id: string;
  order: number;
  locked: boolean;
}

const STORAGE_KEY = "kiro_dashboard_layout";

export const DEFAULT_BLOCKS: BlockState[] = [
  { id: "top-adopters",       order: 0, locked: false },
  { id: "stat-cards",         order: 1, locked: false },
  { id: "messages-over-time", order: 2, locked: false },
  { id: "model-distribution", order: 3, locked: false },
  { id: "credits-chart",      order: 4, locked: false },
  { id: "active-users-chart", order: 5, locked: false },
];

/**
 * Load the layout from localStorage. Falls back to DEFAULT_BLOCKS if nothing is stored
 * or if the stored value cannot be parsed.
 */
export function loadLayout(): BlockState[] {
  if (typeof localStorage === "undefined") return DEFAULT_BLOCKS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BLOCKS;
    const parsed = JSON.parse(raw) as BlockState[];
    // Basic validation: must be an array with id, order, locked.
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (b) =>
          typeof b.id === "string" &&
          typeof b.order === "number" &&
          typeof b.locked === "boolean"
      )
    ) {
      return parsed;
    }
    return DEFAULT_BLOCKS;
  } catch {
    return DEFAULT_BLOCKS;
  }
}

/** Persist the current layout to localStorage. */
export function saveLayout(blocks: BlockState[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
}

/** Clear the persisted layout and return to defaults. */
export function resetLayout(): BlockState[] {
  if (typeof localStorage === "undefined") return DEFAULT_BLOCKS;
  localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_BLOCKS;
}

/** Toggle the locked state of a block by id. */
export function toggleLock(blocks: BlockState[], id: string): BlockState[] {
  return blocks.map((b) => (b.id === id ? { ...b, locked: !b.locked } : b));
}

/** Reorder blocks via drag-and-drop indices (skips locked blocks as targets). */
export function reorderBlocks(
  blocks: BlockState[],
  fromIndex: number,
  toIndex: number
): BlockState[] {
  if (fromIndex === toIndex) return blocks;
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  const item = sorted[fromIndex];
  if (!item || item.locked) return blocks;
  const next = sorted.filter((_, i) => i !== fromIndex);
  next.splice(toIndex, 0, item);
  return next.map((b, i) => ({ ...b, order: i }));
}
