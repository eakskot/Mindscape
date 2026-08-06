/**
 * The world's placed items: state, mutations and the collision data the
 * character reads on the UI thread.
 *
 * A placed item is `{ instanceId, itemId, x, y }` and nothing else, so the whole
 * room is JSON-serialisable - that is what `serialize` / `restore` are for when
 * we add saving. The same hook works for an outdoor scene; it only needs bounds.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSharedValue } from "react-native-reanimated";

import { ROOM, TILE } from "../roomLayout";
import { ITEM_CATALOG, type ItemId, type Rect } from "./itemCatalog";

export type PlacedItem = {
  instanceId: string;
  itemId: ItemId;
  /** Top-left of the sprite, in room pixels. */
  x: number;
  y: number;
};

/** Bounds an item may be dragged within. Same shape for a future outdoor scene. */
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const ROOM_BOUNDS: Bounds = {
  minX: TILE,
  minY: TILE,
  maxX: ROOM.width - TILE,
  maxY: ROOM.height - TILE,
};

const snap = (value: number) => Math.round(value / TILE) * TILE;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** The floor rect an item occupies, in room pixels. */
export const collisionRect = (item: PlacedItem): Rect => {
  const { footprint } = ITEM_CATALOG[item.itemId];
  return {
    x: item.x + footprint.x,
    y: item.y + footprint.y,
    width: footprint.width,
    height: footprint.height,
  };
};

/** Bottom edge of the footprint - what the character is sorted against. */
export const baselineOf = (item: PlacedItem) => {
  const { footprint } = ITEM_CATALOG[item.itemId];
  return item.y + footprint.y + footprint.height;
};

/** Whether a room-pixel point is inside a placed item's sprite (for hit testing). */
export const hitTest = (item: PlacedItem, roomX: number, roomY: number) => {
  const { width, height } = ITEM_CATALOG[item.itemId];
  return (
    roomX >= item.x &&
    roomX <= item.x + width &&
    roomY >= item.y &&
    roomY <= item.y + height
  );
};

export const useWorldItems = () => {
  const [items, setItems] = useState<PlacedItem[]>([]);
  const nextId = useRef(1);

  /**
   * Collision rects, mirrored into a shared value so the character's movement
   * worklet can read them without crossing to the JS thread.
   */
  const obstacles = useSharedValue<Rect[]>([]);
  useEffect(() => {
    obstacles.value = items
      .filter((item) => ITEM_CATALOG[item.itemId].solid)
      .map(collisionRect);
  }, [items, obstacles]);

  const placeItem = useCallback((itemId: ItemId) => {
    const definition = ITEM_CATALOG[itemId];
    setItems((current) => {
      // Drop new items near the middle, nudged so a stack of them stays visible.
      const nudge = (current.length % 4) * TILE;
      const x = snap(
        clamp(
          (ROOM.width - definition.width) / 2 + nudge,
          ROOM_BOUNDS.minX,
          ROOM_BOUNDS.maxX - definition.width,
        ),
      );
      const y = snap(
        clamp(
          (ROOM.height - definition.height) / 2,
          ROOM_BOUNDS.minY,
          ROOM_BOUNDS.maxY - definition.height,
        ),
      );
      return [
        ...current,
        { instanceId: `item-${nextId.current++}`, itemId, x, y },
      ];
    });
  }, []);

  const moveItem = useCallback(
    (instanceId: string, x: number, y: number, snapToGrid = true) => {
      setItems((current) =>
        current.map((item) => {
          if (item.instanceId !== instanceId) {
            return item;
          }
          const definition = ITEM_CATALOG[item.itemId];
          const nextX = clamp(
            x,
            ROOM_BOUNDS.minX,
            ROOM_BOUNDS.maxX - definition.width,
          );
          const nextY = clamp(
            y,
            ROOM_BOUNDS.minY,
            ROOM_BOUNDS.maxY - definition.height,
          );
          return {
            ...item,
            x: snapToGrid ? snap(nextX) : nextX,
            y: snapToGrid ? snap(nextY) : nextY,
          };
        }),
      );
    },
    [],
  );

  const removeItem = useCallback((instanceId: string) => {
    setItems((current) =>
      current.filter((item) => item.instanceId !== instanceId),
    );
  }, []);

  const clearItems = useCallback(() => setItems([]), []);

  /** Save / load hooks - no storage wired up yet, but the shape is final. */
  const serialize = useCallback(
    () => JSON.stringify(items.map(({ itemId, x, y }) => ({ itemId, x, y }))),
    [items],
  );

  const restore = useCallback((json: string) => {
    const saved = JSON.parse(json) as { itemId: ItemId; x: number; y: number }[];
    setItems(
      saved.map((item) => ({
        instanceId: `item-${nextId.current++}`,
        ...item,
      })),
    );
  }, []);

  /** Topmost item under a point, for tapping and dragging. */
  const itemAt = useCallback(
    (roomX: number, roomY: number) => {
      for (let index = items.length - 1; index >= 0; index--) {
        if (hitTest(items[index], roomX, roomY)) {
          return items[index];
        }
      }
      return undefined;
    },
    [items],
  );

  return useMemo(
    () => ({
      items,
      obstacles,
      placeItem,
      moveItem,
      removeItem,
      clearItems,
      serialize,
      restore,
      itemAt,
    }),
    [
      items,
      obstacles,
      placeItem,
      moveItem,
      removeItem,
      clearItems,
      serialize,
      restore,
      itemAt,
    ],
  );
};
