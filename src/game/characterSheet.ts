/**
 * Layout of the LimeZu "Modern Interiors" premade character sheets (16x16 version),
 * e.g. src/assets/sprites/player/Premade_Character_03.png.
 *
 * Sheet geometry (verified against Premade_Character_03.png, 896x656 px):
 *   - one frame is 16 x 32 px (the character is drawn in the lower 24 px of the frame,
 *     feet touch the bottom edge -> anchor the sprite by its bottom center)
 *   - the sheet is a grid of 56 columns x 20 rows of frames
 *
 * Every row is one animation. Rows that have four directions store them as four
 * blocks of N frames, always in the order RIGHT, UP, LEFT, DOWN.
 * Some rows are followed by extra frames that are not the character but props
 * (bed, book, shopping cart, muzzle flash ...) - those are ignored here.
 *
 * Row map (row: animation, frames per direction, directions available):
 *   0:  base poses,  1 frame,   4 dirs (one still frame per direction)
 *   1:  idle,        6,         4
 *   2:  walk,        6,         4
 *   3:  sleep,       6,         1 (lying down, front view) + bed props
 *   4:  sit,         6,         2 (right, left)
 *   5:  sit variant, 6,         2 (right, left)
 *   6:  phone,      12,         1 (front view; frames 4-9 are the loop)
 *   7:  read book,  12,         1 (front view; frames 1-6 are the loop) + book props
 *   8:  push cart,   6,         4 + cart props
 *   9:  pick up,    12,         4
 *   10: gift,       10,         4 + box props
 *   11: lift,       14,         4
 *   12: throw,      14,         4
 *   13: hit,         6,         4
 *   14: punch,       6,         4
 *   15: stab,        6,         4 + effect props
 *   16: grab gun,    4,         4
 *   17: gun idle,    6,         4
 *   18: shoot,       3,         4 + muzzle flash
 *   19: hurt,        3,         4
 *
 * Note: the pack has no running animation - "walk" at a higher fps is the usual trick.
 */

export const FRAME_WIDTH = 16;
export const FRAME_HEIGHT = 32;

export type Direction = "right" | "up" | "left" | "down";

/** Block order inside a four-directional row. */
export const DIRECTIONS: Direction[] = ["right", "up", "left", "down"];

export type AnimationName = "idle" | "walk" | "sleep" | "phone" | "book" | "sit";

export type Clip = {
  /** Row in the sheet. */
  row: number;
  /** Number of frames the loop plays. */
  frameCount: number;
  /** Frames per second. */
  fps: number;
  /** First column of the loop, per direction. */
  columns: Record<Direction, number>;
};

/**
 * Ready-to-use clips. `columns` maps a direction to the first column of that
 * direction's block: block index * frames per direction, plus an offset when the
 * loop does not start on the first frame of the row.
 *
 * Animations the pack only ships for one or two directions reuse the same frames
 * for the missing directions.
 */
export const CHARACTER_ANIMATIONS: Record<AnimationName, Clip> = {
  idle: {
    row: 1,
    frameCount: 6,
    fps: 5,
    columns: { right: 0, up: 6, left: 12, down: 18 },
  },
  walk: {
    row: 2,
    frameCount: 6,
    fps: 9,
    columns: { right: 0, up: 6, left: 12, down: 18 },
  },
  // Only drawn as a front view, so every direction points at the same frames.
  sleep: {
    row: 3,
    frameCount: 6,
    fps: 2,
    columns: { right: 0, up: 0, left: 0, down: 0 },
  },
  // Row 6 is 12 frames: 0-2 raise the phone, 3-8 is the loop, 9-11 put it away.
  phone: {
    row: 6,
    frameCount: 6,
    fps: 8,
    columns: { right: 3, up: 3, left: 3, down: 3 },
  },
  // Row 7 is 12 frames: 0-5 is the loop, the rest opens/closes the book.
  book: {
    row: 7,
    frameCount: 6,
    fps: 8,
    columns: { right: 0, up: 0, left: 0, down: 0 },
  },
  // The pack only draws sitting to the right and to the left.
  sit: {
    row: 4,
    frameCount: 6,
    fps: 5,
    columns: { right: 0, up: 0, left: 6, down: 6 },
  },
};
