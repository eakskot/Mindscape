/**
 * Shared math for drawing something at a room-pixel position while tracking
 * the live camera, at its own "entity scale" independent of the world's tile
 * scale (`worldScale`). The character and placed items both draw this way -
 * see HomeScreen.tsx's `ENTITY_SCALE_MULTIPLIER`. Without it, zooming the
 * camera out to show more of a scene would shrink everything drawn in that
 * scene too, including things that should stay a comfortable, consistent
 * on-screen size regardless of how much world is visible.
 *
 * This only carries position - the character (feet-centre anchor, via
 * RSXform) and items (top-left anchor; static items don't even need RSXform,
 * just a plain `<Image x y width height>`) each still do their own anchoring
 * math on top of the screen point this returns.
 */

/**
 * Where a room-pixel point lands on screen, given the live camera.
 *
 * Rounded to the nearest *device* pixel (1/density of an RN point), same
 * grid as the camera offset itself (HomeScreen.tsx's cameraOffset) - the
 * camera is already snapped so the tile layer never shows a seam, but an
 * entity's own room position keeps moving continuously. Without rounding
 * here too, camera+entity still sums to an off-grid value, and the entity
 * would glide smoothly while the world snaps underneath it - the two
 * motions fighting each other reads as jittery. Snapping both to the same
 * grid keeps everything moving together; using the device-pixel grid
 * (rather than a whole RN point) keeps that motion as smooth as the screen
 * can actually show, not artificially coarser.
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
    x: Math.round((camera.x + roomX * worldScale) * density) / density,
    y: Math.round((camera.y + roomY * worldScale) * density) / density,
  };
};
