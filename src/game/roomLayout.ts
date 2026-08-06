/**
 * Turns a RoomConfig into the tiles to draw. Knows about room shape, not about
 * which art style is in use - that comes from the tileset lookup in tilesets.ts.
 *
 * The room is a box: a two tile tall back wall, one tile of wall along the left,
 * right and bottom edges, floor in between.
 */

import { FRAME_WIDTH } from "./characterSheet";
import { ROOM_CONFIG, type RoomConfig } from "./roomConfig";
import { FLOOR_TILESET, TILE, WALL_TILESET, styleOrigin } from "./tilesets";

export { TILE };

/** One tile to draw: source rect in the tileset, destination in room pixels. */
export type Tile = { sx: number; sy: number; dx: number; dy: number };

export type RoomLayout = {
  floorTiles: Tile[];
  wallTiles: Tile[];
  /** Room size in pixels. */
  width: number;
  height: number;
  /** Where the character's feet may go, in room pixels. */
  walkable: { minX: number; maxX: number; minY: number; maxY: number };
};

export const buildRoomLayout = (config: RoomConfig): RoomLayout => {
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

  return {
    floorTiles,
    wallTiles,
    width: columns * TILE,
    height: rows * TILE,
    walkable: {
      minX: TILE + FRAME_WIDTH / 2,
      maxX: (columns - 1) * TILE - FRAME_WIDTH / 2,
      minY: 3 * TILE,
      maxY: (rows - 1) * TILE,
    },
  };
};

/** The room the app shows, built from the config. */
export const ROOM = buildRoomLayout(ROOM_CONFIG);

export const ROOM_WIDTH = ROOM.width;
export const ROOM_HEIGHT = ROOM.height;
export const WALKABLE = ROOM.walkable;
