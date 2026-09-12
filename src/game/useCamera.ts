import { useCallback, useEffect, useMemo } from "react";
import { PixelRatio } from "react-native";
import {
  Easing,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { clamp } from "./bounds";
import { snapToDevicePixel, type EntityProps } from "./entitySprite";
import type { Scene } from "./scene";

/**
 * The camera: what the world's `<Group transform>` uses, plus the live
 * world/tile scale a pinch drives. Pulled out of HomeScreen so the screen
 * only *orchestrates* gestures - it hands raw drag deltas and pinch state to
 * the methods here and reads back `transform` / `entityProps`.
 *
 * Design rules that must not be quietly reverted (they each fixed a real
 * bug - see the git history around this file's introduction and the
 * pinch-zoom commits):
 *
 * - **Whole *device pixels* per source texel at rest**, not whole RN points.
 *   A fractional device-pixel scale makes pixel art shimmer - but a "point"
 *   is `density` device pixels (3 on a typical iPhone), so constraining
 *   `worldScale` itself (points per room pixel) to a whole number, as this
 *   used to, was `density`x stricter than the render actually needs: Skia
 *   rasterises to real device pixels regardless of what unit the app's own
 *   math uses (the same reason `snapToDevicePixel` exists). `worldScale` is
 *   only ever settled to `k / density` for a whole `k` - see
 *   `MIN/MAX_DEVICE_PIXEL_SCALE`. A pinch moves `worldScale` continuously
 *   (fractional in between, any value) and `settleZoom()` eases it onto the
 *   nearest such value on release.
 * - **Entity scale is locked to the tile scale** (`entityScale = worldScale
 *   x ENTITY_SCALE_MULTIPLIER`). The character and furniture never change
 *   proportion relative to the world, at any zoom.
 * - **Camera and every entity snap to the same device-pixel grid** or the
 *   tile layer and the sprites fight each other's sub-pixel motion and the
 *   canvas background shows through tile seams.
 * - **`following` is a one-way handoff.** A pan or a pinch turns it off and
 *   nothing turns it back on for the scene's lifetime - resuming a follow
 *   that has no easing reads as the screen randomly teleporting onto the
 *   character. A scene remount resets it.
 * - **A pinch stays centred on the fingers.** `zoomAbout` keeps the world
 *   point under the finger midpoint fixed, and `settleZoom` eases the scale
 *   *and* the camera together so it stays fixed through the settle too.
 */

/** Character/furniture screen size = `worldScale` x this. Locked, never its own knob. */
export const ENTITY_SCALE_MULTIPLIER = 2;

/**
 * The world scale a pinch may reach, expressed as *device pixels per source
 * texel* (not RN points - see this file's header) so it means the same
 * thing, and stays exactly as crisp, on every screen density. `MIN = 1` is
 * the hard floor: one more step out and a source pixel would have to be
 * *discarded* to fit into less than a device pixel (nearest-neighbour
 * decimation - moire/missing detail), a different and worse problem than
 * "uneven" magnification. There is no lower floor to reach for; if the
 * village ever needs to show more at once than this allows, the fix is a
 * bigger `preferredTilesVisibleTall` default or letting the camera frame a
 * region instead of the whole map, not scaling past this point.
 */
const MIN_DEVICE_PIXEL_SCALE = 1;
/** Same ceiling `MAX_WORLD_SCALE = 5` used to give on a 3x-density screen. */
const MAX_DEVICE_PIXEL_SCALE = 15;
/** How long the world eases onto a whole scale after a pinch ends. */
const ZOOM_SETTLE_MS = 130;

/**
 * The valid range for the camera's translateX/Y, in screen pixels, so the
 * scene never shows past its own edge. A scene bigger than the viewport can
 * slide between showing its start and its end; one smaller than the viewport
 * collapses min===max to the single centred position - clamping
 * `width - sceneWidthPx` (positive there) against `max=0` would invert the
 * range and pin everything to a corner instead, so it needs its own branch.
 */
export const cameraRange = (
  scale: number,
  width: number,
  height: number,
  sceneWidth: number,
  sceneHeight: number,
) => {
  "worklet";
  const sceneWidthPx = sceneWidth * scale;
  const sceneHeightPx = sceneHeight * scale;
  const x =
    sceneWidthPx <= width
      ? { min: (width - sceneWidthPx) / 2, max: (width - sceneWidthPx) / 2 }
      : { min: width - sceneWidthPx, max: 0 };
  const y =
    sceneHeightPx <= height
      ? { min: (height - sceneHeightPx) / 2, max: (height - sceneHeightPx) / 2 }
      : { min: height - sceneHeightPx, max: 0 };
  return { x, y };
};

/**
 * Where the camera sits when centred on `charX,charY` (room pixels), snapped
 * to the device-pixel grid. Every tile's own position is an exact multiple
 * of the (integer, at rest) world scale, so a snapped camera offset lands
 * every tile on a whole pixel too - the standard tilemap-seam fix.
 */
export const followPosition = (
  charX: number,
  charY: number,
  scale: number,
  width: number,
  height: number,
  sceneWidth: number,
  sceneHeight: number,
  density: number,
) => {
  "worklet";
  const range = cameraRange(scale, width, height, sceneWidth, sceneHeight);
  return {
    x: snapToDevicePixel(
      clamp(width / 2 - charX * scale, range.x.min, range.x.max),
      density,
    ),
    y: snapToDevicePixel(
      clamp(height / 2 - charY * scale, range.y.min, range.y.max),
      density,
    ),
  };
};

type UseCameraArgs = {
  scene: Scene;
  width: number;
  height: number;
  /** The player's feet, so the camera can follow. */
  charX: SharedValue<number>;
  charY: SharedValue<number>;
  /** The camera holds completely still while this is true (furniture mode). */
  frozen: SharedValue<boolean>;
  /** Where the camera is centred at mount, before any follow/pan. */
  spawn: { x: number; y: number };
};

export const useCamera = ({
  scene,
  width,
  height,
  charX,
  charY,
  frozen,
  spawn,
}: UseCameraArgs) => {
  const density = PixelRatio.get();
  // The device-pixel-integer bounds converted into this screen's own point
  // space - see MIN/MAX_DEVICE_PIXEL_SCALE's own comment. On a typical
  // iPhone (density 3) minWorldScale lands at 1/3: a village that used to
  // stop zooming out at "1 point per room pixel" (3 device px per texel,
  // 3x more magnified than pixel art actually needs) can now go a further
  // `density`x out, still perfectly crisp.
  const minWorldScale = MIN_DEVICE_PIXEL_SCALE / density;
  const maxWorldScale = MAX_DEVICE_PIXEL_SCALE / density;

  // The nearest scale that keeps a whole number of device pixels per texel
  // is the exact same formula as snapping a *position* to the device-pixel
  // grid (`snapToDevicePixel`) - both are just "round to the nearest 1/density".
  const roundToDevicePixelScale = useCallback(
    (scale: number) => snapToDevicePixel(scale, density),
    [density],
  );

  // The scene's preferred framing, as a whole-*point* scale a pinch starts
  // from and returns towards - deliberately still floored to a whole point,
  // not the finer device-pixel grid the pinch range now allows, so a
  // scene's default zoom is unchanged from before this file could go past
  // 1: only the *reachable range* got bigger, not what you see un-pinched.
  const baseScale = clamp(
    Math.max(
      1,
      Math.floor(height / (scene.tileSize * scene.preferredTilesVisibleTall)),
    ),
    minWorldScale,
    maxWorldScale,
  );

  const worldScale = useSharedValue(baseScale);
  const entityScale = useDerivedValue(
    () => worldScale.value * ENTITY_SCALE_MULTIPLIER,
  );

  // Two shared values, not one {x,y}, so `settleZoom` can ease each axis on
  // its own. Seeded already centred so there's no first-frame flash.
  const seed = followPosition(
    spawn.x,
    spawn.y,
    baseScale,
    width,
    height,
    scene.width,
    scene.height,
    density,
  );
  const cameraX = useSharedValue(seed.x);
  const cameraY = useSharedValue(seed.y);
  const camera = useDerivedValue(() => ({ x: cameraX.value, y: cameraY.value }));

  // True until the first pan or pinch, then off for the scene's lifetime.
  const following = useSharedValue(true);

  // A shared value so the per-frame worklet and the (built-once) gesture
  // callbacks read fresh viewport dimensions after a rotation. (The app is
  // portrait-locked today, so this only ever holds the mount value - but
  // reading `width`/`height` closures on the UI thread would be the bug if
  // that ever changes.)
  const dims = useSharedValue({ w: width, h: height });
  useEffect(() => {
    dims.value = { w: width, h: height };
  }, [width, height, dims]);

  useFrameCallback(() => {
    "worklet";
    if (!following.value || frozen.value) {
      return;
    }
    const at = followPosition(
      charX.value,
      charY.value,
      worldScale.value,
      dims.value.w,
      dims.value.h,
      scene.width,
      scene.height,
      density,
    );
    cameraX.value = at.x;
    cameraY.value = at.y;
  });

  const transform = useDerivedValue(() => [
    { translateX: cameraX.value },
    { translateY: cameraY.value },
    { scale: worldScale.value },
  ]);

  const entityProps = useMemo<EntityProps>(
    () => ({ camera, worldScale, entityScale, density }),
    [camera, worldScale, entityScale, density],
  );

  /** Screen (view) point -> room pixels, at the camera's current position. */
  const toRoomPoint = useCallback(
    (viewX: number, viewY: number) => ({
      roomX: (viewX - cameraX.value) / worldScale.value,
      roomY: (viewY - cameraY.value) / worldScale.value,
    }),
    [cameraX, cameraY, worldScale],
  );

  /** Current camera position - a gesture captures this at the start of a pan. */
  const snapshot = useCallback(
    () => ({ x: cameraX.value, y: cameraY.value }),
    [cameraX, cameraY],
  );

  /**
   * Drag the camera to `(startX + dx, startY + dy)`, clamped to the scene,
   * and hand control off the follow loop (one-way).
   */
  const panBy = useCallback(
    (startX: number, startY: number, dx: number, dy: number) => {
      following.value = false;
      const range = cameraRange(
        worldScale.value,
        dims.value.w,
        dims.value.h,
        scene.width,
        scene.height,
      );
      cameraX.value = snapToDevicePixel(
        clamp(startX + dx, range.x.min, range.x.max),
        density,
      );
      cameraY.value = snapToDevicePixel(
        clamp(startY + dy, range.y.min, range.y.max),
        density,
      );
    },
    [following, worldScale, dims, scene.width, scene.height, cameraX, cameraY, density],
  );

  // The world point pinned under the finger midpoint, so `settleZoom` can
  // keep it exactly there while the scale eases onto a whole number.
  const anchor = useSharedValue<{
    worldX: number;
    worldY: number;
    focalX: number;
    focalY: number;
  } | null>(null);

  const cameraForFocus = useCallback(
    (a: NonNullable<typeof anchor.value>, s: number) => {
      const range = cameraRange(
        s,
        dims.value.w,
        dims.value.h,
        scene.width,
        scene.height,
      );
      return {
        x: snapToDevicePixel(
          clamp(a.focalX - a.worldX * s, range.x.min, range.x.max),
          density,
        ),
        y: snapToDevicePixel(
          clamp(a.focalY - a.worldY * s, range.y.min, range.y.max),
          density,
        ),
      };
    },
    [anchor, dims, scene.width, scene.height, density],
  );

  /**
   * Set the live world scale to `next` (already clamped) keeping the world
   * point under `(focalX, focalY)` fixed. `next` may be fractional mid-pinch;
   * `settleZoom` rounds it. Hands control off the follow loop the first time
   * it actually moves.
   */
  const zoomAbout = useCallback(
    (next: number, focalX: number, focalY: number) => {
      const prev = worldScale.value;
      if (next === prev) {
        return;
      }
      following.value = false;
      const worldX = (focalX - cameraX.value) / prev;
      const worldY = (focalY - cameraY.value) / prev;
      // Built once, used twice: `anchor.value = nextAnchor` alone (without
      // this local) crashed on the very first pinch of a session - reading
      // `anchor.value` straight back in the same call didn't reliably see an
      // object-valued shared value's own write yet, only null (the initial
      // value). Keeping the object in hand sidesteps that round-trip
      // entirely; `settleZoom` below still reads `anchor.value` later, which
      // is fine - by then the write is long since visible.
      const nextAnchor = { worldX, worldY, focalX, focalY };
      anchor.value = nextAnchor;
      worldScale.value = next;
      const cam = cameraForFocus(nextAnchor, next);
      cameraX.value = cam.x;
      cameraY.value = cam.y;
    },
    [worldScale, following, cameraX, cameraY, anchor, cameraForFocus],
  );

  /**
   * End a pinch: ease the scale onto the nearest crisp value (see
   * `roundToDevicePixelScale`) *and* the camera to match, over the same
   * window, so the point under the fingers stays put through the settle
   * instead of drifting.
   */
  const settleZoom = useCallback(() => {
    const settled = clamp(
      roundToDevicePixelScale(worldScale.value),
      minWorldScale,
      maxWorldScale,
    );
    const opts = { duration: ZOOM_SETTLE_MS, easing: Easing.out(Easing.quad) };
    worldScale.value = withTiming(settled, opts);
    if (anchor.value) {
      const cam = cameraForFocus(anchor.value, settled);
      cameraX.value = withTiming(cam.x, opts);
      cameraY.value = withTiming(cam.y, opts);
    }
  }, [
    worldScale,
    anchor,
    cameraForFocus,
    cameraX,
    cameraY,
    roundToDevicePixelScale,
    minWorldScale,
    maxWorldScale,
  ]);

  return {
    /** For the world's `<Group transform>` and any Group drawn in world space. */
    transform,
    /** Spread onto the character and every ItemLayer/DragHighlight. */
    entityProps,
    /** Live tile scale - the gesture reads `.value` for the pinch ratio. */
    worldScale,
    /** The pinch range, in the same units as `worldScale` - see this file's header. */
    minWorldScale,
    maxWorldScale,
    toRoomPoint,
    snapshot,
    panBy,
    zoomAbout,
    settleZoom,
  };
};
