import { Atlas, useImage } from "@shopify/react-native-skia";

import { PIXEL_ART, useAtlasData } from "./atlas";
import type { Tile } from "./roomLayout";
import { VILLAGE, VILLAGE_TILE } from "./village/villageLayout";

/**
 * Same Atlas-per-layer pattern as Room.tsx, but the village has 3 tilesets
 * instead of 2, and any given layer may draw against more than one of them,
 * so this renders one Atlas per (layer, tileset) pair that actually has
 * tiles - most pairs are empty (e.g. a layer that only touches one tileset).
 */
const VillageLayerAtlas = ({
  image,
  tiles,
}: {
  image: ReturnType<typeof useImage>;
  tiles: Tile[];
}) => {
  const atlasData = useAtlasData(tiles, VILLAGE_TILE);
  if (!image) {
    return null;
  }
  return (
    <Atlas
      image={image}
      sprites={atlasData.sprites}
      transforms={atlasData.transforms}
      sampling={PIXEL_ART}
    />
  );
};

export const Village = () => {
  // Order matches VILLAGE_TILESETS in villageMap.generated.ts (sorted by
  // firstGid): Terrains, Outside_Stuff, Houses.
  const terrains = useImage(
    require("../assets/tiles/Terrains_TILESET_B-C-D-E.png"),
  );
  const outsideStuff = useImage(
    require("../assets/tiles/Outside_Stuff_TILESET_B-C-D-E.png"),
  );
  const houses = useImage(
    require("../assets/tiles/Houses_TILESET_B-C-D-E.png"),
  );
  const images = [terrains, outsideStuff, houses];

  return (
    <>
      {VILLAGE.layers.map((layer) =>
        layer.tilesByTileset.map(
          (tiles, tilesetIndex) =>
            tiles.length > 0 && (
              <VillageLayerAtlas
                key={`${layer.name}-${tilesetIndex}`}
                image={images[tilesetIndex]}
                tiles={tiles}
              />
            ),
        ),
      )}
    </>
  );
};
