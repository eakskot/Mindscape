import { Atlas, useClock, useImage } from "@shopify/react-native-skia";
import { useMemo } from "react";
import type { SharedValue } from "react-native-reanimated";

import { PIXEL_ART, useAnimatedAtlasData, useAtlasData, useFlippedImage } from "./atlas";
import type { Scene, Tile } from "./scene";

/**
 * Draws every layer of a Scene. One Atlas per (layer, tileset, animated,
 * mirrored) group that actually has tiles - most groups are empty (e.g. a
 * layer that only touches one of the scene's tilesets, or has no animated
 * or mirrored tiles at all). Shared by Room.tsx and Village.tsx, which only
 * differ in which tileset images they load.
 *
 * Two kinds of tile can't go through the plain "static, unmirrored" Atlas
 * call:
 *
 * - A `flip` tile (mirrored in Tiled) can't be expressed as an Atlas RSXform
 *   - that only covers rotation + uniform scale, not a reflection - so
 *   those tiles are drawn against a pre-mirrored copy of the tileset image
 *   instead (see useFlippedImage) rather than falling back to a slow
 *   per-tile draw.
 * - An `animationFrames` tile (Tiled's per-tile animation, e.g. water
 *   waves) needs its source rect recomputed every frame instead of once -
 *   see useAnimatedAtlasData.
 *
 * These compose (an animated tile can also be mirrored), so tiles split
 * into up to four groups, each still just one batched `<Atlas>` draw call.
 */
const SceneLayerAtlas = ({
  image,
  tiles,
  tileSize,
  clock,
}: {
  image: ReturnType<typeof useImage>;
  tiles: Tile[];
  tileSize: number;
  clock: SharedValue<number>;
}) => {
  const { plain, mirrored, animatedPlain, animatedMirrored } = useMemo(() => {
    const plain: Tile[] = [];
    const mirrored: Tile[] = [];
    const animatedPlain: Tile[] = [];
    const animatedMirrored: Tile[] = [];
    for (const tile of tiles) {
      const bucket = tile.animationFrames
        ? tile.flip
          ? animatedMirrored
          : animatedPlain
        : tile.flip
          ? mirrored
          : plain;
      bucket.push(tile);
    }
    return { plain, mirrored, animatedPlain, animatedMirrored };
  }, [tiles]);

  const plainAtlas = useAtlasData(plain, tileSize);
  const flippedImage = useFlippedImage(
    image ?? null,
    mirrored.length > 0 || animatedMirrored.length > 0,
  );
  const mirroredAtlas = useAtlasData(mirrored, tileSize, image?.width());
  const animatedPlainAtlas = useAnimatedAtlasData(animatedPlain, tileSize, clock);
  const animatedMirroredAtlas = useAnimatedAtlasData(
    animatedMirrored,
    tileSize,
    clock,
    image?.width(),
  );

  if (!image) {
    return null;
  }
  return (
    <>
      {plain.length > 0 && (
        <Atlas
          image={image}
          sprites={plainAtlas.sprites}
          transforms={plainAtlas.transforms}
          sampling={PIXEL_ART}
        />
      )}
      {animatedPlain.length > 0 && (
        <Atlas
          image={image}
          sprites={animatedPlainAtlas.sprites}
          transforms={animatedPlainAtlas.transforms}
          sampling={PIXEL_ART}
        />
      )}
      {mirrored.length > 0 && flippedImage && (
        <Atlas
          image={flippedImage}
          sprites={mirroredAtlas.sprites}
          transforms={mirroredAtlas.transforms}
          sampling={PIXEL_ART}
        />
      )}
      {animatedMirrored.length > 0 && flippedImage && (
        <Atlas
          image={flippedImage}
          sprites={animatedMirroredAtlas.sprites}
          transforms={animatedMirroredAtlas.transforms}
          sampling={PIXEL_ART}
        />
      )}
    </>
  );
};

export const SceneLayers = ({
  scene,
  images,
}: {
  scene: Scene;
  /** Parallel to each layer's tilesByTileset - images[i] is tileset i. */
  images: ReturnType<typeof useImage>[];
}) => {
  // One clock shared by every animated tile in the scene, so e.g. two
  // adjacent water tiles from different layers never drift out of sync
  // with each other - each would otherwise be "in sync since mount" only
  // by coincidence of mounting at the same moment.
  const clock = useClock();
  return (
    <>
      {scene.layers.map((layer) =>
        layer.tilesByTileset.map(
          (tiles, tilesetIndex) =>
            tiles.length > 0 && (
              <SceneLayerAtlas
                key={`${layer.name}-${tilesetIndex}`}
                image={images[tilesetIndex]}
                tiles={tiles}
                tileSize={scene.tileSize}
                clock={clock}
              />
            ),
        ),
      )}
    </>
  );
};
