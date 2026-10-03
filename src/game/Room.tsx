import { useImage } from "@shopify/react-native-skia";
import { useMemo } from "react";

/**
 * Loads the room's tileset images. A hook, not a component that draws
 * itself - see useVillageImages's own comment for why (HomeScreen.tsx needs
 * the images to drive its own SceneLayers calls, not a component that
 * decides its own layer split).
 */
export const useRoomImages = () => {
  const floors = useImage(
    require("../assets/tiles/Room_Builder_Floors_16x16.png"),
  );
  const walls = useImage(
    require("../assets/tiles/Room_Builder_Walls_16x16.png"),
  );

  // See useVillageImages's matching comment - stable array identity for
  // SceneLayers.tsx's `memo`.
  return useMemo(() => [floors, walls], [floors, walls]);
};
