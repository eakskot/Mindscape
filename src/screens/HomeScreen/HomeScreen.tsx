import {
  Canvas,
  Group,
  useClock,
  type DataSourceParam,
  type SkImage,
} from "@shopify/react-native-skia";
import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSharedValue } from "react-native-reanimated";

import { Character, NPC_SHEET, NPC_SHEET_2, NPC_SHEET_3 } from "../../game/Character";
import { type DepthEntity, DepthSortedLayer } from "../../game/DepthSortedLayer";
import { CurrencyHud } from "../../game/economy/CurrencyHud";
import { useWalletContext } from "../../game/economy/WalletContext";
import { TicketChip } from "../../game/engine/TicketChip";
import { getJSON, setJSON, StorageKeys } from "../../game/engine/storage";
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
import { useWanderingNpcCharacters } from "../../game/useWanderingNpcCharacters";
import { SettingsButton } from "../../ui/SettingsButton";
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
 * Resolves a scene's scene-agnostic `wanderingNpcs[].skin` id (see scene.ts)
 * to the actual Skia sheet - keeps scene.ts free of any Skia import, the
 * same reason `SCENES` below exists for tile images.
 */
const WANDERING_NPC_SHEETS: Record<"npc" | "npc2" | "npc3", DataSourceParam> = {
  npc: NPC_SHEET,
  npc2: NPC_SHEET_2,
  npc3: NPC_SHEET_3,
};

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

  // Lifted all the way above the tab navigator now (see WalletContext.tsx) -
  // owning it here would no longer survive switching to Shop or Screen time
  // and back. Same API as the old `useWallet()` call this replaced.
  const wallet = useWalletContext();
  // See the SettingsButton render below for why this exists.
  const isFocused = useIsFocused();

  // Which scenery groups have been removed - same reasoning as the wallet:
  // owned above SceneStage so walking into the house and back out doesn't
  // bring a chopped-down tree back. Persisted (see engine/storage.ts) since
  // removal spends real coins - losing it on restart would mean the trees
  // come back but the coins don't. The *persisted set* only remembers
  // which ids were removed; `villageLayout.ts`'s collision/placement grids
  // are plain in-memory module state that resets on every JS load, so each
  // one has to be re-applied via `removeVillageSceneryGroup` here too, not
  // just remembered.
  const [removedSceneryIds, setRemovedSceneryIds] = useState<Set<string>>(() => {
    const saved = getJSON<string[]>(StorageKeys.removedScenery);
    const ids = new Set(saved ?? []);
    ids.forEach((id) => removeVillageSceneryGroup(id));
    return ids;
  });

  useEffect(() => {
    setJSON(StorageKeys.removedScenery, Array.from(removedSceneryIds));
  }, [removedSceneryIds]);

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
      <View style={styles.topRightRow} pointerEvents="box-none">
        <TicketChip />
        <CurrencyHud balance={wallet.balance} />
      </View>
      {/*
        Gated on focus - the bottom-tabs navigator keeps this screen mounted
        when another tab is active (see CLAUDE.md "Current state"), but its
        own hiding of inactive screens doesn't seem to fully clip a
        `Pressable`'s native view the way it does a plain `View` (CurrencyHud
        has no such issue) - the gear was visibly bleeding through onto every
        other tab without this check. Scoped to just this button rather than
        chasing the library-internals root cause.
      */}
      {isFocused && <SettingsButton />}
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

  // Every ambient NPC's own movement engine - lives here, outside <Canvas>,
  // same as the player's just above (see that hook's own comment for why -
  // short version: a Canvas remount below must not reset NPC positions).
  const npcCharacters = useWanderingNpcCharacters(
    scene.wanderingNpcs,
    world.obstacles,
    scene.walkable,
    scene.tileCollision,
    editModeActive,
    scene.tileSize,
  );

  // Walking into a door switches scenes - see portals.ts. A HomeScreen-level
  // concern layered on the character's position, not something the movement
  // engine needs to know about. Only fires for a player-directed walkTo, not
  // idle wandering (see useCharacter's `controlled`).
  usePortalWatcher(x, y, controlled, scene.portals, onPortal);

  // Fix for "zoom/pan gets laggy after backgrounding the app and
  // returning" (confirmed by the user, confirmed NOT the Fast-Refresh-
  // orphaned-mapper issue - see mistake #3 - since it reproduces on a
  // genuine background/foreground cycle, and confirmed NOT fixed by just
  // asking Skia to repaint - see below). Matches a known, unresolved
  // upstream bug (Shopify/react-native-skia#3695): on a real iOS device,
  // Canvas's rendering surface can come back degraded after the app was
  // genuinely suspended in the background - likely GPU/Metal context
  // related, not anything specific to this app's code.
  //
  // First attempt (2026-10-08) tried `canvasRef.redraw()` - a lightweight
  // "repaint now" (react-native-skia's `CanvasRef`, a thin wrapper around
  // the native `requestRedraw`) - specifically to avoid a full remount's
  // downsides. Confirmed on-device: didn't fix it. That makes sense in
  // hindsight - `redraw()` repaints using whatever surface already exists;
  // if the surface itself is what's degraded (the GitHub issue's own
  // suspicion), asking it to repaint changes nothing. A full Canvas remount
  // - the community's only known workaround - is what actually forces Skia
  // to build a fresh surface.
  //
  // Second attempt (2026-10-08, same day) remounted the whole `<Canvas>` on
  // every return to foreground - this fixed the lag, but every
  // `WanderingNpc`'s own `useCharacter` state used to live *inside* that
  // subtree, so remounting also reset every NPC to its spawn point and
  // froze it for a few seconds (pauseLeft's startup default) - reading as
  // "the app just launched," which the user correctly rejected as worse
  // than the lag.
  //
  // This is the corrected version: NPC movement state was lifted above
  // `<Canvas>` into `useWanderingNpcCharacters` just above (matching how
  // the player's already worked), so remounting the canvas now only
  // rebuilds *drawing* - position/pause-timers/camera/items all live
  // outside it and feed back in unchanged. There will likely still be one
  // brief repaint on each resume (recreating a GPU surface can't be
  // instant), but nothing should visibly jump, teleport, or freeze anymore.
  const [canvasGeneration, setCanvasGeneration] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") setCanvasGeneration((g) => g + 1);
    });
    return () => sub.remove();
  }, []);

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
  // Memoized (not just `scene.layers` itself when topLayerName is unset, as
  // it is for both scenes today) so that once a scene actually sets it,
  // `belowLayers` doesn't start handing SceneLayers.tsx's `memo`'d
  // SceneLayerAtlas a freshly-filtered array (new reference, same tiles)
  // every render - see that file's own comment on why a stable `images`
  // array mattered for the exact same reason.
  const belowLayers = useMemo(
    () =>
      scene.topLayerName
        ? scene.layers.filter((layer) => layer.name !== scene.topLayerName)
        : scene.layers,
    [scene.layers, scene.topLayerName],
  );
  const aboveLayer = useMemo(
    () =>
      scene.topLayerName
        ? scene.layers.find((layer) => layer.name === scene.topLayerName)
        : undefined,
    [scene.layers, scene.topLayerName],
  );

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
      <Canvas key={canvasGeneration} style={StyleSheet.absoluteFill}>
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
          The ambient NPCs (scenes that have any - see Scene.wanderingNpcs)
          share the player's paint slot: each is occluded by the same
          scenery and items the player is, not Y-sorting independently. Every
          one keeps to a small patch near its own spawn so its baseline stays
          close to the player's and that approximation holds; a full unified
          sort of every character is a later job (and a prerequisite for a
          shopkeeper NPC that stands somewhere specific). Drawn before the
          player so the player wins on overlap.
        */}
        {npcCharacters.map((npc, index) => (
          <Character
            // Spawn is fixed per scene mount, so its index is a stable key -
            // same spirit as any other data-driven list here.
            key={index}
            x={npc.x}
            y={npc.y}
            column={npc.column}
            row={npc.row}
            sheet={npc.skin ? WANDERING_NPC_SHEETS[npc.skin] : undefined}
            {...camera.entityProps}
          />
        ))}
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
  // Replaces CurrencyHud's own former `position: absolute, top: 56, right:
  // 12` - now the row wrapper owns that offset, with TicketChip alongside
  // it (see engine/TicketChip.tsx). `box-none` so the gaps around the two
  // chips (and between this row and SettingsButton below it) still let
  // world taps through.
  topRightRow: {
    position: "absolute",
    top: 56,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
