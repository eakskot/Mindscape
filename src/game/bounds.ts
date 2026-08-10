/**
 * Shared shapes for "where is movement/placement allowed" - used by both
 * scenes (room, village) and by the generic engine hooks (useCharacter,
 * useWorldItems) that consume them, so there is one definition instead of
 * one per file.
 */

/** A room-pixel rectangle, expressed as min/max instead of x/y/width/height. */
export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

/**
 * A flat, grid-aligned collision lookup - O(1) per check, unlike an item's
 * Rect scanned linearly (see items/itemCatalog.ts's Rect). Imported map
 * terrain can be thousands of tiles, so it goes through this grid instead of
 * a per-tile Rect list, which would make the per-frame movement check scan
 * the whole map every time.
 */
export type TileCollision = {
  grid: Uint8Array;
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
