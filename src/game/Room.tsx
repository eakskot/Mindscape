import { useImage } from "@shopify/react-native-skia";

import { ROOM } from "./roomLayout";
import { SceneLayers } from "./SceneLayers";

/**
 * This renderer only consumes the Scene's tile data - the art style is
 * decided by floorStyle / wallStyle in roomConfig.ts.
 */
export const Room = () => {
  const floors = useImage(
    require("../assets/tiles/Room_Builder_Floors_16x16.png"),
  );
  const walls = useImage(
    require("../assets/tiles/Room_Builder_Walls_16x16.png"),
  );

  return <SceneLayers scene={ROOM} images={[floors, walls]} />;
};
