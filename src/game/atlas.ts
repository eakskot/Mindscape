/**
 * Shared Skia Atlas plumbing for drawing a tile layer in one call. Room and
 * Village both consume this - it only needs a tile list and a tile size, not
 * anything about which scene or art style is in use.
 */

import {
  FilterMode,
  MipmapMode,
  Skia,
  useRectBuffer,
  type SamplingOptions,
  type SkImage,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import type { SharedValue } from "react-native-reanimated";

import type { Tile } from "./scene";

/** Pixel art must never be interpolated. */
export const PIXEL_ART: SamplingOptions = {
  filter: FilterMode.Nearest,
  mipmap: MipmapMode.None,
};

/**
 * RSXform for one tile: `Skia.RSXform(scos, ssin, tx, ty)` maps a point
 * local to the sprite's own source rect (origin at the rect's top-left) via
 * `x' = scos*x - ssin*y + tx; y' = ssin*x + scos*y + ty`. For a plain
 * unrotated tile that's just `(1, 0, dx, dy)` - the identity this always
 * used to return. For `rotate`, `tx`/`ty` are chosen so the tile's own
 * *centre* stays fixed at the destination box's centre - i.e. it spins in
 * place - rather than swinging into a neighbouring tile, which is what a
 * naive rotation about the source rect's top-left corner would do.
 */
const rsxformFor = (tile: Tile, tileSize: number) => {
  const half = tileSize / 2;
  let scos = 1;
  let ssin = 0;
  switch (tile.rotate) {
    case 90:
      scos = 0;
      ssin = 1;
      break;
    case 180:
      scos = -1;
      ssin = 0;
      break;
    case 270:
      scos = 0;
      ssin = -1;
      break;
  }
  const tx = tile.dx + half - half * (scos - ssin);
  const ty = tile.dy + half - half * (ssin + scos);
  return Skia.RSXform(scos, ssin, tx, ty);
};

/**
 * Skia can draw a whole tile layer in one call with Atlas: `sprites` are the
 * source rects in the tileset, `transforms` say where each one goes.
 *
 * `mirrorImageWidth`, when given, means every tile in `tiles` is a `flip:
 * true` tile being drawn against the *mirrored* copy of its tileset image
 * (see `useFlippedImage` below) rather than the original - the source rect's
 * x is reflected across that image's own width so it still lands on the
 * same tile's (now mirrored) pixels. Rotation composes on top exactly as
 * for a plain tile, since mirroring is "baked into" which pixels get
 * sampled, not into the transform.
 */
export const useAtlasData = (
  tiles: Tile[],
  tileSize: number,
  mirrorImageWidth?: number,
) =>
  useMemo(
    () => ({
      sprites: tiles.map((tile) =>
        Skia.XYWHRect(
          mirrorImageWidth === undefined
            ? tile.sx
            : mirrorImageWidth - tile.sx - tileSize,
          tile.sy,
          tileSize,
          tileSize,
        ),
      ),
      transforms: tiles.map((tile) => rsxformFor(tile, tileSize)),
    }),
    [tiles, tileSize, mirrorImageWidth],
  );

/**
 * Same job as useAtlasData, for tiles that carry `animationFrames` (Tiled's
 * per-tile animation - water waves today, see villageLayout.ts). `sprites`
 * has to be a per-frame-reactive buffer here instead of useAtlasData's
 * plain memoised array, since which pixels a tile samples now changes over
 * time; `transforms` stays a plain memoised array exactly as before, since
 * an animated tile's *position* never moves, only its sampled content does.
 * Kept as a separate hook (rather than a branch inside useAtlasData) so the
 * - far more common - fully static tiles never pay for a per-frame buffer
 * they don't need.
 */
export const useAnimatedAtlasData = (
  tiles: Tile[],
  tileSize: number,
  clock: SharedValue<number>,
  mirrorImageWidth?: number,
) => {
  const transforms = useMemo(
    () => tiles.map((tile) => rsxformFor(tile, tileSize)),
    [tiles, tileSize],
  );
  const sprites = useRectBuffer(tiles.length, (rect, i) => {
    "worklet";
    const tile = tiles[i];
    let sx = tile.sx;
    let sy = tile.sy;
    const frames = tile.animationFrames;
    if (frames && frames.length > 0 && tile.frameDurationMs) {
      const frameIndex = Math.floor(clock.value / tile.frameDurationMs) % frames.length;
      sx = frames[frameIndex].sx;
      sy = frames[frameIndex].sy;
    }
    if (mirrorImageWidth !== undefined) {
      sx = mirrorImageWidth - sx - tileSize;
    }
    rect.setXYWH(sx, sy, tileSize, tileSize);
  });
  return { sprites, transforms };
};

/**
 * A horizontally-mirrored copy of `image`, built once via an offscreen
 * surface (flip the whole canvas, snapshot it) rather than per-tile - a
 * tile's own mirrored pixels are still there afterwards, just at the
 * reflected x (see `useAtlasData`'s `mirrorImageWidth`), so every `flip`
 * tile against this tileset still draws through one batched `<Atlas>` call
 * instead of falling back to a slow per-tile draw.
 *
 * `enabled` is false whenever a scene's tileset has no `flip` tiles at all
 * (true for every scene today) - the hook still runs every render (rules of
 * hooks), but skips the surface/canvas work entirely, so a scene that never
 * uses mirroring pays nothing for this existing.
 */
export const useFlippedImage = (
  image: SkImage | null,
  enabled: boolean,
): SkImage | null =>
  useMemo(() => {
    if (!enabled || !image) {
      return null;
    }
    const width = image.width();
    const height = image.height();
    const surface = Skia.Surface.Make(width, height);
    if (!surface) {
      return null;
    }
    const canvas = surface.getCanvas();
    canvas.save();
    canvas.scale(-1, 1);
    canvas.translate(-width, 0);
    canvas.drawImage(image, 0, 0);
    canvas.restore();
    surface.flush();
    return surface.makeImageSnapshot();
  }, [image, enabled]);
