/**
 * The shape both the room and the village produce, so HomeScreen (and
 * anything else that draws a scene or walks a character around one) can
 * treat them the same way instead of hardcoding which one is active.
 */

import type { Bounds, TileCollision } from "./bounds";

/**
 * One tile to draw: source rect in a tileset, destination in room pixels.
 * `rotate`/`flip` decode Tiled's per-cell orientation flags (see
 * villageLayout.ts) - both default to "no transform" when omitted, which is
 * every tile the procedural room ever produces. `flip` means "mirror
 * horizontally, then rotate" (Tiled's own decomposition of its three raw
 * flip bits into one canonical order) - see atlas.ts for how each is drawn.
 */
export type Tile = {
  sx: number;
  sy: number;
  dx: number;
  dy: number;
  rotate?: 0 | 90 | 180 | 270;
  flip?: boolean;
  /**
   * When set, this tile cycles through these source positions over time
   * instead of the fixed sx/sy above (Tiled's per-tile animation - water
   * waves today). `sx`/`sy` above stay as the *first* frame, so anything
   * that ignores this field (there is nothing that does, but just in case)
   * still draws a reasonable static tile rather than nothing. `dx`/`dy`/
   * `rotate`/`flip` don't change per frame - only which pixels get sampled
   * does - see atlas.ts.
   */
  animationFrames?: { sx: number; sy: number }[];
  /** How long each entry in animationFrames is shown, in ms. */
  frameDurationMs?: number;
};

export type SceneId = "village" | "room";

export type SceneLayer = {
  name: string;
  /**
   * tilesByTileset[i] are the tiles drawn against this scene's i-th tileset
   * image - the images themselves are loaded separately by each scene's own
   * component (Room.tsx / Village.tsx), since Metro needs a literal
   * `require(...)` path per image and can't take one generically.
   */
  tilesByTileset: Tile[][];
};

/** Walking into `trigger` switches to `targetScene`, landing at `targetSpawn`. */
export type Portal = {
  trigger: Bounds;
  targetScene: SceneId;
  targetSpawn: { x: number; y: number };
};

export type Scene = {
  id: SceneId;
  tileSize: number;
  /**
   * How many tiles tall the camera aims to show - the zoom level, in
   * effect. Scene data, not screen policy: what counts as "enough of the
   * scene visible" depends on that scene's own geography (a small room vs.
   * a whole village), so HomeScreen just reads this rather than hardcoding
   * a value per scene.
   */
  preferredTilesVisibleTall: number;
  /** Bottom-to-top draw order. */
  layers: SceneLayer[];
  /**
   * Omitted where a scene has no interior obstacles besides its own outer
   * wall - the room's `walkable` box already excludes that, same as before
   * this type existed. The village's is a real imported-terrain grid.
   */
  tileCollision?: TileCollision;
  width: number;
  height: number;
  /** Where the character's feet may go, in room pixels. */
  walkable: Bounds;
  /** Bounds an item may be placed/dragged within. */
  bounds: Bounds;
  /**
   * If set, an item's footprint anchor must land on a tile this grid marks
   * `1` (see useWorldItems.ts's `isValidPlacement`) - e.g. the village
   * restricts placement to grass/beach/paths and the like, not fences or
   * house walls. Omitted (the room) means anywhere in `bounds` is valid,
   * unchanged from before this existed.
   */
  placementMask?: TileCollision;
  /**
   * The name of the one layer (if any) that should draw *above* items and
   * the character instead of below - e.g. the village's roof overhangs, so
   * the character visibly walks behind them instead of over them. Omitted
   * (the room) means every layer draws below, unchanged from before this
   * existed.
   */
  topLayerName?: string;
  /** Default spawn, used on a cold app start (not via a portal). */
  start: { x: number; y: number };
  portals: Portal[];
};
