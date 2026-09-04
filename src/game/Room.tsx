import { useImage } from "@shopify/react-native-skia";

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

  return [floors, walls];
};
