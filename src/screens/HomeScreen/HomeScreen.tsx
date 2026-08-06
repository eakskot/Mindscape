import { Canvas, Group } from "@shopify/react-native-skia";
import { useMemo, useRef, useState } from "react";
import {
  PanResponder,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import { Character } from "../../game/Character";
import { Room } from "../../game/Room";
import { DevInventory } from "../../game/items/DevInventory";
import { ItemLayer } from "../../game/items/ItemLayer";
import { useItemImages } from "../../game/items/itemImages";
import { useWorldItems } from "../../game/items/useWorldItems";
import { ROOM_HEIGHT, ROOM_WIDTH } from "../../game/roomLayout";
import { useCharacter } from "../../game/useCharacter";

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const world = useWorldItems();
  const { x, y, column, row, walkTo } = useCharacter(world.obstacles);
  const images = useItemImages();
  const [deleteMode, setDeleteMode] = useState(false);

  // The whole scene is drawn in room pixels and scaled up by a whole number,
  // which is what keeps the pixels square.
  const scale = Math.max(
    1,
    Math.floor(Math.min(width / ROOM_WIDTH, height / ROOM_HEIGHT)),
  );
  const offsetX = (width - ROOM_WIDTH * scale) / 2;
  const offsetY = (height - ROOM_HEIGHT * scale) / 2;

  // The gesture handler is created once and reads current state through refs, so
  // moving an item mid-drag cannot replace the active responder.
  const viewport = useRef({ scale, offsetX, offsetY });
  viewport.current = { scale, offsetX, offsetY };
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

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Never take the responder away from the dev inventory's buttons.
        onMoveShouldSetPanResponder: () => false,

        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          const { scale: s, offsetX: ox, offsetY: oy } = viewport.current;
          const roomX = (locationX - ox) / s;
          const roomY = (locationY - oy) / s;

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
          const { scale: s, offsetX: ox, offsetY: oy } = viewport.current;
          active.lastX = (locationX - ox) / s - active.grabX;
          active.lastY = (locationY - oy) / s - active.grabY;
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
          const { scale: s, offsetX: ox, offsetY: oy } = viewport.current;
          walkTo((locationX - ox) / s, (locationY - oy) / s);
        },
      }),
    [walkTo],
  );

  return (
    <View style={styles.container} {...responder.panHandlers}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group
          transform={[
            { translateX: offsetX },
            { translateY: offsetY },
            { scale },
          ]}
        >
          <Room />
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
          <Character x={x} y={y} column={column} row={row} />
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
