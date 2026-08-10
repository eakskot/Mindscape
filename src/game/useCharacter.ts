import { useCallback } from "react";
import {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import type { Bounds, TileCollision } from "./bounds";
import { clamp } from "./bounds";
import {
  CHARACTER_ANIMATIONS,
  type AnimationName,
  type Direction,
} from "./characterSheet";
import type { Rect } from "./items/itemCatalog";

/** Walking speed in room pixels per second (16 px = one tile). */
const SPEED = 26;

/**
 * Give up on a target after this many seconds without getting closer to it.
 * Long enough that the character may slide the full width of a big item on its
 * way around it, since sliding does not reduce the distance to the target.
 */
const STUCK_TIMEOUT = 1.5;
/** How much closer the character must get for it to count as progress. */
const PROGRESS_EPSILON = 0.5;
/** A sideways slide has to actually move the character to count as one. */
const MIN_STEP = 0.05;

/**
 * Everything about the character lives on the UI thread as shared values, so
 * movement and animation run at display refresh rate without touching React.
 *
 * The character wanders on its own within `walkable`, walks to wherever
 * `walkTo` points it (clamped to the same box), and is blocked by the
 * footprints in `obstacles` (item collision) and, if given, `tileCollision`
 * (imported map terrain). `walkable` and `start` are scene data - the room
 * and the village each pass their own.
 */
export const useCharacter = (
  obstacles: SharedValue<Rect[]>,
  walkable: Bounds,
  start: { x: number; y: number },
  tileCollision?: TileCollision,
) => {
  const x = useSharedValue(start.x);
  const y = useSharedValue(start.y);
  const targetX = useSharedValue(start.x);
  const targetY = useSharedValue(start.y);
  const pauseLeft = useSharedValue(2);

  /** Progress watchdog: how close we have got, and for how long we have not. */
  const bestDistance = useSharedValue(Infinity);
  const stuckFor = useSharedValue(0);

  const animation = useSharedValue<AnimationName>("idle");
  const direction = useSharedValue<Direction>("down");

  /** The frame to draw, as a column/row in the sprite sheet. */
  const column = useSharedValue(CHARACTER_ANIMATIONS.idle.columns.down);
  const row = useSharedValue(CHARACTER_ANIMATIONS.idle.row);
  const elapsed = useSharedValue(0);

  // Defined once per useCharacter() call rather than inside the frame
  // callback below, so the movement loop is not allocating four fresh
  // closures every single frame at 60fps - they still close over the same
  // shared values either way, since those are stable references.

  /** Blocked by the imported map's terrain (water, walls, fences, ...)? */
  const isTileBlocked = (feetX: number, feetY: number) => {
    "worklet";
    if (!tileCollision) {
      return false;
    }
    const col = Math.floor(feetX / tileCollision.tileSize);
    const tileRow = Math.floor(feetY / tileCollision.tileSize);
    if (
      col < 0 ||
      tileRow < 0 ||
      col >= tileCollision.columns ||
      tileRow >= tileCollision.rows
    ) {
      // Off the edge of the imported map - nothing there to stand on.
      return true;
    }
    return tileCollision.grid[tileRow * tileCollision.columns + col] === 1;
  };

  /** Can the character's feet stand here? */
  const isFree = (feetX: number, feetY: number) => {
    "worklet";
    if (isTileBlocked(feetX, feetY)) {
      return false;
    }
    for (const rect of obstacles.value) {
      if (
        feetX > rect.x &&
        feetX < rect.x + rect.width &&
        feetY > rect.y &&
        feetY < rect.y + rect.height
      ) {
        return false;
      }
    }
    return true;
  };

  const pickTarget = () => {
    "worklet";
    // A few tries, so a target rarely lands inside furniture.
    for (let attempt = 0; attempt < 12; attempt++) {
      const nextX =
        walkable.minX + Math.random() * (walkable.maxX - walkable.minX);
      const nextY =
        walkable.minY + Math.random() * (walkable.maxY - walkable.minY);
      if (isFree(nextX, nextY)) {
        targetX.value = nextX;
        targetY.value = nextY;
        bestDistance.value = Infinity;
        stuckFor.value = 0;
        return;
      }
    }
  };

  /** Stop chasing the current target: the idle branch takes over next frame. */
  const abandonTarget = () => {
    "worklet";
    targetX.value = x.value;
    targetY.value = y.value;
    bestDistance.value = Infinity;
    stuckFor.value = 0;
  };

  useFrameCallback((frameInfo) => {
    "worklet";
    // Clamped so a dropped frame does not teleport the character.
    const dt = Math.min((frameInfo.timeSincePreviousFrame ?? 16) / 1000, 0.05);

    const dx = targetX.value - x.value;
    const dy = targetY.value - y.value;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 1) {
      if (animation.value === "walk") {
        animation.value = "idle";
        pauseLeft.value = 1.5 + Math.random() * 3;
      } else {
        pauseLeft.value -= dt;
        if (pauseLeft.value <= 0) {
          pickTarget();
        }
      }
    } else {
      animation.value = "walk";

      // Watchdog. Collision can block the character in shapes no single check
      // predicts, so the reliable signal is simply "am I getting closer".
      if (distance < bestDistance.value - PROGRESS_EPSILON) {
        bestDistance.value = distance;
        stuckFor.value = 0;
      } else {
        stuckFor.value += dt;
      }

      if (stuckFor.value >= STUCK_TIMEOUT) {
        abandonTarget();
      } else {
        const step = Math.min(SPEED * dt, distance);
        const nextX = x.value + (dx / distance) * step;
        const nextY = y.value + (dy / distance) * step;

        // If an item was dropped on top of the character it is already inside a
        // footprint - let it walk out instead of trapping it there forever.
        const trapped = !isFree(x.value, y.value);
        // A slide only counts if that axis actually has ground to cover. Without
        // this, a blocked head-on approach "succeeds" at moving zero pixels.
        const slidesX = Math.abs(nextX - x.value) > MIN_STEP;
        const slidesY = Math.abs(nextY - y.value) > MIN_STEP;

        if (trapped || isFree(nextX, nextY)) {
          x.value = nextX;
          y.value = nextY;
        } else if (slidesX && isFree(nextX, y.value)) {
          // Slide along the obstacle instead of stopping dead against it.
          x.value = nextX;
        } else if (slidesY && isFree(x.value, nextY)) {
          y.value = nextY;
        } else {
          // Nowhere left to go towards this target.
          abandonTarget();
        }
      }

      // The sheet has one row per animation and four blocks of frames inside it,
      // so the direction only decides which block we read from.
      direction.value =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? "right"
            : "left"
          : dy > 0
            ? "down"
            : "up";
    }

    elapsed.value += dt;
    const clip = CHARACTER_ANIMATIONS[animation.value];
    const frame = Math.floor(elapsed.value * clip.fps) % clip.frameCount;
    const nextColumn = clip.columns[direction.value] + frame;
    if (column.value !== nextColumn) {
      column.value = nextColumn;
    }
    if (row.value !== clip.row) {
      row.value = clip.row;
    }
  });

  const walkTo = useCallback(
    (roomX: number, roomY: number) => {
      targetX.value = clamp(roomX, walkable.minX, walkable.maxX);
      targetY.value = clamp(roomY, walkable.minY, walkable.maxY);
      bestDistance.value = Infinity;
      stuckFor.value = 0;
    },
    [targetX, targetY, bestDistance, stuckFor, walkable],
  );

  return { x, y, column, row, walkTo };
};
