/**
 * Turns the imported Serene Village map into tile lists to draw, plus the
 * tile-collision grid and walkable bounds the character/item system need.
 *
 * Mirrors roomLayout.ts's job for the procedural room, but the source data
 * here is an imported tile grid (villageMap.generated.ts) instead of a
 * formula - see scripts/import-village-map.mjs to change what is imported.
 *
 * The whole map is imported (not just a crop) because the camera follows the
 * character now, so there is no "must fit on one screen" constraint. That
 * makes the collision layers' tile count too large for a linear Rect[] scan
 * (thousands of water tiles alone) to stay cheap on the movement worklet, so
 * collision is a flat Uint8Array grid instead - an O(1) lookup per check,
 * unlike the per-item Rect[] list in useWorldItems.ts, which stays small.
 */

import { FRAME_WIDTH } from "../characterSheet";
import type { Scene, SceneLayer, SceneSceneryBand, Tile } from "../scene";
import {
  VILLAGE_COLUMNS,
  VILLAGE_LAYERS,
  VILLAGE_ROWS,
  VILLAGE_SCENERY,
  VILLAGE_SPAWN,
  VILLAGE_TILE,
  VILLAGE_TILESETS,
} from "./villageMap.generated";

/**
 * How many tiles tall the camera aims to show - the zoom level, in effect.
 * Lives here rather than in HomeScreen because the right value is village
 * geography, not screen policy: the house near spawn is ~15 tiles wide, ~10
 * tall, and on a portrait screen the narrower dimension (width) is what
 * actually limits how much of it fits, so this number alone doesn't
 * guarantee the whole building is in frame. The eventual top/bottom menu
 * chrome sits on top of the scene rather than shrinking it, so this still
 * targets the full screen height.
 */
// The *default* framing (the player can pinch-zoom in HomeScreen). Lower =
// more zoomed in. 22 puts the base scale at 2x on a typical phone, leaving a
// clean integer step out (survey the area) and several in (detail).
export const VILLAGE_TILES_VISIBLE_TALL = 22;

// Tiled encodes each cell's orientation as the top 3 bits of the GID:
// horizontal flip, vertical flip, diagonal flip (a transpose), applied in
// that order. That gives the 8 elements of a square's symmetry group, which
// this decodes into "rotate, then optionally mirror" - the shape atlas.ts
// actually knows how to draw (see Tile in scene.ts). Table derived by
// composing the three reflections as matrices and matching each of the 8
// results against a canonical rotate/mirror pair; e.g. horizontal+vertical
// flip together is a pure 180° rotation (no mirror), which is a well-known
// sanity check this table satisfies.
const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const FLIP_D = 0x20000000;
const FLIP_MASK = 0x1fffffff;

const ORIENTATION: Record<string, { rotate: 0 | 90 | 180 | 270; flip: boolean }> = {
  "000": { rotate: 0, flip: false },
  "100": { rotate: 270, flip: true }, // diagonal only
  "010": { rotate: 0, flip: true }, // horizontal only
  "001": { rotate: 180, flip: true }, // vertical only
  "110": { rotate: 90, flip: false }, // diagonal + horizontal
  "101": { rotate: 270, flip: false }, // diagonal + vertical
  "011": { rotate: 180, flip: false }, // horizontal + vertical
  "111": { rotate: 90, flip: true }, // all three
};

const decodeOrientation = (gid: number) => {
  const key =
    (gid & FLIP_D ? "1" : "0") + (gid & FLIP_H ? "1" : "0") + (gid & FLIP_V ? "1" : "0");
  return ORIENTATION[key];
};

/**
 * Which tileset a GID belongs to. Tilesets are sorted by firstGid ascending,
 * so the answer is the last one whose firstGid is still <= gid.
 */
const resolveTilesetIndex = (gid: number): number => {
  let index = -1;
  for (let i = 0; i < VILLAGE_TILESETS.length; i++) {
    if (VILLAGE_TILESETS[i].firstGid <= gid) {
      index = i;
    } else {
      break;
    }
  }
  if (index === -1) {
    throw new Error(`GID ${gid} is below every tileset's firstGid.`);
  }
  return index;
};

/**
 * `{sx,sy}` for every frame of a tileset-local animation, in room pixels.
 * Cached per (tileset, localId) and reused for every tile instance that
 * plays it - the village has ~2500 such instances (mostly water) all
 * sharing the same handful of animation definitions, so this avoids
 * reallocating an identical 14-entry array per instance.
 */
const animationFrameCache = new Map<string, { sx: number; sy: number }[]>();
const animationFramesFor = (
  tilesetIndex: number,
  tileset: (typeof VILLAGE_TILESETS)[number],
  localId: number,
) => {
  const animation = tileset.animations[localId];
  if (!animation) {
    return undefined;
  }
  const key = `${tilesetIndex}-${localId}`;
  const cached = animationFrameCache.get(key);
  if (cached) {
    return cached;
  }
  const frames = animation.frames.map((frameId) => ({
    sx: (frameId % tileset.columns) * VILLAGE_TILE,
    sy: Math.floor(frameId / tileset.columns) * VILLAGE_TILE,
  }));
  animationFrameCache.set(key, frames);
  return frames;
};

/**
 * A raw GID (flip bits and all) decoded into the tile atlas.ts knows how to
 * draw, plus which tileset it belongs to - the one piece of per-cell logic
 * both an ordinary layer cell and a free-standing scenery tile need, so it
 * lives here once instead of twice.
 */
const tileFor = (rawGid: number, column: number, row: number) => {
  const gid = rawGid & FLIP_MASK;
  const { rotate, flip } = decodeOrientation(rawGid);
  const tilesetIndex = resolveTilesetIndex(gid);
  const tileset = VILLAGE_TILESETS[tilesetIndex];
  const localIndex = gid - tileset.firstGid;
  const sourceColumn = localIndex % tileset.columns;
  const sourceRow = Math.floor(localIndex / tileset.columns);
  const animationFrames = animationFramesFor(tilesetIndex, tileset, localIndex);
  const tile: Tile = {
    sx: sourceColumn * VILLAGE_TILE,
    sy: sourceRow * VILLAGE_TILE,
    dx: column * VILLAGE_TILE,
    dy: row * VILLAGE_TILE,
    rotate,
    flip,
    animationFrames,
    frameDurationMs: animationFrames
      ? tileset.animations[localIndex].frameDurationMs
      : undefined,
  };
  return { tile, tilesetIndex };
};

/**
 * Which of the map's own layers count as valid ground for a placed item -
 * everything else (fences, houses, scenery's own footprint, ...) is
 * off-limits, the same spirit as the tile-collision grid below but for
 * "may an item stand here" instead of "may the character stand here". See
 * useWorldItems.ts's `isValidPlacement`.
 *
 * Not a simple "any of these layers has a tile" OR, though - `ground_grass`
 * is the base ground layer and covers nearly the *whole* map, including
 * every tile a fence or house also stands on (they're drawn on top of it,
 * not instead of it). A cell only counts as valid ground if one of these
 * layers has a tile there *and* nothing else (another layer, or a piece of
 * scenery) blocks it - see the two-grid pass below.
 */
const PLACEMENT_LAYER_NAMES = new Set([
  "ground_grass",
  "ground_water_collision",
  "ground_beach",
  "ground_paths",
  "deco_small_extras",
]);

const buildVillageLayout = (): Scene => {
  const layers: SceneLayer[] = [];
  const grid = new Uint8Array(VILLAGE_COLUMNS * VILLAGE_ROWS);
  // Two passes combined after the loop (see PLACEMENT_LAYER_NAMES's own
  // comment): allowedGrid is "an allowed ground layer has a tile here",
  // blockedGrid is "some other layer does too" - a cell is only placeable
  // ground if the former is true and the latter isn't.
  const allowedGrid = new Uint8Array(VILLAGE_COLUMNS * VILLAGE_ROWS);
  const blockedGrid = new Uint8Array(VILLAGE_COLUMNS * VILLAGE_ROWS);

  for (const layer of VILLAGE_LAYERS) {
    const tilesByTileset: Tile[][] = VILLAGE_TILESETS.map(() => []);
    const isCollisionLayer = layer.collision;
    const isPlacementLayer = PLACEMENT_LAYER_NAMES.has(layer.name);

    for (let row = 0; row < VILLAGE_ROWS; row++) {
      for (let column = 0; column < VILLAGE_COLUMNS; column++) {
        const rawGid = layer.gids[row * VILLAGE_COLUMNS + column];
        if (rawGid === 0) {
          continue;
        }
        const { tile, tilesetIndex } = tileFor(rawGid, column, row);
        tilesByTileset[tilesetIndex].push(tile);

        if (isCollisionLayer) {
          grid[row * VILLAGE_COLUMNS + column] = 1;
        }
        if (isPlacementLayer) {
          allowedGrid[row * VILLAGE_COLUMNS + column] = 1;
        } else {
          blockedGrid[row * VILLAGE_COLUMNS + column] = 1;
        }
      }
    }

    layers.push({ name: layer.name, tilesByTileset });
  }

  // Free-standing scenery (trees, rocks, bushes): each piece blocks the
  // character (if `solid`, which every one the importer has produced so far
  // is) and blocks item placement, the same as the tile layers it used to
  // live in before it moved out to be Y-sorted - see this file's header
  // comment on why.
  //
  // Drawing is banded, not per-piece: every scenery tile on a given map row
  // shares one baseline (its row's bottom edge), so all of them want the
  // exact same behind/front result against the character. Grouping them into
  // one SceneSceneryBand per row turns ~1500 single-tile Skia nodes - each a
  // draw call and, through SceneLayerAtlas, two per-frame worklets - into
  // ~80 batched ones, with zero occlusion error since the grouping key *is*
  // the sort key. Bands are emitted baseline-ascending so HomeScreen.tsx can
  // merge them with the placed-items list (also baseline-ordered) directly.
  const bandTilesByRow = new Map<number, Tile[][]>();
  for (const instance of VILLAGE_SCENERY) {
    const column = instance.x / VILLAGE_TILE;
    const row = instance.y / VILLAGE_TILE;
    const { tile, tilesetIndex } = tileFor(instance.gid, column, row);

    if (instance.solid) {
      grid[row * VILLAGE_COLUMNS + column] = 1;
    }
    blockedGrid[row * VILLAGE_COLUMNS + column] = 1;

    let tilesByTileset = bandTilesByRow.get(row);
    if (!tilesByTileset) {
      tilesByTileset = VILLAGE_TILESETS.map(() => []);
      bandTilesByRow.set(row, tilesByTileset);
    }
    tilesByTileset[tilesetIndex].push(tile);
  }
  const sceneryBands: SceneSceneryBand[] = [...bandTilesByRow.entries()]
    .map(([row, tilesByTileset]) => ({
      baseline: (row + 1) * VILLAGE_TILE,
      tilesByTileset,
    }))
    .sort((a, b) => a.baseline - b.baseline);

  const placementGrid = new Uint8Array(VILLAGE_COLUMNS * VILLAGE_ROWS);
  for (let i = 0; i < placementGrid.length; i++) {
    placementGrid[i] = allowedGrid[i] === 1 && blockedGrid[i] === 0 ? 1 : 0;
  }

  const width = VILLAGE_COLUMNS * VILLAGE_TILE;
  const height = VILLAGE_ROWS * VILLAGE_TILE;

  return {
    id: "village",
    tileSize: VILLAGE_TILE,
    preferredTilesVisibleTall: VILLAGE_TILES_VISIBLE_TALL,
    layers,
    sceneryBands,
    // An ambient villager who potters about near the spawn/house - just off
    // the player's own spawn so they don't start stacked. See WanderingNpc.
    wanderingNpc: {
      spawn: { x: VILLAGE_SPAWN.x - 20, y: VILLAGE_SPAWN.y - 4 },
    },
    tileCollision: {
      grid,
      columns: VILLAGE_COLUMNS,
      rows: VILLAGE_ROWS,
      tileSize: VILLAGE_TILE,
    },
    placementMask: {
      grid: placementGrid,
      columns: VILLAGE_COLUMNS,
      rows: VILLAGE_ROWS,
      tileSize: VILLAGE_TILE,
    },
    // No dedicated "always draws above the character" layer any more - the
    // map's old top_layer_collision (what this used to point at) turned out
    // to hold almost every tree/rock/bush on the map, not the house's roof
    // as its own name and comment claimed, which is *why* an item placed
    // near any of them always rendered behind, never in front, regardless
    // of position (see this scene's own `scenery`, which now Y-sorts them
    // properly instead). The house's actual roof tiles live in
    // col_house_collision - a normal below layer, same as its walls -
    // pending a decision on which specific rows should overhang the
    // walking path in front of it; give this a real value again once
    // that's split out into its own layer.
    topLayerName: undefined,
    width,
    height,
    // The whole map, not an artificial radius - real containment comes from
    // the collision grid (water, fences, houses), same as the promo art.
    // Inset by half the character's width so its sprite never draws past
    // the map edge.
    walkable: {
      minX: FRAME_WIDTH / 2,
      maxX: width - FRAME_WIDTH / 2,
      minY: FRAME_WIDTH / 2,
      maxY: height - FRAME_WIDTH / 2,
    },
    // Items may be placed anywhere in the map, one tile in from the edge -
    // same spirit as the room's ROOM_BOUNDS.
    bounds: {
      minX: VILLAGE_TILE,
      minY: VILLAGE_TILE,
      maxX: width - VILLAGE_TILE,
      maxY: height - VILLAGE_TILE,
    },
    start: { x: VILLAGE_SPAWN.x, y: VILLAGE_SPAWN.y },
    portals: [
      {
        // The porch in front of the house door: source tile columns 55-57,
        // rows 48-49. There is no literal walkable gap in the door's own
        // tiles - every collision layer combined is solid through row 47 -
        // so this is a designed trigger zone (the first open rows below the
        // wall), not a hole in the collision grid. (An earlier version of
        // this placed the trigger at rows 46-47, which is *inside* the wall
        // and therefore unreachable - verified precisely against the whole
        // combined collision grid this time, not just the house's own
        // layer alone.)
        trigger: { minX: 880, maxX: 928, minY: 768, maxY: 800 },
        targetScene: "room",
        // Hardcoded rather than importing ROOM.start, to avoid a circular
        // import (roomLayout.ts's own portal points back here the same
        // way) - this is the room's walkable-box centre, same value
        // buildRoomLayout() computes as its `start`.
        targetSpawn: { x: 96, y: 88 },
      },
    ],
  };
};

/** The village scene the app shows, built once from the imported map. */
export const VILLAGE = buildVillageLayout();
