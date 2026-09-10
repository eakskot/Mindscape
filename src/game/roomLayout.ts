/**
 * Turns a RoomConfig into a Scene. Knows about room shape, not about which
 * art style is in use - that comes from the tileset lookup in tilesets.ts.
 *
 * The room is a box: a two tile tall back wall, one tile of wall along the left,
 * right and bottom edges, floor in between.
 */

import { FRAME_WIDTH } from "./characterSheet";
import { ROOM_CONFIG, type RoomConfig } from "./roomConfig";
import type { Scene, Tile } from "./scene";
import { FLOOR_TILESET, TILE, WALL_TILESET, styleOrigin } from "./tilesets";

/**
 * How many tiles tall the camera aims to show. The room is only 9 rows tall,
 * so this is chosen to fill the *width* of a portrait screen at a sensible
 * integer scale instead - see useCamera.ts's `cameraRange`, which centres a
 * scene smaller than the viewport rather than pinning it to a corner.
 */
const ROOM_TILES_VISIBLE_TALL = 20;

export const buildRoomLayout = (config: RoomConfig): Scene => {
  const { columns, rows } = config;
  const floor = styleOrigin(FLOOR_TILESET, config.floorStyle);
  const wall = styleOrigin(WALL_TILESET, config.wallStyle);

  const floorTiles: Tile[] = [];
  for (let row = 2; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      floorTiles.push({
        // A floor style is a 3x2 pattern, so wrap the source coordinates.
        sx: floor.x + (column % 3) * TILE,
        sy: floor.y + (row % 2) * TILE,
        dx: column * TILE,
        dy: row * TILE,
      });
    }
  }

  // A wall style is a horizontal 3-slice: end cap, middle, end cap.
  const sliceColumn = (column: number) =>
    column === 0 ? 0 : column === columns - 1 ? 2 : 1;
  const wallTiles: Tile[] = [];

  // Back wall, two tiles tall.
  for (let column = 0; column < columns; column++) {
    const sx = wall.x + sliceColumn(column) * TILE;
    wallTiles.push({ sx, sy: wall.y, dx: column * TILE, dy: 0 });
    wallTiles.push({ sx, sy: wall.y + TILE, dx: column * TILE, dy: TILE });
  }
  // Left and right edges, using the lower wall row so the baseboard shows.
  for (let row = 2; row < rows - 1; row++) {
    wallTiles.push({ sx: wall.x, sy: wall.y + TILE, dx: 0, dy: row * TILE });
    wallTiles.push({
      sx: wall.x + 2 * TILE,
      sy: wall.y + TILE,
      dx: (columns - 1) * TILE,
      dy: row * TILE,
    });
  }
  // Bottom edge.
  for (let column = 0; column < columns; column++) {
    wallTiles.push({
      sx: wall.x + sliceColumn(column) * TILE,
      sy: wall.y + TILE,
      dx: column * TILE,
      dy: (rows - 1) * TILE,
    });
  }

  const width = columns * TILE;
  const height = rows * TILE;
  const walkable = {
    minX: TILE + FRAME_WIDTH / 2,
    maxX: (columns - 1) * TILE - FRAME_WIDTH / 2,
    minY: 3 * TILE,
    maxY: (rows - 1) * TILE,
  };

  return {
    id: "room",
    tileSize: TILE,
    preferredTilesVisibleTall: ROOM_TILES_VISIBLE_TALL,
    // Two tilesets (floor, wall) - each layer only ever fills its own slot,
    // same "N layers x M tilesets" shape the village uses with N=10, M=3.
    layers: [
      { name: "floor", tilesByTileset: [floorTiles, []] },
      { name: "wall", tilesByTileset: [[], wallTiles] },
    ],
    // No interior obstacles besides the outer wall, which `walkable` already
    // excludes - same as before this type existed, no grid needed.
    width,
    height,
    walkable,
    // Items may be placed anywhere in the room, one tile in from the edge.
    bounds: {
      minX: TILE,
      minY: TILE,
      maxX: width - TILE,
      maxY: height - TILE,
    },
    start: {
      x: (walkable.minX + walkable.maxX) / 2,
      y: (walkable.minY + walkable.maxY) / 2,
    },
    portals: [
      {
        // Near the bottom wall - there's no door sprite drawn here yet (see
        // the plan notes), the exit works functionally without one for now.
        trigger: { minX: 80, maxX: 112, minY: 112, maxY: 128 },
        targetScene: "village",
        // Hardcoded rather than importing VILLAGE.start / the village's
        // portal, to avoid a circular import - this is the porch tile
        // right in front of the door. It lands *inside* the village's own
        // door trigger (see villageLayout.ts), not south of it - that's
        // fine because usePortalWatcher only fires on crossing a trigger's
        // boundary, not on merely standing inside one, so arriving here
        // doesn't bounce the player straight back in.
        targetSpawn: { x: 904, y: 792 },
      },
    ],
  };
};

export const ROOM = buildRoomLayout(ROOM_CONFIG);
