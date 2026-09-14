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

/**
 * One horizontal strip of free-standing scenery (trees, rocks, bushes) that
 * must draw in front of or behind the character and placed items depending
 * on where it stands, instead of always-below (an ordinary SceneLayer) or
 * always-above (`topLayerName`) - see villageLayout.ts on why a flat CSV
 * layer can't express this.
 *
 * A *band*, not a piece: every scenery tile whose baseline is the same (in
 * practice, that sits on the same map row) is grouped so the whole strip
 * draws as one batched `<Atlas>` per tileset and shares one behind/front
 * decision, Y-sorted against items and the character by `baseline`
 * (HomeScreen.tsx's combined, pre-sorted list). Grouping by an *exact*
 * shared baseline keeps this lossless - every tile in the band genuinely
 * wants the same occlusion result - while collapsing ~1500 single-tile
 * nodes (each its own draw call and per-frame worklet) down to ~80.
 */
export type SceneSceneryBand = {
  /** The point every tile in this band is Y-sorted against the character by. */
  baseline: number;
  /**
   * Parallel to the scene's tileset images, exactly like SceneLayer's own
   * field - tilesByTileset[i] draws against tileset image i.
   */
  tilesByTileset: Tile[][];
};

/**
 * One removable piece of scenery made of several tile objects tagged with
 * the same Tiled `group` custom property (a multi-tile tree, typically) -
 * see villageMap.generated.ts's `VillageSceneryInstance.group` and
 * villageLayout.ts's `removeVillageSceneryGroup`. Unlike SceneSceneryBand
 * (which only exists to batch draw calls and is never addressed by id
 * again), a group keeps enough identity to be hit-tested, highlighted, and
 * removed as one unit at runtime.
 */
export type SceneryGroup = {
  /** The Tiled `group` property's value, e.g. "tree_04" - stable, author-chosen. */
  id: string;
  /** Same convention as SceneSceneryBand.baseline - the bottom of the group's lowest tile. */
  baseline: number;
  /** Parallel to the scene's tileset images, same shape as SceneLayer/SceneSceneryBand. */
  tilesByTileset: Tile[][];
  /** Room-pixel bounding box of every tile in the group - hit-testing and UI placement. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Grid cells the group occupies, so removing it can clear collision/placement precisely. */
  cells: { column: number; row: number; solid: boolean }[];
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
   * Free-standing scenery, pre-grouped into baseline-sorted bands and
   * Y-sorted against the character and placed items - see SceneSceneryBand.
   * Omitted (the room) means none; HomeScreen.tsx treats a missing array
   * the same as empty.
   */
  sceneryBands?: SceneSceneryBand[];
  /**
   * Removable scenery - trees (and anything else) tagged with a Tiled
   * `group` property, individually selectable and deletable at runtime. See
   * SceneryGroup. Omitted (the room) means none, same spirit as
   * `sceneryBands`.
   */
  sceneryGroups?: SceneryGroup[];
  /**
   * An ambient character that only wanders - never walked by a tap, never
   * triggers a portal (see WanderingNpc). The value is where it spawns and
   * centres its roaming, in room pixels. Omitted = no NPC in this scene
   * (the room); HomeScreen.tsx just doesn't mount one.
   */
  wanderingNpc?: { spawn: { x: number; y: number } };
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
