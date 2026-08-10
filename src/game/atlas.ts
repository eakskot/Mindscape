/**
 * Shared Skia Atlas plumbing for drawing a tile layer in one call. Room and
 * Village both consume this - it only needs a tile list and a tile size, not
 * anything about which scene or art style is in use.
 */

import { FilterMode, MipmapMode, Skia, type SamplingOptions } from "@shopify/react-native-skia";
import { useMemo } from "react";

import type { Tile } from "./roomLayout";

/** Pixel art must never be interpolated. */
export const PIXEL_ART: SamplingOptions = {
  filter: FilterMode.Nearest,
  mipmap: MipmapMode.None,
};

/**
 * Skia can draw a whole tile layer in one call with Atlas: `sprites` are the
 * source rects in the tileset, `transforms` say where each one goes.
 */
export const useAtlasData = (tiles: Tile[], tileSize: number) =>
  useMemo(
    () => ({
      sprites: tiles.map((tile) => Skia.XYWHRect(tile.sx, tile.sy, tileSize, tileSize)),
      transforms: tiles.map((tile) => Skia.RSXform(1, 0, tile.dx, tile.dy)),
    }),
    [tiles, tileSize],
  );
