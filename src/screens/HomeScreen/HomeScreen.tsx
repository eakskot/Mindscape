import { Canvas, Group, useClock, type SkImage } from "@shopify/react-native-skia";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useSharedValue } from "react-native-reanimated";

import { Character } from "../../game/Character";
import { type DepthEntity, DepthSortedLayer } from "../../game/DepthSortedLayer";
import { DevInventory } from "../../game/items/DevInventory";
import { DragHighlight } from "../../game/items/DragHighlight";
import type { EditMode } from "../../game/items/editMode";
import { ItemLayer, ItemVisual } from "../../game/items/ItemLayer";
import { ITEM_CATALOG } from "../../game/items/itemCatalog";
import { useItemImages } from "../../game/items/itemImages";
import { baselineOf, useWorldItems } from "../../game/items/useWorldItems";
import { usePortalWatcher } from "../../game/portals";
import { useRoomImages } from "../../game/Room";
import { ROOM } from "../../game/roomLayout";
import { SceneLayers, StaticTileAtlas } from "../../game/SceneLayers";
import type { Portal, Scene, SceneId } from "../../game/scene";
import { useCamera } from "../../game/useCamera";
import { useCharacter } from "../../game/useCharacter";
import { useVillageImages } from "../../game/Village";
import { VILLAGE } from "../../game/village/villageLayout";
import { WanderingNpc } from "../../game/WanderingNpc";
import { useSceneGestures } from "./useSceneGestures";

/**
 * Which images to load for each scene's tiles. The scene *data* lives with
 * the scene itself (villageLayout.ts / roomLayout.ts) - this table only says
 * what to load for a given id, so nothing here hardcodes "village". A hook,
 * not a component, because SceneStage draws the layers in two passes (below
 * vs. above the character - see `Scene.topLayerName`), not as one opaque unit.
 */
const SCENES: Record<SceneId, { scene: Scene; useImages: () => (SkImage | null)[] }> = {
  village: { scene: VILLAGE, useImages: useVillageImages },
  room: { scene: ROOM, useImages: useRoomImages },
};

type SceneState = { sceneId: SceneId; spawn: { x: number; y: number } };

/**
 * Holds which scene is active. Switching scenes remounts `SceneStage` (keyed
 * by `sceneId`) rather than "teleporting" a live character across scenes -
 * `walkable`/`tileCollision`/`bounds` are plain values closed over at mount
 * by useCharacter/useWorldItems/useCamera, so a remount gets a scene's data
 * right by construction instead of risking a frame that mixes one scene's
 * bounds with another's collision grid.
 *
 * Trade-off, stated plainly: placed items don't carry across a scene switch
 * within a session, since each mount gets a fresh useWorldItems. Acceptable
 * today (nothing is persisted across restarts either) - but it's the seam
 * that has to move when persistence lands: the per-scene item state will
 * need to live *above* SceneStage (a store keyed by sceneId), so switching
 * scenes doesn't drop what you placed. See CLAUDE.md.
 */
export default function HomeScreen() {
  const [sceneState, setSceneState] = useState<SceneState>(() => ({
    sceneId: "village",
    spawn: VILLAGE.start,
  }));

  const handlePortal = useCallback((portal: Portal) => {
    setSceneState({ sceneId: portal.targetScene, spawn: portal.targetSpawn });
  }, []);

  return (
    <SceneStage
      key={sceneState.sceneId}
      sceneId={sceneState.sceneId}
      spawn={sceneState.spawn}
      onPortal={handlePortal}
    />
  );
}

function SceneStage({
  sceneId,
  spawn,
  onPortal,
}: {
  sceneId: SceneId;
  spawn: { x: number; y: number };
  onPortal: (portal: Portal) => void;
}) {
  const { width, height } = useWindowDimensions();
  const { scene, useImages } = SCENES[sceneId];
  const sceneImages = useImages();
  const images = useItemImages();

  const world = useWorldItems(scene.bounds, scene.tileSize, scene.placementMask);

  const [editMode, setEditMode] = useState<EditMode>("none");
  // Mirrors `editMode` into a shared value the movement/camera worklets can
  // read (a plain ref isn't safe to read on the UI thread). It's the "hold
  // still" signal for both the character (useCharacter's `frozen`) and the
  // camera (useCamera's `frozen`) during move/delete mode.
  const editModeActive = useSharedValue(editMode !== "none");
  useEffect(() => {
    editModeActive.value = editMode !== "none";
  }, [editMode, editModeActive]);

  const { x, y, column, row, walkTo, controlled } = useCharacter(
    world.obstacles,
    scene.walkable,
    spawn,
    scene.tileCollision,
    editModeActive,
  );

  // Walking into a door switches scenes - see portals.ts. A HomeScreen-level
  // concern layered on the character's position, not something the movement
  // engine needs to know about. Only fires for a player-directed walkTo, not
  // idle wandering (see useCharacter's `controlled`).
  usePortalWatcher(x, y, controlled, scene.portals, onPortal);

  const camera = useCamera({
    scene,
    width,
    height,
    charX: x,
    charY: y,
    frozen: editModeActive,
    spawn,
  });

  const gestures = useSceneGestures({ camera, world, walkTo, editMode });
  const draggedItem =
    world.items.find((item) => item.instanceId === gestures.draggedInstanceId) ??
    null;

  // One clock shared by every animated tile across both layer passes below -
  // see SceneLayers.tsx on why it must be the same clock, not one per pass.
  const clock = useClock();
  // The village's roof draws in a second pass, above the character and items,
  // instead of the single below-everything pass - see Scene.topLayerName.
  const belowLayers = scene.topLayerName
    ? scene.layers.filter((layer) => layer.name !== scene.topLayerName)
    : scene.layers;
  const aboveLayer = scene.topLayerName
    ? scene.layers.find((layer) => layer.name === scene.topLayerName)
    : undefined;

  // Placed `object` items and free-standing scenery (trees, rocks, bushes)
  // merged into one baseline-sorted list, so DepthSortedLayer's behind/front
  // toggle resolves their draw order against each other as well as against
  // the character - see that file's comment on why they must share a pass.
  //
  // Split into two memos on purpose: scenery bands never change after the
  // scene mounts, but `world.items` changes on every frame of a furniture
  // drag (moveItem writes React state) - a single memo would rebuild all ~80
  // scenery band nodes each of those frames for nothing.
  //
  // A scenery band draws as one batched StaticTileAtlas per tileset (no
  // per-frame worklets - a tree never animates), at world scale, inside the
  // world's camera Group since its tiles' dx/dy are room pixels. An item
  // draws through ItemVisual at entity scale, unwrapped.
  const sceneryEntities = useMemo<DepthEntity[]>(
    () =>
      (scene.sceneryBands ?? []).map((band, index) => ({
        key: `scenery-band-${index}`,
        baseline: band.baseline,
        node: (
          <Group transform={camera.transform}>
            {band.tilesByTileset.map((tiles, tilesetIndex) =>
              tiles.length > 0 ? (
                <StaticTileAtlas
                  key={tilesetIndex}
                  image={sceneImages[tilesetIndex]}
                  tiles={tiles}
                  tileSize={scene.tileSize}
                />
              ) : null,
            )}
          </Group>
        ),
      })),
    [scene.sceneryBands, scene.tileSize, sceneImages, camera.transform],
  );

  const itemEntities = useMemo<DepthEntity[]>(
    () =>
      world.items
        .filter((item) => ITEM_CATALOG[item.itemId].layer === "object")
        .map((item) => ({
          key: `item-${item.instanceId}`,
          baseline: baselineOf(item),
          node: (
            <ItemVisual
              item={item}
              image={images[item.itemId]}
              {...camera.entityProps}
            />
          ),
        })),
    [world.items, images, camera.entityProps],
  );

  const depthEntities = useMemo<DepthEntity[]>(
    () =>
      [...itemEntities, ...sceneryEntities].sort((a, b) => a.baseline - b.baseline),
    [itemEntities, sceneryEntities],
  );

  return (
    <View style={styles.container} {...gestures.panHandlers}>
      <Canvas style={StyleSheet.absoluteFill}>
        {/*
          Only the tile layers sit inside the world-scaled Group. The
          character and every item draw at their own `entityScale` (locked to
          worldScale - see entitySprite.ts) outside it, staying in the
          floorDecal / behind / character / front / overhead paint order the
          item y-sort relies on - that order comes from JSX position here, not
          from which Group each element nests in.
        */}
        <Group transform={camera.transform}>
          <SceneLayers
            layers={belowLayers}
            tileSize={scene.tileSize}
            clock={clock}
            images={sceneImages}
          />
        </Group>
        <ItemLayer
          items={world.items}
          images={images}
          characterY={y}
          layer="floorDecal"
          pass="always"
          {...camera.entityProps}
        />
        <DepthSortedLayer entities={depthEntities} pass="behind" characterY={y} />
        {/*
          The ambient NPC (scenes that have one - see Scene.wanderingNpc)
          shares the player's paint slot: it's occluded by the same scenery
          and items the player is, not Y-sorting independently. It keeps to a
          small patch near its spawn so its baseline stays close to the
          player's and that approximation holds; a full unified sort of every
          character is a later job (and a prerequisite for a shopkeeper NPC
          that stands somewhere specific). Drawn before the player so the
          player wins on overlap.
        */}
        {scene.wanderingNpc && (
          <WanderingNpc
            spawn={scene.wanderingNpc.spawn}
            obstacles={world.obstacles}
            walkable={scene.walkable}
            tileCollision={scene.tileCollision}
            frozen={editModeActive}
            tileSize={scene.tileSize}
            {...camera.entityProps}
          />
        )}
        <Character x={x} y={y} column={column} row={row} {...camera.entityProps} />
        <DepthSortedLayer entities={depthEntities} pass="front" characterY={y} />
        <ItemLayer
          items={world.items}
          images={images}
          characterY={y}
          layer="overhead"
          pass="always"
          {...camera.entityProps}
        />
        {/*
          The roof/tree-canopy layer, if the scene has one - drawn last so it
          paints over the character and every item, the "walk behind the
          roof" effect. See Scene.topLayerName.
        */}
        {aboveLayer && (
          <Group transform={camera.transform}>
            <SceneLayers
              layers={[aboveLayer]}
              tileSize={scene.tileSize}
              clock={clock}
              images={sceneImages}
            />
          </Group>
        )}
        <DragHighlight
          item={draggedItem}
          valid={gestures.dragValid}
          {...camera.entityProps}
        />
      </Canvas>

      <DevInventory
        // Drop new items at the centre of what's currently on screen.
        onPlace={(itemId) => {
          const { roomX, roomY } = camera.toRoomPoint(width / 2, height / 2);
          world.placeItem(itemId, { x: roomX, y: roomY });
        }}
        onClear={world.clearItems}
        editMode={editMode}
        onSetEditMode={setEditMode}
        placedCount={world.items.length}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#15151d",
  },
});
