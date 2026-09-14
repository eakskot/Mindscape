import { Canvas, Group, useClock, type SkImage } from "@shopify/react-native-skia";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useSharedValue } from "react-native-reanimated";

import { Character } from "../../game/Character";
import { type DepthEntity, DepthSortedLayer } from "../../game/DepthSortedLayer";
import { CurrencyHud } from "../../game/economy/CurrencyHud";
import { useWallet } from "../../game/economy/useWallet";
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
import { removeVillageSceneryGroup, VILLAGE } from "../../game/village/villageLayout";
import { SceneryGroupVisual } from "../../game/village/SceneryGroupVisual";
import { SceneryRemovalPrompt } from "../../game/village/SceneryRemovalPrompt";
import { WanderingNpc } from "../../game/WanderingNpc";
import { useSceneGestures } from "./useSceneGestures";

/**
 * What removing one scenery group (a tree, a rock cluster - see
 * villageLayout.ts's SceneryGroup) costs. A flat rate for every group today,
 * not per-item pricing - simplest thing that works while there's exactly one
 * thing to spend currency on; revisit if some groups should cost more than
 * others once there's a reason to (a rare stone vs. a common bush).
 */
const SCENERY_REMOVAL_COST = 10;

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

  // Owned here, not inside SceneStage, so it survives a scene switch (the
  // same reason `sceneState` lives here) - see useWallet.ts.
  const wallet = useWallet();

  // Which scenery groups have been removed - same reasoning as the wallet:
  // owned above SceneStage so walking into the house and back out doesn't
  // bring a chopped-down tree back. Resets on app restart, same as the
  // wallet - no persistence layer yet (see CLAUDE.md).
  const [removedSceneryIds, setRemovedSceneryIds] = useState<Set<string>>(
    () => new Set(),
  );

  // The one thing currency currently buys. `removeVillageSceneryGroup`
  // clears the *village's* collision/placement grids specifically (it's
  // imported straight from villageLayout.ts, not looked up through `SCENES`
  // like everything else scene-agnostic here) - fine while it's the only
  // scene with removable scenery; revisit if a second scene ever needs one.
  const tryRemoveScenery = useCallback(
    (id: string) => {
      if (!wallet.spend(SCENERY_REMOVAL_COST)) {
        return false;
      }
      removeVillageSceneryGroup(id);
      setRemovedSceneryIds((current) => {
        const next = new Set(current);
        next.add(id);
        return next;
      });
      return true;
    },
    [wallet],
  );

  return (
    <View style={styles.root}>
      <SceneStage
        key={sceneState.sceneId}
        sceneId={sceneState.sceneId}
        spawn={sceneState.spawn}
        onPortal={handlePortal}
        walletBalance={wallet.balance}
        removedSceneryIds={removedSceneryIds}
        onRemoveScenery={tryRemoveScenery}
      />
      <CurrencyHud balance={wallet.balance} />
    </View>
  );
}

function SceneStage({
  sceneId,
  spawn,
  onPortal,
  walletBalance,
  removedSceneryIds,
  onRemoveScenery,
}: {
  sceneId: SceneId;
  spawn: { x: number; y: number };
  onPortal: (portal: Portal) => void;
  walletBalance: number;
  removedSceneryIds: Set<string>;
  /** Spends the currency and removes the group; false if the spend failed. */
  onRemoveScenery: (id: string) => boolean;
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

  // Which removable scenery (see villageLayout.ts's SceneryGroup) is still
  // standing, and which one (if any) is currently tapped-and-selected for
  // removal. `visibleSceneryGroups` re-filters whenever a removal lands -
  // cheap, there are dozens of groups, not thousands.
  const visibleSceneryGroups = useMemo(
    () => (scene.sceneryGroups ?? []).filter((group) => !removedSceneryIds.has(group.id)),
    [scene.sceneryGroups, removedSceneryIds],
  );
  const [selectedSceneryId, setSelectedSceneryId] = useState<string | null>(null);
  const selectedSceneryGroup =
    visibleSceneryGroups.find((group) => group.id === selectedSceneryId) ?? null;
  // A selection can go stale two ways: the group it pointed at just got
  // removed (by this very tap, via onRemoveScenery), or edit mode opened
  // underneath it - either way the confirm button shouldn't linger.
  useEffect(() => {
    if (selectedSceneryId && !selectedSceneryGroup) {
      setSelectedSceneryId(null);
    }
  }, [selectedSceneryId, selectedSceneryGroup]);
  useEffect(() => {
    if (editMode !== "none") {
      setSelectedSceneryId(null);
    }
  }, [editMode]);

  const gestures = useSceneGestures({
    camera,
    world,
    walkTo,
    editMode,
    sceneryGroups: visibleSceneryGroups,
    selectedSceneryId,
    onSelectScenery: setSelectedSceneryId,
  });
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
  // Split into memos on purpose, by what actually changes each: bands never
  // change after the scene mounts, groups change on a removal (rare - a
  // deliberate tap) or a selection change (also rare), and `world.items`
  // changes on every frame of a furniture drag (moveItem writes React
  // state). One memo for all of it would rebuild every scenery node on each
  // of those for nothing.
  //
  // Both a band and a group draw as one batched StaticTileAtlas per tileset
  // (no per-frame worklets - scenery never animates), at world scale, inside
  // the world's camera Group since tile dx/dy are room pixels. An item draws
  // through ItemVisual at entity scale, unwrapped.
  const bandEntities = useMemo<DepthEntity[]>(
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

  // Removable groups get their own DepthEntity each (not batched into the
  // bands above) - there are only dozens of them, and each needs its own
  // node anyway to carry its own selection highlight. See SceneryGroupVisual.
  const groupEntities = useMemo<DepthEntity[]>(
    () =>
      visibleSceneryGroups.map((group) => ({
        key: `scenery-group-${group.id}`,
        baseline: group.baseline,
        node: (
          <Group transform={camera.transform}>
            <SceneryGroupVisual
              group={group}
              images={sceneImages}
              tileSize={scene.tileSize}
              selected={group.id === selectedSceneryId}
            />
          </Group>
        ),
      })),
    [visibleSceneryGroups, sceneImages, scene.tileSize, camera.transform, selectedSceneryId],
  );

  const sceneryEntities = useMemo<DepthEntity[]>(
    () => [...bandEntities, ...groupEntities],
    [bandEntities, groupEntities],
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

      {selectedSceneryGroup && (
        <SceneryRemovalPrompt
          group={selectedSceneryGroup}
          cost={SCENERY_REMOVAL_COST}
          canAfford={walletBalance >= SCENERY_REMOVAL_COST}
          onConfirm={() => {
            // onRemoveScenery already no-ops on a failed spend - the button
            // is disabled in that case anyway (see canAfford), this is just
            // not trusting the disabled state alone to prevent the call.
            if (onRemoveScenery(selectedSceneryGroup.id)) {
              setSelectedSceneryId(null);
            }
          }}
          {...camera.entityProps}
        />
      )}

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
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#15151d",
  },
});
