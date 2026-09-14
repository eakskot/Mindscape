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

import { makeMutable } from "react-native-reanimated";

import { FRAME_WIDTH } from "../characterSheet";
import type { Scene, SceneLayer, SceneryGroup, SceneSceneryBand, Tile } from "../scene";
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
  "ground_platform",
]);

/**
 * Built once, module-level, alongside `VILLAGE` below - see
 * `removeVillageSceneryGroup`'s own comment on why removal is an imperative
 * function over these shared buffers rather than something re-derived from
 * React state.
 *
 * `grid`/`placementGrid` here are the plain, cheaply-mutable *working*
 * copies `recomputeCell` writes into - not what `Scene.tileCollision`/
 * `placementMask` actually hand out (those are SharedValue-wrapped, built
 * from a snapshot of these after each change; see the `gridShared`/
 * `placementGridShared` locals below and bounds.ts's own comment on why a
 * plain array doesn't work for the movement worklet).
 */
type VillageGrids = {
  grid: Uint8Array;
  allowedGrid: Uint8Array;
  placementGrid: Uint8Array;
  /** Permanent contribution from ordinary tile layers - never changes after build. */
  layerCollision: Uint8Array;
  layerBlocked: Uint8Array;
  /**
   * Scenery's contribution, as a count rather than a bool: two pieces of
   * scenery (or a piece of scenery and a baked layer tile - confirmed to
   * happen, see CLAUDE.md's GID-overlap note) can legitimately occupy the
   * same cell. Removing one group must not reopen a cell something else is
   * still standing on, so the combined grid/placementGrid above are only
   * ever recomputed *from* these counts, never toggled directly.
   */
  sceneryCollisionCount: Uint16Array;
  sceneryBlockCount: Uint16Array;
};

/** Recomputes cell `index`'s combined grid/placementGrid from its current counts. */
const recomputeCell = (grids: VillageGrids, index: number) => {
  grids.grid[index] =
    grids.layerCollision[index] === 1 || grids.sceneryCollisionCount[index] > 0 ? 1 : 0;
  const blocked =
    grids.layerBlocked[index] === 1 || grids.sceneryBlockCount[index] > 0 ? 1 : 0;
  grids.placementGrid[index] =
    grids.allowedGrid[index] === 1 && blocked === 0 ? 1 : 0;
};

const buildVillageLayout = () => {
  const layers: SceneLayer[] = [];
  const cellCount = VILLAGE_COLUMNS * VILLAGE_ROWS;
  const grids: VillageGrids = {
    grid: new Uint8Array(cellCount),
    // Two contributions combined by recomputeCell (see PLACEMENT_LAYER_NAMES's
    // own comment): allowedGrid is "an allowed ground layer has a tile here",
    // *Blocked/*BlockCount is "something blocks placement here" - a cell is
    // only placeable ground if the former is true and the latter isn't.
    allowedGrid: new Uint8Array(cellCount),
    placementGrid: new Uint8Array(cellCount),
    layerCollision: new Uint8Array(cellCount),
    layerBlocked: new Uint8Array(cellCount),
    sceneryCollisionCount: new Uint16Array(cellCount),
    sceneryBlockCount: new Uint16Array(cellCount),
  };

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

        const index = row * VILLAGE_COLUMNS + column;
        if (isCollisionLayer) {
          grids.layerCollision[index] = 1;
        }
        if (isPlacementLayer) {
          grids.allowedGrid[index] = 1;
        } else {
          grids.layerBlocked[index] = 1;
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
  // Split in two by whether Tiled tagged the tile object with a `group`
  // property (see villageMap.generated.ts's VillageSceneryInstance):
  //
  // - Ungrouped pieces (a lone rock, a bush) are banded, not drawn one by
  //   one: every scenery tile on a given map row shares one baseline (its
  //   row's bottom edge), so all of them want the exact same behind/front
  //   result against the character. Grouping them into one SceneSceneryBand
  //   per row turns ~1500 single-tile Skia nodes - each a draw call and,
  //   through SceneLayerAtlas, two per-frame worklets - into ~80 batched
  //   ones, with zero occlusion error since the grouping key *is* the sort
  //   key. Bands are emitted baseline-ascending so HomeScreen.tsx can merge
  //   them with the placed-items list (also baseline-ordered) directly.
  // - Grouped pieces (several tiles making up one tree) become one
  //   SceneryGroup each instead of joining a row band, so they can be
  //   hit-tested, highlighted and removed as the one thing they visually
  //   are - see SceneryGroup and removeVillageSceneryGroup below.
  //
  // A Tiled `group` name is only trusted as "these tiles are adjacent" -
  // not as "this name is used nowhere else on the map". Names get reused
  // (confirmed: e.g. two unrelated bushes both tagged "bush_07"), so raw
  // instances are first bucketed by name, then split into one SceneryGroup
  // per 8-connected cluster within that bucket - splitCellsIntoClusters
  // below. A name used once still produces exactly one group; nothing
  // changes for the common case.
  const bandTilesByRow = new Map<number, Tile[][]>();
  type RawSceneryCell = {
    column: number;
    row: number;
    solid: boolean;
    tile: Tile;
    tilesetIndex: number;
  };
  const rawCellsByGroupName = new Map<string, RawSceneryCell[]>();

  for (const instance of VILLAGE_SCENERY) {
    const column = instance.x / VILLAGE_TILE;
    const row = instance.y / VILLAGE_TILE;
    const { tile, tilesetIndex } = tileFor(instance.gid, column, row);
    const index = row * VILLAGE_COLUMNS + column;

    if (instance.solid) {
      grids.sceneryCollisionCount[index] += 1;
    }
    grids.sceneryBlockCount[index] += 1;

    if (instance.group) {
      let cells = rawCellsByGroupName.get(instance.group);
      if (!cells) {
        cells = [];
        rawCellsByGroupName.set(instance.group, cells);
      }
      cells.push({ column, row, solid: instance.solid, tile, tilesetIndex });
      continue;
    }

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

  /**
   * Splits one group name's raw cells into 8-connected clusters (a cell
   * belongs to a cluster if it's touching, including diagonally, another
   * cell already in it) - each becomes an independent SceneryGroup. Pure
   * geometry, no semantic guessing: tiles that don't touch are never one
   * physical object no matter what the author named them, so this is a
   * strict correctness fix, not a heuristic (contrast the ungrouped-tile
   * auto-clustering idea rejected elsewhere - that one *would* have guessed).
   */
  const splitCellsIntoClusters = (cells: RawSceneryCell[]): RawSceneryCell[][] => {
    const byPosition = new Map(cells.map((cell) => [`${cell.column},${cell.row}`, cell]));
    const visited = new Set<string>();
    const clusters: RawSceneryCell[][] = [];
    for (const cell of cells) {
      const key = `${cell.column},${cell.row}`;
      if (visited.has(key)) {
        continue;
      }
      const cluster: RawSceneryCell[] = [];
      const stack = [cell];
      visited.add(key);
      while (stack.length > 0) {
        const current = stack.pop()!;
        cluster.push(current);
        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            if (dc === 0 && dr === 0) continue;
            const neighborKey = `${current.column + dc},${current.row + dr}`;
            const neighbor = byPosition.get(neighborKey);
            if (neighbor && !visited.has(neighborKey)) {
              visited.add(neighborKey);
              stack.push(neighbor);
            }
          }
        }
      }
      clusters.push(cluster);
    }
    return clusters;
  };

  const sceneryGroups: SceneryGroup[] = [...rawCellsByGroupName.entries()]
    .flatMap(([name, cells]) => {
      const clusters = splitCellsIntoClusters(cells);
      return clusters.map((cluster, clusterIndex) => {
        const tilesByTileset: Tile[][] = VILLAGE_TILESETS.map(() => []);
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const cell of cluster) {
          tilesByTileset[cell.tilesetIndex].push(cell.tile);
          const x = cell.column * VILLAGE_TILE;
          const y = cell.row * VILLAGE_TILE;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + VILLAGE_TILE);
          maxY = Math.max(maxY, y + VILLAGE_TILE);
        }
        return {
          // A name used just once keeps it as-is (the common case, and the
          // id an author sees in Tiled); a reused name gets a stable suffix
          // per cluster so removal only ever affects the one physically
          // touching piece a tap actually selected.
          id: clusters.length > 1 ? `${name}#${clusterIndex + 1}` : name,
          // Same convention as a band's baseline: the bottom of the group's
          // lowest tile - maxY already *is* that (see the loop above).
          baseline: maxY,
          tilesByTileset,
          bounds: { minX, minY, maxX, maxY },
          cells: cluster.map(({ column, row, solid }) => ({ column, row, solid })),
        };
      });
    })
    .sort((a, b) => a.baseline - b.baseline);

  for (let index = 0; index < cellCount; index++) {
    recomputeCell(grids, index);
  }

  // The first-ever value handed to each SharedValue - safe to pass the
  // working array directly here (nothing has cached a clone of it yet).
  // Every later change goes through `.value = <fresh copy>` instead - see
  // removeSceneryGroup below and bounds.ts's TileCollision comment.
  const gridShared = makeMutable(grids.grid);
  const placementGridShared = makeMutable(grids.placementGrid);

  const groupCellsById = new Map(
    sceneryGroups.map((group) => [group.id, group.cells] as const),
  );
  const removedGroupIds = new Set<string>();

  /**
   * Clears a scenery group's collision and placement-blocking footprint, so
   * the village's shared grids (built once, for the app's lifetime -
   * `VILLAGE` is a module-level singleton, not rebuilt per scene mount)
   * reflect a removed tree immediately for every consumer that reads them
   * (the movement worklet, item placement), without rebuilding the scene.
   * Idempotent - a second call for an already-removed or unknown id is a
   * no-op.
   *
   * Updates the plain working arrays in place (cheap - a handful of cells),
   * then pushes a *fresh copy* of each into its SharedValue in one go per
   * grid, rather than one `.value` write per cell - seeing bounds.ts's
   * TileCollision comment for why this has to go through `.value` at all,
   * and a fresh copy (not the same mutated-in-place array) so there's no
   * dependence on whether Reanimated treats a same-reference `.value` write
   * as a no-op.
   *
   * Deliberately does *not* touch `sceneryGroups`/rendering - what still
   * *draws* a removed group is a plain React-state concern the caller
   * (HomeScreen.tsx) filters on, so this staying a reference-stable, purely
   * imperative function doesn't fight React's memoization of the render
   * side. Returns whether it actually removed something, so the caller can
   * tell a stale/duplicate id from a real removal.
   */
  const removeSceneryGroup = (id: string): boolean => {
    if (removedGroupIds.has(id)) {
      return false;
    }
    const cells = groupCellsById.get(id);
    if (!cells) {
      return false;
    }
    removedGroupIds.add(id);
    for (const cell of cells) {
      const index = cell.row * VILLAGE_COLUMNS + cell.column;
      if (cell.solid) {
        grids.sceneryCollisionCount[index] -= 1;
      }
      grids.sceneryBlockCount[index] -= 1;
      recomputeCell(grids, index);
    }
    gridShared.value = grids.grid.slice();
    placementGridShared.value = grids.placementGrid.slice();
    return true;
  };

  const width = VILLAGE_COLUMNS * VILLAGE_TILE;
  const height = VILLAGE_ROWS * VILLAGE_TILE;

  const scene: Scene = {
    id: "village",
    tileSize: VILLAGE_TILE,
    preferredTilesVisibleTall: VILLAGE_TILES_VISIBLE_TALL,
    layers,
    sceneryBands,
    sceneryGroups,
    // An ambient villager who potters about near the spawn/house - just off
    // the player's own spawn so they don't start stacked. See WanderingNpc.
    wanderingNpc: {
      spawn: { x: VILLAGE_SPAWN.x - 20, y: VILLAGE_SPAWN.y - 4 },
    },
    tileCollision: {
      grid: gridShared,
      columns: VILLAGE_COLUMNS,
      rows: VILLAGE_ROWS,
      tileSize: VILLAGE_TILE,
    },
    placementMask: {
      grid: placementGridShared,
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

  return { scene, removeSceneryGroup };
};

const { scene: builtVillage, removeSceneryGroup } = buildVillageLayout();

/** The village scene the app shows, built once from the imported map. */
export const VILLAGE = builtVillage;

/**
 * Removes one removable scenery group (a tree tagged with a Tiled `group`
 * property) from the village's collision/placement grids - see
 * `buildVillageLayout`'s own comment on why this is separate from
 * `VILLAGE.sceneryGroups`, which the render side filters on instead. Returns
 * whether it actually removed something.
 */
export const removeVillageSceneryGroup = removeSceneryGroup;
