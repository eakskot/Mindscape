import { Canvas, Group, useClock, type SkImage } from "@shopify/react-native-skia";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  PixelRatio,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Easing,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { clamp } from "../../game/bounds";
import { Character } from "../../game/Character";
import { type DepthEntity, DepthSortedLayer } from "../../game/DepthSortedLayer";
import { snapToDevicePixel } from "../../game/entitySprite";
import { DevInventory } from "../../game/items/DevInventory";
import { DragHighlight } from "../../game/items/DragHighlight";
import type { EditMode } from "../../game/items/editMode";
import { ItemLayer, ItemVisual } from "../../game/items/ItemLayer";
import { ITEM_CATALOG, type ItemId } from "../../game/items/itemCatalog";
import { useItemImages } from "../../game/items/itemImages";
import { baselineOf, useWorldItems } from "../../game/items/useWorldItems";
import { usePortalWatcher } from "../../game/portals";
import { useRoomImages } from "../../game/Room";
import { ROOM } from "../../game/roomLayout";
import { SceneLayers, StaticTileAtlas } from "../../game/SceneLayers";
import type { Portal, Scene, SceneId } from "../../game/scene";
import { useCharacter } from "../../game/useCharacter";
import { useVillageImages } from "../../game/Village";
import { VILLAGE } from "../../game/village/villageLayout";
import { WanderingNpc } from "../../game/WanderingNpc";

/**
 * Which images to load for each scene's tiles. The scene *data* lives with
 * the scene itself (villageLayout.ts / roomLayout.ts) - this table only
 * says what to load for a given id, so HomeScreen never hardcodes "village".
 * A hook, not a component, because SceneStage below needs the images
 * itself: it draws the scene's layers in two passes (below vs. above the
 * character - see `Scene.topLayerName`), not as one opaque unit.
 */
const SCENES: Record<SceneId, { scene: Scene; useImages: () => (SkImage | null)[] }> = {
  village: { scene: VILLAGE, useImages: useVillageImages },
  room: { scene: ROOM, useImages: useRoomImages },
};

/**
 * The character and placed items always draw at `worldScale` x this factor -
 * bigger on screen than a strict tile, so they read as substantial, but
 * *locked* to the tile scale so the proportion between character and world
 * never shifts, at any zoom level. Confirmed against a live scale=20 test
 * that the mechanism scales correctly and proportionally - see entitySprite.ts.
 */
const ENTITY_SCALE_MULTIPLIER = 2;

/**
 * The world/tile scale the player may pinch between. Whole numbers only *at
 * rest* - a fractional tile scale makes pixel art shimmer (see roomLayout.ts's
 * "integer scale only") - but a pinch drives it *continuously* through the
 * in-between values and only settles onto a whole one on release, so the two
 * ends of the range never feel a jump between them. 1 is as far out as pixel
 * art allows (a tile can't be sub-native); the scene's own preferred framing
 * picks the starting point within [MIN, MAX].
 */
const MIN_WORLD_SCALE = 1;
const MAX_WORLD_SCALE = 5;
/** How long the world takes to ease onto a whole scale after a pinch ends. */
const ZOOM_SETTLE_MS = 130;

/**
 * A touch has to travel at least this many RN points before the
 * PanResponder below treats it as dragging the camera instead of a tap -
 * short enough that panning still feels immediate, long enough that an
 * unsteady finger on a tap-to-move doesn't nudge the camera or get eaten as
 * a drag.
 */
const TAP_DRAG_THRESHOLD = 8;

/**
 * The valid range for the camera's translateX/Y, in screen pixels, so the
 * scene never shows past its own edge. A scene bigger than the viewport
 * (the village) can slide between showing its start and its end; a scene
 * smaller than the viewport (the room) collapses min===max to the single
 * centred position - simply clamping min=width-sceneWidthPx (positive
 * there) against max=0 would invert the range and force everything to 0
 * (pinned to a corner) instead of centred, so it needs its own branch, not
 * just a clamp. Shared by `followPosition` below and the PanResponder's
 * drag math, so both agree on where the camera is allowed to go - in
 * particular so dragging in the room (which fits on screen already) is a
 * no-op instead of visibly nudging it off-centre.
 */
const cameraRange = (
  scale: number,
  width: number,
  height: number,
  sceneWidth: number,
  sceneHeight: number,
) => {
  "worklet";
  const sceneWidthPx = sceneWidth * scale;
  const sceneHeightPx = sceneHeight * scale;
  const x =
    sceneWidthPx <= width
      ? { min: (width - sceneWidthPx) / 2, max: (width - sceneWidthPx) / 2 }
      : { min: width - sceneWidthPx, max: 0 };
  const y =
    sceneHeightPx <= height
      ? { min: (height - sceneHeightPx) / 2, max: (height - sceneHeightPx) / 2 }
      : { min: height - sceneHeightPx, max: 0 };
  return { x, y };
};

/**
 * Where the camera sits when centred on `charX,charY` (room pixels) - used
 * both to seed the camera at mount and by the per-frame follow in
 * SceneStage below.
 *
 * Snapped to the device-pixel grid before returning (see entitySprite.ts's
 * `snapToDevicePixel`). Every tile's own position is already an exact
 * multiple of the (integer) world scale, so a snapped camera offset lands
 * every tile on a whole pixel too - an unsnapped one (charX/charY move
 * continuously while walking) would otherwise place adjacent tiles a hair
 * apart on some frames, letting the canvas's own background colour show
 * through as a thin seam. This is the standard tilemap-seam fix ("camera
 * pixel snapping"), the translation counterpart to the "integer scale only"
 * rule above.
 */
const followPosition = (
  charX: number,
  charY: number,
  scale: number,
  width: number,
  height: number,
  sceneWidth: number,
  sceneHeight: number,
  /**
   * Device pixels per RN point (3 on this iPhone) - snapping to the nearest
   * *point* was 3x coarser than the screen's actual pixel grid, since a
   * point is 3 real device pixels here. Skia still rasterises to real
   * device pixels regardless of what unit our own math uses, so rounding
   * to the nearest 1/density point is the coarsest grid that stays exactly
   * on a device pixel - anything coarser (whole points) was needlessly
   * chunky motion, anything finer (unrounded) is what caused the seams
   * in the first place.
   */
  density: number,
) => {
  "worklet";
  const range = cameraRange(scale, width, height, sceneWidth, sceneHeight);
  const x = clamp(width / 2 - charX * scale, range.x.min, range.x.max);
  const y = clamp(height / 2 - charY * scale, range.y.min, range.y.max);
  return {
    x: snapToDevicePixel(x, density),
    y: snapToDevicePixel(y, density),
  };
};

type SceneState = { sceneId: SceneId; spawn: { x: number; y: number } };

/**
 * Holds which scene is active. Switching scenes remounts `SceneStage` (keyed
 * by `sceneId`) instead of trying to "teleport" a live character across
 * scenes - `walkable`/`tileCollision`/`bounds` are plain values closed over
 * by useCharacter/useWorldItems at mount time today, not shared values, so a
 * remount gets a scene's data right by construction instead of risking a
 * frame that mixes one scene's bounds with another's collision grid.
 *
 * Trade-off, stated plainly: placed items don't carry across a scene switch
 * within the session, since each mount gets a fresh useWorldItems. That's
 * acceptable for now - nothing is persisted across app restarts either, the
 * item system has no storage wired up yet regardless.
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

  const world = useWorldItems(scene.bounds, scene.tileSize, scene.placementMask);
  const [editMode, setEditMode] = useState<EditMode>("none");
  // Mirrors `editMode` into a shared value - see its own comment further
  // down for why a plain ref won't do. Declared before useCharacter so it
  // can be passed straight in as the "hold still" signal for move/delete
  // mode (see useCharacter.ts's `frozen`).
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

  const images = useItemImages();
  // Which placed item is currently being held in move mode, for
  // DragHighlight's glow - null the rest of the time (including in delete
  // mode, which never holds anything). See the PanResponder below.
  const [draggedInstanceId, setDraggedInstanceId] = useState<string | null>(null);
  // Whether the held item's *current* position would be a legal drop - the
  // live yellow/red feedback DragHighlight shows while dragging, and what
  // onPanResponderRelease uses to decide commit vs. bounce-back.
  const [dragValid, setDragValid] = useState(true);
  const draggedItem =
    world.items.find((item) => item.instanceId === draggedInstanceId) ?? null;

  // One clock shared by every animated tile across both of the layer passes
  // below (below the character, and the roof pass above it) - see
  // SceneLayers.tsx's own comment on why it must be the same clock rather
  // than one per pass.
  const clock = useClock();
  // The village's roof draws in a second pass, above the character and
  // items, instead of in the single below-everything pass every other
  // layer uses - see Scene.topLayerName's own comment.
  const belowLayers = scene.topLayerName
    ? scene.layers.filter((layer) => layer.name !== scene.topLayerName)
    : scene.layers;
  const aboveLayer = scene.topLayerName
    ? scene.layers.find((layer) => layer.name === scene.topLayerName)
    : undefined;

  // Walking into a door switches scenes - see portals.ts. Lives here, not in
  // useCharacter, because it's a HomeScreen-level concern layered on top of
  // the character's position, not something the movement engine needs to
  // know about. Only fires for a player-directed walkTo, not idle wandering
  // - see useCharacter's `controlled`.
  usePortalWatcher(x, y, controlled, scene.portals, onPortal);

  const density = PixelRatio.get();

  // The scene's own preferred framing, as a whole world scale - the value a
  // pinch starts from and settles back towards. Clamped into the pinch range.
  const baseScale = clamp(
    Math.max(
      1,
      Math.floor(height / (scene.tileSize * scene.preferredTilesVisibleTall)),
    ),
    MIN_WORLD_SCALE,
    MAX_WORLD_SCALE,
  );

  // The *live* world (tile) scale. A shared value, not React state, because a
  // pinch moves it continuously every frame (fractional in between) and it
  // must feed `transform` and every entity without a render in the loop.
  // Whole at rest. A scene switch remounts this component, so it resets.
  const worldScale = useSharedValue(baseScale);
  // Items and the character scale in lockstep with the tiles - a fixed factor
  // of the world scale, so their proportion never shifts at any zoom.
  const entityScale = useDerivedValue(
    () => worldScale.value * ENTITY_SCALE_MULTIPLIER,
  );

  // The live camera position, in screen pixels, as two shared values so each
  // axis can be eased on its own (see settlePinch's withTiming). Plain shared
  // values, not derived, because whether they track the character this frame
  // depends on `following` below - a pure function of the current inputs
  // can't express that. Seeded already centred on the spawn point so there's
  // no first-frame flash at the wrong position.
  const seed = followPosition(
    spawn.x, spawn.y, baseScale, width, height, scene.width, scene.height, density,
  );
  const cameraX = useSharedValue(seed.x);
  const cameraY = useSharedValue(seed.y);
  // The `{x, y}` view of the pair the character, items and `transform` read.
  const camera = useDerivedValue(() => ({ x: cameraX.value, y: cameraY.value }));

  // Whether the camera should keep centring on the character every frame.
  // Starts true (freshly spawned, nothing panned yet); a real camera drag
  // (see the PanResponder below) turns it off, and - this is the important
  // part - nothing ever turns it back on again for the rest of this
  // scene's lifetime, not even tapping to walk somewhere. Two bugs taught
  // this the hard way: first, resuming on the *next frame* after a drag
  // dragged the view straight back towards the character mid-walk, since
  // `followPosition` has no easing - it teleports, so any per-frame
  // "resume" reads as constant drift. Then, resuming *on tap* had the same
  // teleport problem at gesture scale: pan over to look at the beach, tap
  // a tree there, and the whole screen would yank itself back onto the
  // character (who might be nowhere near what you tapped) with no warning.
  // So a pan is simply a one-way handoff of camera control to the player -
  // they can always pan back themselves, and a scene remount (switching
  // village/room) resets this fresh regardless.
  const following = useSharedValue(true);

  // While arranging furniture the camera must hold still regardless of
  // `following` (see `editModeActive`, declared up near useCharacter) -
  // belt-and-braces on top of the character now being frozen too (see
  // useCharacter.ts's `frozen`): the camera itself should never auto-track
  // during edit mode even if something else nudges the character.

  // The camera follows the character every frame on the UI thread - it must
  // not touch React, same rule as the character's own movement.
  useFrameCallback(() => {
    "worklet";
    if (!following.value || editModeActive.value) {
      return;
    }
    const at = followPosition(
      x.value,
      y.value,
      worldScale.value,
      width,
      height,
      scene.width,
      scene.height,
      density,
    );
    cameraX.value = at.x;
    cameraY.value = at.y;
  });

  const transform = useDerivedValue(() => [
    { translateX: cameraX.value },
    { translateY: cameraY.value },
    { scale: worldScale.value },
  ]);

  // The camera/worldScale/entityScale/density quartet every entity (the
  // character, every ItemLayer pass) needs to place itself - see
  // entitySprite.ts's toScreenPoint. All four are stable references, so this
  // is memoised: `depthEntities` below closes over it.
  const entityProps = useMemo(
    () => ({ camera, worldScale, entityScale, density }),
    [camera, worldScale, entityScale, density],
  );

  // Placed `object` items and free-standing scenery (trees, rocks, bushes)
  // merged into one baseline-sorted list, so DepthSortedLayer's behind/front
  // toggle resolves their draw order against *each other* as well as against
  // the character - see that file's own comment on why the two need to go
  // through the same pass together instead of scenery always drawing above
  // or below every item regardless of position.
  //
  // An item draws through ItemVisual - the same animated/static switch
  // ItemLayer's own passes use - at entity scale, unwrapped. Scenery is
  // pre-grouped into per-row bands (see SceneSceneryBand); each band draws
  // as one batched StaticTileAtlas per tileset (no per-frame worklets - a
  // tree never animates), at world scale, wrapped in the world's own camera
  // Group since its tiles' dx/dy are room pixels, not entity-scale ones.
  const depthEntities = useMemo<DepthEntity[]>(() => {
    const itemEntities: DepthEntity[] = world.items
      .filter((item) => ITEM_CATALOG[item.itemId].layer === "object")
      .map((item) => ({
        key: `item-${item.instanceId}`,
        baseline: baselineOf(item),
        node: (
          <ItemVisual item={item} image={images[item.itemId]} {...entityProps} />
        ),
      }));

    const sceneryEntities: DepthEntity[] = (scene.sceneryBands ?? []).map(
      (band, index) => ({
        key: `scenery-band-${index}`,
        baseline: band.baseline,
        node: (
          <Group transform={transform}>
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
      }),
    );

    return [...itemEntities, ...sceneryEntities].sort((a, b) => a.baseline - b.baseline);
  }, [
    world.items,
    images,
    entityProps,
    scene.sceneryBands,
    scene.tileSize,
    sceneImages,
    transform,
  ]);

  // The gesture handler is created once and reads current state through refs
  // (and, for the camera and world scale, through their own live `.value`),
  // so moving an item mid-drag cannot replace the active responder and
  // touches always convert through the current camera/scale, not a stale one
  // from mount.
  //
  // width/height come from useWindowDimensions and can change on rotation,
  // but the PanResponder below is only built once (see the responder's own
  // useMemo), hence the refs.
  const widthRef = useRef(width);
  widthRef.current = width;
  const heightRef = useRef(height);
  heightRef.current = height;
  const worldRef = useRef(world);
  worldRef.current = world;
  const editModeRef = useRef(editMode);
  editModeRef.current = editMode;
  const drag = useRef<{
    instanceId: string;
    itemId: ItemId;
    grabX: number;
    grabY: number;
    lastX: number;
    lastY: number;
    // Where the item stood before this drag, to bounce back to on an
    // invalid drop - always itself a valid, already-snapped position.
    startX: number;
    startY: number;
  } | null>(null);
  // A background touch (nothing under the finger at grant) starts out as a
  // pan candidate; it only becomes a real camera drag once it travels past
  // TAP_DRAG_THRESHOLD (see onPanResponderMove), so a plain tap still falls
  // through to walkTo on release. Screen-space start point + the camera's
  // own position at grant time, so a drag begun mid-pan continues from
  // where it was instead of jumping.
  const pan = useRef<{
    startX: number;
    startY: number;
    startCameraX: number;
    startCameraY: number;
    moved: boolean;
  } | null>(null);
  // Live two-finger pinch: the finger spread and world scale it began at, so
  // every move re-derives an absolute target scale from the ratio (no drift).
  const pinch = useRef<{ startDist: number; startScale: number } | null>(null);
  // Set the moment a gesture becomes a pinch, so its release doesn't also
  // fire tap-to-walk. Cleared at the next grant.
  const gestureWasPinch = useRef(false);
  // The last world point pinned under the finger midpoint, so the settle can
  // keep it exactly there while the scale eases onto a whole number.
  const zoomAnchor = useRef<{
    worldX: number;
    worldY: number;
    focalX: number;
    focalY: number;
  } | null>(null);

  /** Camera x/y that puts `worldX,worldY` under `focalX,focalY` at `s`. */
  const cameraForFocus = (
    anchor: NonNullable<typeof zoomAnchor.current>,
    s: number,
  ) => {
    const range = cameraRange(
      s,
      widthRef.current,
      heightRef.current,
      scene.width,
      scene.height,
    );
    return {
      x: snapToDevicePixel(
        clamp(anchor.focalX - anchor.worldX * s, range.x.min, range.x.max),
        density,
      ),
      y: snapToDevicePixel(
        clamp(anchor.focalY - anchor.worldY * s, range.y.min, range.y.max),
        density,
      ),
    };
  };

  /**
   * Set the live world scale to `next` (already clamped) keeping the world
   * point under the finger midpoint `(fx, fy)` fixed - i.e. the zoom stays
   * centred on where the fingers are. Hands camera control off the first
   * time it actually moves (`following = false`, like a pan), so the follow
   * loop can't fight the focal lock. `next` may be fractional mid-pinch; the
   * release settles it.
   */
  const setWorldScaleAbout = (next: number, fx: number, fy: number) => {
    const prev = worldScale.value;
    if (next === prev) {
      return;
    }
    following.value = false;
    const worldX = (fx - cameraX.value) / prev;
    const worldY = (fy - cameraY.value) / prev;
    zoomAnchor.current = { worldX, worldY, focalX: fx, focalY: fy };
    worldScale.value = next;
    const cam = cameraForFocus(zoomAnchor.current, next);
    cameraX.value = cam.x;
    cameraY.value = cam.y;
  };

  /**
   * End a pinch: ease the world onto the nearest whole scale (so the pixel
   * art is crisp at rest) *and* the camera to match, together and over the
   * same short window, so the point under the fingers stays put the whole
   * way rather than drifting as the scale changes under a static camera.
   */
  const settlePinch = () => {
    const settled = clamp(
      Math.round(worldScale.value),
      MIN_WORLD_SCALE,
      MAX_WORLD_SCALE,
    );
    const opts = { duration: ZOOM_SETTLE_MS, easing: Easing.out(Easing.quad) };
    worldScale.value = withTiming(settled, opts);
    if (zoomAnchor.current) {
      const cam = cameraForFocus(zoomAnchor.current, settled);
      cameraX.value = withTiming(cam.x, opts);
      cameraY.value = withTiming(cam.y, opts);
    }
    pinch.current = null;
  };

  /** Screen point -> room pixels, using the camera's current position. */
  const toRoomPoint = (locationX: number, locationY: number) => ({
    roomX: (locationX - cameraX.value) / worldScale.value,
    roomY: (locationY - cameraY.value) / worldScale.value,
  });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Never take the responder away from the dev inventory's buttons.
        onMoveShouldSetPanResponder: () => false,

        onPanResponderGrant: (event) => {
          pinch.current = null;
          gestureWasPinch.current = false;

          const { locationX, locationY } = event.nativeEvent;
          const { roomX, roomY } = toRoomPoint(locationX, locationY);

          // Outside move/delete mode, items are inert scenery - every touch
          // is plain tap-to-walk/camera-drag, same as if there were no
          // furniture there at all. This is the fix for a touch near a big
          // item (a fountain, the plant stand) getting eaten as an
          // accidental grab instead of a walk, and vice versa - dragging
          // now only ever happens on purpose, inside a mode you chose.
          const item =
            editModeRef.current !== "none"
              ? worldRef.current.itemAt(roomX, roomY, ENTITY_SCALE_MULTIPLIER)
              : undefined;
          if (!item) {
            drag.current = null;
            pan.current = {
              startX: locationX,
              startY: locationY,
              startCameraX: cameraX.value,
              startCameraY: cameraY.value,
              moved: false,
            };
            return;
          }
          pan.current = null;
          if (editModeRef.current === "delete") {
            worldRef.current.removeItem(item.instanceId);
            drag.current = null;
            return;
          }
          drag.current = {
            instanceId: item.instanceId,
            itemId: item.itemId,
            // Keep the grab point under the finger instead of snapping the
            // item's corner to it.
            grabX: roomX - item.x,
            grabY: roomY - item.y,
            lastX: item.x,
            lastY: item.y,
            startX: item.x,
            startY: item.y,
          };
          setDraggedInstanceId(item.instanceId);
          setDragValid(true);
        },

        onPanResponderMove: (event) => {
          // Two fingers down anywhere: pinch-zoom, which pre-empts panning
          // and tap-to-walk. (An item drag in progress wins - two fingers
          // mid-furniture-drag just isn't a gesture we act on.)
          const touches = event.nativeEvent.touches;
          if (touches.length >= 2 && !drag.current) {
            const [a, b] = touches;
            const dist = Math.sqrt(
              (a.locationX - b.locationX) ** 2 + (a.locationY - b.locationY) ** 2,
            );
            const focalX = (a.locationX + b.locationX) / 2;
            const focalY = (a.locationY + b.locationY) / 2;
            if (!pinch.current) {
              pan.current = null;
              gestureWasPinch.current = true;
              pinch.current = { startDist: dist, startScale: worldScale.value };
              return;
            }
            // Continuous: the world tracks the spread 1:1 (fractional is fine
            // while the hand is on it), keeping the current finger midpoint
            // fixed. It settles onto a whole scale on release.
            const next = clamp(
              (pinch.current.startScale * dist) / pinch.current.startDist,
              MIN_WORLD_SCALE,
              MAX_WORLD_SCALE,
            );
            setWorldScaleAbout(next, focalX, focalY);
            return;
          }
          if (pinch.current) {
            // Dropped back below two fingers - settle now (same as release)
            // and don't resurrect a pan from whichever finger is left.
            settlePinch();
            return;
          }

          const itemDrag = drag.current;
          if (itemDrag) {
            const { locationX, locationY } = event.nativeEvent;
            const { roomX, roomY } = toRoomPoint(locationX, locationY);
            itemDrag.lastX = roomX - itemDrag.grabX;
            itemDrag.lastY = roomY - itemDrag.grabY;
            // Free movement while dragging; snapped on release.
            worldRef.current.moveItem(
              itemDrag.instanceId,
              itemDrag.lastX,
              itemDrag.lastY,
              false,
            );
            // Live yellow/red feedback - checked against where release would
            // actually snap to, not the raw finger position, so the glow
            // never lies about what a drop right now would do. Both the
            // ground check and the "would this land on another item"
            // check have to pass - dragging one item onto another used to
            // silently let them overlap, which is exactly what made the
            // covered one feel unclickable afterwards (see itemAt's
            // baseline-priority pick).
            setDragValid(
              worldRef.current.isValidPlacement(
                itemDrag.lastX,
                itemDrag.lastY,
                itemDrag.itemId,
              ) &&
                !worldRef.current.overlapsOtherItem(
                  itemDrag.lastX,
                  itemDrag.lastY,
                  itemDrag.itemId,
                  itemDrag.instanceId,
                ),
            );
            return;
          }

          const panDrag = pan.current;
          if (!panDrag) {
            return;
          }
          const { locationX, locationY } = event.nativeEvent;
          const dx = locationX - panDrag.startX;
          const dy = locationY - panDrag.startY;
          if (
            !panDrag.moved &&
            dx * dx + dy * dy < TAP_DRAG_THRESHOLD * TAP_DRAG_THRESHOLD
          ) {
            // Still within the tap threshold - don't nudge the camera yet.
            return;
          }
          panDrag.moved = true;
          // A real drag: stop auto-following (see `following`'s own
          // comment) and move the camera 1:1 with the finger, clamped to
          // the same range the follow camera itself respects.
          following.value = false;
          const range = cameraRange(
            worldScale.value,
            widthRef.current,
            heightRef.current,
            scene.width,
            scene.height,
          );
          cameraX.value = snapToDevicePixel(
            clamp(panDrag.startCameraX + dx, range.x.min, range.x.max),
            density,
          );
          cameraY.value = snapToDevicePixel(
            clamp(panDrag.startCameraY + dy, range.y.min, range.y.max),
            density,
          );
        },

        onPanResponderRelease: (event) => {
          // A pinch this gesture: the lift ends a zoom, not a tap. Settle the
          // world onto a whole scale (a no-op if a mid-gesture finger-drop
          // already did).
          if (gestureWasPinch.current) {
            gestureWasPinch.current = false;
            if (pinch.current) {
              settlePinch();
            }
            pan.current = null;
            return;
          }

          const itemDrag = drag.current;
          if (itemDrag) {
            const valid =
              worldRef.current.isValidPlacement(
                itemDrag.lastX,
                itemDrag.lastY,
                itemDrag.itemId,
              ) &&
              !worldRef.current.overlapsOtherItem(
                itemDrag.lastX,
                itemDrag.lastY,
                itemDrag.itemId,
                itemDrag.instanceId,
              );
            if (valid) {
              worldRef.current.moveItem(
                itemDrag.instanceId,
                itemDrag.lastX,
                itemDrag.lastY,
              );
            } else {
              // Bounce back to where the drag started - startX/startY was
              // already a valid, snapped position, so this can't itself
              // land somewhere illegal.
              worldRef.current.moveItem(
                itemDrag.instanceId,
                itemDrag.startX,
                itemDrag.startY,
              );
            }
            drag.current = null;
            setDraggedInstanceId(null);
            return;
          }

          const panDrag = pan.current;
          pan.current = null;
          if (panDrag?.moved) {
            // A real drag panned the camera - not a tap, so the character
            // stays put and the camera stays frozen right where the player
            // left it (see `following`).
            return;
          }

          // Outside move/delete mode, a plain background tap walks the
          // character there, same as always. Inside either mode, the
          // screen is for arranging furniture, not walking - a background
          // tap does nothing (no accidental walk while you're trying to
          // tidy up).
          if (editModeRef.current !== "none") {
            return;
          }

          const { locationX, locationY } = event.nativeEvent;
          const { roomX, roomY } = toRoomPoint(locationX, locationY);
          walkTo(roomX, roomY);
          // Deliberately *not* touching `following`/`camera` here. An
          // earlier version resumed following and snapped the camera onto
          // the character the instant you tapped - but if you'd panned
          // away to look at, say, the beach, and tapped a tree back near
          // the character (or anywhere the character currently wasn't),
          // that snap yanked the whole screen off the beach and onto the
          // character with no warning, because `followPosition` has no
          // easing - it teleports. A tap should only ever aim the
          // character; the camera stays exactly where you put it, panned
          // or not, until you deliberately pan it again yourself.
        },
      }),
    [walkTo],
  );

  return (
    <View style={styles.container} {...responder.panHandlers}>
      <Canvas style={StyleSheet.absoluteFill}>
        {/*
          Only the tile layers sit inside the world-scaled Group. The
          character and every item draw at their own `entityScale` (see
          entitySprite.ts) instead of nesting inside this Group's `scale` -
          nesting would compose a fractional inner scale with the outer one,
          which risks uneven pixel sampling (see "Integer scale only" in
          roomLayout.ts). They stay in the same floorDecal / behind /
          character / front / overhead paint order the item y-sort relies on
          - that order comes from where each element sits in this JSX, not
          from which Group (if any) it's nested in.
        */}
        <Group transform={transform}>
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
          {...entityProps}
        />
        <DepthSortedLayer entities={depthEntities} pass="behind" characterY={y} />
        {/*
          The ambient NPC (scenes that have one - see Scene.wanderingNpc)
          shares the player's paint slot: it's occluded by the same scenery
          and items the player is, rather than Y-sorting independently. It
          keeps to a small patch near its spawn, so its baseline stays close
          to the player's and that approximation holds; a full unified sort
          of both characters is a later job if it ever needs one. Drawn
          before the player so the player wins on overlap.
        */}
        {scene.wanderingNpc && (
          <WanderingNpc
            spawn={scene.wanderingNpc.spawn}
            obstacles={world.obstacles}
            walkable={scene.walkable}
            tileCollision={scene.tileCollision}
            frozen={editModeActive}
            tileSize={scene.tileSize}
            {...entityProps}
          />
        )}
        <Character
          x={x}
          y={y}
          column={column}
          row={row}
          {...entityProps}
        />
        <DepthSortedLayer entities={depthEntities} pass="front" characterY={y} />
        <ItemLayer
          items={world.items}
          images={images}
          characterY={y}
          layer="overhead"
          pass="always"
          {...entityProps}
        />
        {/*
          The roof/tree-canopy layer, if the scene has one - drawn last so
          it paints over the character and every item instead of under
          them, the same "walk behind the roof" effect a real house needs.
          See Scene.topLayerName.
        */}
        {aboveLayer && (
          <Group transform={transform}>
            <SceneLayers
              layers={[aboveLayer]}
              tileSize={scene.tileSize}
              clock={clock}
              images={sceneImages}
            />
          </Group>
        )}
        <DragHighlight item={draggedItem} valid={dragValid} {...entityProps} />
      </Canvas>

      <DevInventory
        // Drop new items at the centre of what's currently on screen, not
        // a fixed map spot - see placeItem's own comment on why.
        onPlace={(itemId) => {
          const { roomX, roomY } = toRoomPoint(width / 2, height / 2);
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
