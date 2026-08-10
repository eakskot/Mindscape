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

import type { Bounds, TileCollision } from "../bounds";
import { FRAME_WIDTH } from "../characterSheet";
import type { Tile } from "../roomLayout";
import {
  VILLAGE_COLUMNS,
  VILLAGE_LAYERS,
  VILLAGE_ROWS,
  VILLAGE_SPAWN,
  VILLAGE_TILE,
  VILLAGE_TILESETS,
} from "./villageMap.generated";

export { VILLAGE_TILE };

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
export const VILLAGE_TILES_VISIBLE_TALL = 32;

export type VillageDrawLayer = {
  name: string;
  /** tilesByTileset[i] are the tiles drawn against VILLAGE_TILESETS[i]. */
  tilesByTileset: Tile[][];
};

export type VillageLayout = {
  layers: VillageDrawLayer[];
  tileCollision: TileCollision;
  width: number;
  height: number;
  /** Where the character's feet may go, in village room pixels. */
  walkable: Bounds;
  /** Bounds an item may be placed/dragged within. */
  bounds: Bounds;
  start: { x: number; y: number };
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

const buildVillageLayout = (): VillageLayout => {
  const layers: VillageDrawLayer[] = [];
  const grid = new Uint8Array(VILLAGE_COLUMNS * VILLAGE_ROWS);

  for (const layer of VILLAGE_LAYERS) {
    const tilesByTileset: Tile[][] = VILLAGE_TILESETS.map(() => []);
    const isCollisionLayer = layer.name.endsWith("_collision");

    for (let row = 0; row < VILLAGE_ROWS; row++) {
      for (let column = 0; column < VILLAGE_COLUMNS; column++) {
        const gid = layer.gids[row * VILLAGE_COLUMNS + column];
        if (gid === 0) {
          continue;
        }

        const tilesetIndex = resolveTilesetIndex(gid);
        const tileset = VILLAGE_TILESETS[tilesetIndex];
        const localIndex = gid - tileset.firstGid;
        const sourceColumn = localIndex % tileset.columns;
        const sourceRow = Math.floor(localIndex / tileset.columns);

        tilesByTileset[tilesetIndex].push({
          sx: sourceColumn * VILLAGE_TILE,
          sy: sourceRow * VILLAGE_TILE,
          dx: column * VILLAGE_TILE,
          dy: row * VILLAGE_TILE,
        });

        if (isCollisionLayer) {
          grid[row * VILLAGE_COLUMNS + column] = 1;
        }
      }
    }

    layers.push({ name: layer.name, tilesByTileset });
  }

  const width = VILLAGE_COLUMNS * VILLAGE_TILE;
  const height = VILLAGE_ROWS * VILLAGE_TILE;

  return {
    layers,
    tileCollision: {
      grid,
      columns: VILLAGE_COLUMNS,
      rows: VILLAGE_ROWS,
      tileSize: VILLAGE_TILE,
    },
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
  };
};

/** The village scene the app shows, built once from the imported map. */
export const VILLAGE = buildVillageLayout();

export const VILLAGE_WIDTH = VILLAGE.width;
export const VILLAGE_HEIGHT = VILLAGE.height;
