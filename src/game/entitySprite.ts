/**
 * Shared math for drawing something at a room-pixel position while tracking
 * the live camera, at its own "entity scale" independent of the world's tile
 * scale (`worldScale`). The character and placed items both draw this way -
 * see HomeScreen.tsx's `ZOOM_LEVELS`, which sets the two scales per zoom
 * level. Decoupling them means zooming the camera out to show more of a
 * scene doesn't shrink everything drawn in it in lockstep, so things that
 * should stay a comfortable on-screen size can.
 *
 * This only carries position - the character (feet-centre anchor, via
 * RSXform) and items (top-left anchor; static items don't even need RSXform,
 * just a plain `<Image x y width height>`) each still do their own anchoring
 * math on top of the screen point this returns.
 */

/**
 * Rounds to the nearest *device* pixel (1/density of an RN point) instead of
 * the nearest whole point - a point is several real pixels on most screens
 * (3 on this iPhone), so rounding to a whole point is a coarser grid than
 * the screen can actually show, which reads as choppy motion. Shared by
 * `toScreenPoint` below and HomeScreen.tsx's `cameraOffset`, which both
 * snap to this same grid so the tile layer and every entity move together -
 * see either call site for why that matters.
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
