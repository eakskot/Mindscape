import { useImage } from "@shopify/react-native-skia";

import { SceneLayers } from "./SceneLayers";
import { VILLAGE } from "./village/villageLayout";

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

  return (
    <SceneLayers scene={VILLAGE} images={[terrains, outsideStuff, houses]} />
  );
};
