import {
  Atlas,
  FilterMode,
  MipmapMode,
  Skia,
  useImage,
  type SamplingOptions,
} from "@shopify/react-native-skia";
import { useMemo } from "react";

import { ROOM, TILE, type Tile } from "./roomLayout";

/** Pixel art must never be interpolated. */
export const PIXEL_ART: SamplingOptions = {
  filter: FilterMode.Nearest,
  mipmap: MipmapMode.None,
};

/**
 * Skia can draw a whole tile layer in one call with Atlas: `sprites` are the
 * source rects in the tileset, `transforms` say where each one goes.
 *
 * This renderer only consumes tile lists - the art style is decided by
 * floorStyle / wallStyle in roomConfig.ts.
 */
const useAtlasData = (tiles: Tile[]) =>
  useMemo(
    () => ({
      sprites: tiles.map((tile) => Skia.XYWHRect(tile.sx, tile.sy, TILE, TILE)),
      transforms: tiles.map((tile) => Skia.RSXform(1, 0, tile.dx, tile.dy)),
    }),
    [tiles],
  );

export const Room = () => {
  const floors = useImage(
    require("../assets/tiles/Room_Builder_Floors_16x16.png"),
  );
  const walls = useImage(
    require("../assets/tiles/Room_Builder_Walls_16x16.png"),
  );

  const floorLayer = useAtlasData(ROOM.floorTiles);
  const wallLayer = useAtlasData(ROOM.wallTiles);

  return (
    <>
      <Atlas
        image={floors}
        sprites={floorLayer.sprites}
        transforms={floorLayer.transforms}
        sampling={PIXEL_ART}
      />
      <Atlas
        image={walls}
        sprites={wallLayer.sprites}
        transforms={wallLayer.transforms}
        sampling={PIXEL_ART}
      />
    </>
  );
};
