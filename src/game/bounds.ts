/**
 * Shared shapes for "where is movement/placement allowed" - used by both
 * scenes (room, village) and by the generic engine hooks (useCharacter,
 * useWorldItems) that consume them, so there is one definition instead of
 * one per file.
 */

import type { SharedValue } from "react-native-reanimated";

/** A room-pixel rectangle, expressed as min/max instead of x/y/width/height. */
export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

/**
 * A flat, grid-aligned collision lookup - O(1) per check, unlike an item's
 * Rect scanned linearly (see items/itemCatalog.ts's Rect). Imported map
 * terrain can be thousands of tiles, so it goes through this grid instead of
 * a per-tile Rect list, which would make the per-frame movement check scan
 * the whole map every time.
 *
 * `grid` is a SharedValue, not a plain Uint8Array, even though the village's
 * grid is otherwise built once and handed out as a stable object - see
 * villageLayout.ts's `removeVillageSceneryGroup`. A plain array captured
 * inside a "worklet" function is cloned into the UI-thread runtime's own
 * closure once and then cached there by Reanimated keyed on that array's
 * identity; mutating its bytes on the JS thread afterwards does not reach
 * that cached clone, even when the worklet is freshly re-registered (which
 * only re-derives a shareable, it does not force a re-clone). A SharedValue
 * is the one thing Reanimated actually keeps synced across threads on every
 * write to `.value` - this bit us for real (a removed tree/bush stayed
 * solid to the movement worklet despite the plain-JS grid data being
 * correctly cleared, verified independently against the very same object).
 */
export type TileCollision = {
  grid: SharedValue<Uint8Array>;
  columns: number;
  rows: number;
  tileSize: number;
};

/**
 * Marked as a worklet so it can run on the UI thread (e.g. inside a
 * useFrameCallback or useDerivedValue) as well as being called normally from
 * the JS thread - both work the same way, only the invocation context
 * differs.
 */
export const clamp = (value: number, min: number, max: number) => {
  "worklet";
  return Math.min(Math.max(value, min), max);
};
