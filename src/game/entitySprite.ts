/**
 * Shared math for drawing something at a room-pixel position while tracking
 * the live camera. The character and placed items both draw this way -
 * *outside* the world's scaled `<Group>` (see HomeScreen.tsx) - carrying
 * their own `entityScale`. That scale is locked to the tile scale
 * (`entityScale = worldScale x ENTITY_SCALE_MULTIPLIER`), so proportions
 * never shift at any zoom; drawing outside the Group is only so the entity's
 * scale factor stays a clean multiple of the world's rather than a nested
 * (and possibly fractional-composed) one.
 *
 * This helper only carries position - the character (feet-centre anchor, via
 * RSXform) and items (top-left anchor; static items don't even need RSXform,
 * just a plain `<Image x y width height>`) each still do their own anchoring
 * math on top of the screen point this returns.
 */

import type { SharedValue } from "react-native-reanimated";

/**
 * The camera/scale quartet every on-canvas entity needs to place itself.
 * `worldScale`/`entityScale` are shared values (not numbers) because a pinch
 * drives them continuously between whole numbers - the entity has to scale
 * in step with the tiles every frame of that, not a React render behind.
 * `useCamera` produces this; the character, ItemLayer and DragHighlight
 * consume it. (Kept here rather than in useCamera.ts so the leaf draw
 * components don't have to import the whole camera hook for one type.)
 */
export type EntityProps = {
  camera: SharedValue<{ x: number; y: number }>;
  worldScale: SharedValue<number>;
  entityScale: SharedValue<number>;
  /** Device pixels per RN point - see toScreenPoint below. */
  density: number;
};

/**
 * Rounds to the nearest *device* pixel (1/density of an RN point) instead of
 * the nearest whole point - a point is several real pixels on most screens
 * (3 on this iPhone), so rounding to a whole point is a coarser grid than
 * the screen can actually show, which reads as choppy motion. Shared by
 * `toScreenPoint` below and useCamera.ts's `followPosition`, which both snap
 * to this same grid so the tile layer and every entity move together - see
 * either call site for why that matters.
 */
export const snapToDevicePixel = (value: number, density: number) => {
  "worklet";
  return Math.round(value * density) / density;
};

/**
 * Where a room-pixel point lands on screen, given the live camera.
 *
 * Snapped to the device-pixel grid (see `snapToDevicePixel`) - the camera
 * is already snapped so the tile layer never shows a seam, but an entity's
 * own room position keeps moving continuously. Without snapping here too,
 * camera+entity still sums to an off-grid value, and the entity would glide
 * smoothly while the world snaps underneath it - the two motions fighting
 * each other reads as jittery. Snapping both to the same grid keeps
 * everything moving together.
 */
export const toScreenPoint = (
  roomX: number,
  roomY: number,
  camera: { x: number; y: number },
  worldScale: number,
  density: number,
) => {
  "worklet";
  return {
    x: snapToDevicePixel(camera.x + roomX * worldScale, density),
    y: snapToDevicePixel(camera.y + roomY * worldScale, density),
  };
};
