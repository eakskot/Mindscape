import { Canvas, Group } from "@shopify/react-native-skia";
import { useCallback, useMemo, useRef, useState, type ComponentType } from "react";
import {
  PanResponder,
  PixelRatio,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useDerivedValue } from "react-native-reanimated";

import { clamp } from "../../game/bounds";
import { Character } from "../../game/Character";
import { snapToDevicePixel } from "../../game/entitySprite";
import { DevInventory } from "../../game/items/DevInventory";
import { ItemLayer } from "../../game/items/ItemLayer";
import { useItemImages } from "../../game/items/itemImages";
import { useWorldItems } from "../../game/items/useWorldItems";
import { usePortalWatcher } from "../../game/portals";
import { Room } from "../../game/Room";
import { ROOM } from "../../game/roomLayout";
import type { Portal, Scene, SceneId } from "../../game/scene";
import { useCharacter } from "../../game/useCharacter";
import { Village } from "../../game/Village";
import { VILLAGE } from "../../game/village/villageLayout";

/**
 * Which component draws each scene's tiles. The scene *data* lives with the
 * scene itself (villageLayout.ts / roomLayout.ts) - this table only says
 * what to render for a given id, so HomeScreen never hardcodes "village".
 */
const SCENES: Record<SceneId, { scene: Scene; Component: ComponentType }> = {
  village: { scene: VILLAGE, Component: Village },
  room: { scene: ROOM, Component: Room },
};

/**
 * How much bigger than strict tile-proportion the character and placed items
 * are drawn - the same number for both, so furniture reads as consistent
 * with the character rather than shrinking relative to it. Independent of
 * the world's own zoom, so the world can show more surroundings without
 * shrinking everything drawn in it to match. Confirmed against a live
 * scale=20 test that the mechanism scales correctly and proportionally
 * before picking this value - see entitySprite.ts.
 */
const ENTITY_SCALE_MULTIPLIER = 2;

/**
 * Where the camera should sit so `charX,charY` (room pixels) lands in the
 * middle of the screen. Two cases: a scene bigger than the viewport (the
 * village) follows the character, clamped so it never shows past the
 * scene's edge; a scene smaller than the viewport (the room) is simply
 * centred - following the character there would do nothing but the naive
 * clamp (min==max==0) would pin it to a corner instead of the middle.
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
const cameraOffset = (
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
  const sceneWidthPx = sceneWidth * scale;
  const sceneHeightPx = sceneHeight * scale;
  const x =
    sceneWidthPx <= width
      ? (width - sceneWidthPx) / 2
      : clamp(width / 2 - charX * scale, width - sceneWidthPx, 0);
  const y =
    sceneHeightPx <= height
      ? (height - sceneHeightPx) / 2
      : clamp(height / 2 - charY * scale, height - sceneHeightPx, 0);
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
  const { scene, Component: SceneComponent } = SCENES[sceneId];

  const world = useWorldItems(scene.bounds, scene.tileSize);
  const { x, y, column, row, walkTo, controlled } = useCharacter(
    world.obstacles,
    scene.walkable,
    spawn,
    scene.tileCollision,
  );
  const images = useItemImages();
  const [deleteMode, setDeleteMode] = useState(false);

  // Walking into a door switches scenes - see portals.ts. Lives here, not in
  // useCharacter, because it's a HomeScreen-level concern layered on top of
  // the character's position, not something the movement engine needs to
  // know about. Only fires for a player-directed walkTo, not idle wandering
  // - see useCharacter's `controlled`.
  usePortalWatcher(x, y, controlled, scene.portals, onPortal);

  // A camera-follow scale for the world (tiles only): how many screen
  // pixels one room pixel maps to. Kept separate from the entity scale below
  // - see ENTITY_SCALE_MULTIPLIER.
  const scale = Math.max(
    1,
    Math.floor(height / (scene.tileSize * scene.preferredTilesVisibleTall)),
  );
  const entityScale = scale * ENTITY_SCALE_MULTIPLIER;

  // The camera follows the character every frame on the UI thread - it must
  // not touch React, same rule as the character's own movement. Exposed as
  // its own shared value (not just baked into `transform` below) so the
  // character and items - which draw outside the world's Group to get their
  // own scale - can read the same live camera position, computed once per
  // frame rather than once per axis.
  const density = PixelRatio.get();
  const camera = useDerivedValue(() =>
    cameraOffset(x.value, y.value, scale, width, height, scene.width, scene.height, density),
  );
  const transform = useDerivedValue(() => [
    { translateX: camera.value.x },
    { translateY: camera.value.y },
    { scale },
  ]);

  // The camera/worldScale/entityScale/density quartet every entity (the
  // character, every ItemLayer pass) needs to place itself - see
  // entitySprite.ts's toScreenPoint. Bundled once so each JSX element below
  // spreads it instead of retyping the same four props five times.
  const entityProps = { camera, worldScale: scale, entityScale, density };

  // The gesture handler is created once and reads current state through refs
  // (and, for the camera, through `camera`'s own live .value), so moving an
  // item mid-drag cannot replace the active responder and touches always
  // convert through the camera's current position, not a stale one from
  // mount. `scale` only changes on a real resize/rotation (a React render),
  // so a plain ref is enough.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const worldRef = useRef(world);
  worldRef.current = world;
  const deleteModeRef = useRef(deleteMode);
  deleteModeRef.current = deleteMode;
  const drag = useRef<{
    instanceId: string;
    grabX: number;
    grabY: number;
    lastX: number;
    lastY: number;
  } | null>(null);

  /** Screen point -> room pixels, using the camera's current position. */
  const toRoomPoint = (locationX: number, locationY: number) => ({
    roomX: (locationX - camera.value.x) / scaleRef.current,
    roomY: (locationY - camera.value.y) / scaleRef.current,
  });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Never take the responder away from the dev inventory's buttons.
        onMoveShouldSetPanResponder: () => false,

        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          const { roomX, roomY } = toRoomPoint(locationX, locationY);

          const item = worldRef.current.itemAt(roomX, roomY);
          if (!item) {
            drag.current = null;
            return;
          }
          if (deleteModeRef.current) {
            worldRef.current.removeItem(item.instanceId);
            drag.current = null;
            return;
          }
          drag.current = {
            instanceId: item.instanceId,
            // Keep the grab point under the finger instead of snapping the
            // item's corner to it.
            grabX: roomX - item.x,
            grabY: roomY - item.y,
            lastX: item.x,
            lastY: item.y,
          };
        },

        onPanResponderMove: (event) => {
          const active = drag.current;
          if (!active) {
            return;
          }
          const { locationX, locationY } = event.nativeEvent;
          const { roomX, roomY } = toRoomPoint(locationX, locationY);
          active.lastX = roomX - active.grabX;
          active.lastY = roomY - active.grabY;
          // Free movement while dragging; snapped on release.
          worldRef.current.moveItem(
            active.instanceId,
            active.lastX,
            active.lastY,
            false,
          );
        },

        onPanResponderRelease: (event) => {
          const active = drag.current;
          if (active) {
            worldRef.current.moveItem(
              active.instanceId,
              active.lastX,
              active.lastY,
            );
            drag.current = null;
            return;
          }
          const { locationX, locationY } = event.nativeEvent;
          const { roomX, roomY } = toRoomPoint(locationX, locationY);
          walkTo(roomX, roomY);
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
          <SceneComponent />
        </Group>
        <ItemLayer
          items={world.items}
          images={images}
          characterY={y}
          layer="floorDecal"
          pass="always"
          {...entityProps}
        />
        <ItemLayer
          items={world.items}
          images={images}
          characterY={y}
          layer="object"
          pass="behind"
          {...entityProps}
        />
        <Character
          x={x}
          y={y}
          column={column}
          row={row}
          {...entityProps}
        />
        <ItemLayer
          items={world.items}
          images={images}
          characterY={y}
          layer="object"
          pass="front"
          {...entityProps}
        />
        <ItemLayer
          items={world.items}
          images={images}
          characterY={y}
          layer="overhead"
          pass="always"
          {...entityProps}
        />
      </Canvas>

      <DevInventory
        onPlace={world.placeItem}
        onClear={world.clearItems}
        deleteMode={deleteMode}
        onToggleDeleteMode={() => setDeleteMode((current) => !current)}
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
