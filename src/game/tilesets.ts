/**
 * Style lookup for the LimeZu "Modern Interiors" Room_Builder tilesets (16x16).
 *
 * Both tilesets are grids of **style blocks**, and every block is 3 tiles wide
 * and 2 tiles tall:
 *
 *   Floors - the 3x2 block is a repeating pattern. Tile it with source column
 *            `col % 3` and source row `row % 2`, or the pattern breaks.
 *   Walls  - the 3x2 block is a two tile tall wall, sliced horizontally:
 *            source column 0 = left end cap, 1 = seamless middle, 2 = right end cap.
 *            The upper tile row is the top of the wall, the lower row has the baseboard.
 *
 * Styles are numbered from 0, starting at the top of the leftmost column and
 * running **downwards**. When a column runs out, numbering continues at the top
 * of the next column. `docs/tile-styles-floors.png` and `docs/tile-styles-walls.png`
 * show every style with its number on it.
 */

export const TILE = 16;

export type Tileset = {
  /** Top-left corner of style 0. */
  originX: number;
  originY: number;
  /** Distance between style blocks. */
  columnStride: number;
  rowStride: number;
  /** How many styles each column holds, left to right (the columns are ragged). */
  blocksPerColumn: readonly number[];
};

/** Room_Builder_Floors_16x16.png (240x640) - 72 styles. */
export const FLOOR_TILESET: Tileset = {
  // The very first sheet row holds no usable style, so style 0 starts at y = 32.
  originX: 0,
  originY: 32,
  columnStride: 64,
  rowStride: 32,
  blocksPerColumn: [18, 18, 18, 18],
};

/** Room_Builder_Walls_16x16.png (512x640) - 54 styles. */
export const WALL_TILESET: Tileset = {
  originX: 0,
  originY: 0,
  columnStride: 176,
  rowStride: 32,
  blocksPerColumn: [18, 19, 17],
};

export const styleCount = (tileset: Tileset) =>
  tileset.blocksPerColumn.reduce((total, blocks) => total + blocks, 0);

/**
 * Top-left pixel of a style block in its tileset. Walks down each column in
 * turn, which is why a style number is just "how far down the tileset am I".
 */
export const styleOrigin = (tileset: Tileset, style: number) => {
  const total = styleCount(tileset);
  if (!Number.isInteger(style) || style < 0 || style >= total) {
    throw new Error(`Tile style ${style} is out of range (0-${total - 1}).`);
  }
  let remaining = style;
  let column = 0;
  while (remaining >= tileset.blocksPerColumn[column]) {
    remaining -= tileset.blocksPerColumn[column];
    column += 1;
  }
  return {
    x: tileset.originX + column * tileset.columnStride,
    y: tileset.originY + remaining * tileset.rowStride,
  };
};
