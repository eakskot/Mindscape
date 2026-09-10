import { useImage } from "@shopify/react-native-skia";

/**
 * Loads the village's tileset images, in the same order as `VILLAGE_TILESETS`
 * in villageMap.generated.ts (sorted by firstGid) - `sceneImages[i]` must be
 * tileset `i`'s image. A hook, not a self-drawing component, because
 * HomeScreen draws the scene's layers in two passes (below vs. above the
 * character - see `Scene.topLayerName`) sharing these decoded images.
 *
 * **Keep this list in sync with `VILLAGE_TILESETS`.** The importer
 * (`scripts/import-village-map.mjs`) copies every tileset's PNG into
 * `assets/tiles/` on its own, but this `require` list is hand-written -
 * Metro needs a literal path per image. A tileset that's declared but has no
 * `useImage` here just renders nothing for its tiles (StaticTileAtlas /
 * SceneLayerAtlas both `return null` on a missing image), silently. If the
 * list grows often, have the importer generate it too.
 */
export const useVillageImages = () => {
  const terrains = useImage(
    require("../assets/tiles/Terrains_TILESET_B-C-D-E.png"),
  );
  const outsideStuff = useImage(
    require("../assets/tiles/Outside_Stuff_TILESET_B-C-D-E.png"),
  );
  const houses = useImage(require("../assets/tiles/Houses_TILESET_B-C-D-E.png"));
  // firstGid 6913 - a small dirt/worn-path variant set. Declared by the
  // importer; nothing in the current map paints from it yet, but it's wired
  // so it works the moment something does.
  const groundVariants = useImage(
    require("../assets/tiles/ModernExteriors_Ground_Variants_16x16.png"),
  );

  return [terrains, outsideStuff, houses, groundVariants];
};
