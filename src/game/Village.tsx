import { useImage } from "@shopify/react-native-skia";

/**
 * Loads the village's tileset images. A hook, not a component that draws
 * itself, because HomeScreen.tsx needs to draw the scene's layers in two
 * separate passes (below vs. above the character - see `Scene.topLayerName`)
 * sharing these same decoded images rather than loading them twice.
 */
export const useVillageImages = () => {
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

  return [terrains, outsideStuff, houses];
};
