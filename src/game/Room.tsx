import { Atlas, useImage } from "@shopify/react-native-skia";

import { PIXEL_ART, useAtlasData } from "./atlas";
import { ROOM, TILE } from "./roomLayout";

/**
 * This renderer only consumes tile lists - the art style is decided by
 * floorStyle / wallStyle in roomConfig.ts.
 */
export const Room = () => {
  const floors = useImage(
    require("../assets/tiles/Room_Builder_Floors_16x16.png"),
  );
  const walls = useImage(
    require("../assets/tiles/Room_Builder_Walls_16x16.png"),
  );

  const floorLayer = useAtlasData(ROOM.floorTiles, TILE);
  const wallLayer = useAtlasData(ROOM.wallTiles, TILE);

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
