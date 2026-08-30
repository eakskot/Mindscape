/**
 * The one place the room is described. Change `floorStyle` / `wallStyle` to
 * restyle the room - no renderer code needs to know about it.
 *
 * Style numbers start at 0 at the top of the leftmost column of the tileset and
 * count **downwards**, continuing at the top of the next column. Open
 * `docs/tile-styles-floors.png` / `docs/tile-styles-walls.png` to see every
 * style with its number on it.
 *
 *   floorStyle: 0-71   (a few are the pack's semi-transparent overlay floors)
 *   wallStyle:  0-53
 */
export type RoomConfig = {
  /** Room size in tiles, walls included. */
  columns: number;
  rows: number;
  floorStyle: number;
  wallStyle: number;
};

export const ROOM_CONFIG: RoomConfig = {
  columns: 12,
  rows: 9,
  floorStyle: 9, // warm wooden planks
  wallStyle: 39, // light wallpaper with diamonds
};
