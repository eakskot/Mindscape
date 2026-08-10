import { Canvas, Group } from "@shopify/react-native-skia";
import { useMemo, useRef, useState } from "react";
import {
  PanResponder,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useDerivedValue } from "react-native-reanimated";

import { clamp } from "../../game/bounds";
import { Character } from "../../game/Character";
import { DevInventory } from "../../game/items/DevInventory";
import { ItemLayer } from "../../game/items/ItemLayer";
import { useItemImages } from "../../game/items/itemImages";
import { useWorldItems } from "../../game/items/useWorldItems";
import { useCharacter } from "../../game/useCharacter";
import { Village } from "../../game/Village";
import {
  VILLAGE,
  VILLAGE_HEIGHT,
  VILLAGE_TILE,
  VILLAGE_TILES_VISIBLE_TALL,
  VILLAGE_WIDTH,
} from "../../game/village/villageLayout";

// The character currently lives in the village (see Village.tsx /
// villageLayout.ts). The room (Room.tsx / roomLayout.ts / roomConfig.ts) is
// untouched and unused for now - it is meant to be re-entered later through
// a door into the house.

/**
 * How much bigger than strict tile-proportion the character is drawn.
 * Independent of the world's own zoom, so the world can show more
 * surroundings without shrinking the character to match. Confirmed against
 * a live scale=20 test that the mechanism scales correctly and
 * proportionally before picking this value - see Character.tsx.
 */
const CHARACTER_SCALE_MULTIPLIER = 2;

/**
 * Where the camera should sit so `charX,charY` (room pixels) lands in the
 * middle of the screen, clamped so it never shows past the scene's edge.
 * Scene-agnostic - takes the active scene's own pixel size as a parameter
 * rather than assuming which scene is active.
 */
const cameraOffset = (
  charX: number,
  charY: number,
  scale: number,
  width: number,
  height: number,
  sceneWidth: number,
  sceneHeight: number,
) => {
  "worklet";
  const minOffsetX = Math.min(0, width - sceneWidth * scale);
  const minOffsetY = Math.min(0, height - sceneHeight * scale);
  return {
    x: clamp(width / 2 - charX * scale, minOffsetX, 0),
    y: clamp(height / 2 - charY * scale, minOffsetY, 0),
  };
};

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const world = useWorldItems(VILLAGE.bounds);
  const { x, y, column, row, walkTo } = useCharacter(
    world.obstacles,
    VILLAGE.walkable,
    VILLAGE.start,
    VILLAGE.tileCollision,
  );
  const images = useItemImages();
  const [deleteMode, setDeleteMode] = useState(false);

  // A camera-follow scale for the world (tiles, items): how many screen
  // pixels one room pixel maps to. Kept separate from the character's own
  // scale below - see CHARACTER_SCALE_MULTIPLIER.
  const scale = Math.max(
    1,
    Math.floor(height / (VILLAGE_TILE * VILLAGE_TILES_VISIBLE_TALL)),
  );
  const characterScale = scale * CHARACTER_SCALE_MULTIPLIER;

  // The camera follows the character every frame on the UI thread - it must
  // not touch React, same rule as the character's own movement. Exposed as
  // its own shared value (not just baked into `transform` below) so the
  // character - which draws outside the world's Group to get its own scale -
  // can read the same live camera position, computed once per frame rather
  // than once per axis.
  const camera = useDerivedValue(() =>
    cameraOffset(x.value, y.value, scale, width, height, VILLAGE_WIDTH, VILLAGE_HEIGHT),
  );
  const transform = useDerivedValue(() => [
    { translateX: camera.value.x },
    { translateY: camera.value.y },
    { scale },
  ]);

  // The gesture handler is created once and reads current state through refs
  // (and, for the camera, through `camera`'s own live .value), so moving an
  // item mid-drag cannot replace the active responder and touches always
  // convert through the camera's current position, not a stale one from
  // mount. `scale` only changes on a real resize/rotation (a React render),
  // so a plain ref is enough - no need for the object wrapper cameraX/cameraY
  // used to need.
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
          Character sits between two Groups sharing the same `transform`
          instead of nested inside one, because it carries its own
          `characterScale` (see Character.tsx) rather than the world's
          `scale` - nesting it would compose a fractional inner scale with
          the outer one, which risks uneven pixel sampling (see the
          "Integer scale only" rule in roomLayout.ts). Splitting the Group
          keeps every scale factor a clean whole number while preserving the
          same floorDecal / behind / character / front / overhead paint
          order the item y-sort relies on.
        */}
        <Group transform={transform}>
          <Village />
          <ItemLayer
            items={world.items}
            images={images}
            characterY={y}
            layer="floorDecal"
            pass="always"
          />
          <ItemLayer
            items={world.items}
            images={images}
            characterY={y}
            layer="object"
            pass="behind"
          />
        </Group>
        <Character
          x={x}
          y={y}
          column={column}
          row={row}
          camera={camera}
          worldScale={scale}
          characterScale={characterScale}
        />
        <Group transform={transform}>
          <ItemLayer
            items={world.items}
            images={images}
            characterY={y}
            layer="object"
            pass="front"
          />
          <ItemLayer
            items={world.items}
            images={images}
            characterY={y}
            layer="overhead"
            pass="always"
          />
        </Group>
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
