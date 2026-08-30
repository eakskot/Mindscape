/**
 * The world's placed items: state, mutations and the collision data the
 * character reads on the UI thread.
 *
 * A placed item is `{ instanceId, itemId, x, y }` and nothing else, so the whole
 * room is JSON-serialisable - that is what `serialize` / `restore` are for when
 * we add saving. The same hook works for an outdoor scene - it only needs
 * `bounds` (where items may be placed) and `tileSize` (the scene's own grid
 * unit, for snap-to-grid placement). A scene's own terrain collision (e.g.
 * the village's imported tile grid) is a separate mechanism entirely - see
 * useCharacter.ts's `tileCollision` - since it is dense enough that a flat
 * grid lookup beats folding it into this hook's per-item `Rect[]`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSharedValue } from "react-native-reanimated";

import type { Bounds } from "../bounds";
import { clamp } from "../bounds";
import { ITEM_CATALOG, type ItemId, type Rect } from "./itemCatalog";

export type PlacedItem = {
  instanceId: string;
  itemId: ItemId;
  /** Top-left of the sprite, in room pixels. */
  x: number;
  y: number;
};

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

export const useWorldItems = (bounds: Bounds, tileSize: number) => {
  const [items, setItems] = useState<PlacedItem[]>([]);
  const nextId = useRef(1);
  const snap = useCallback(
    (value: number) => Math.round(value / tileSize) * tileSize,
    [tileSize],
  );

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

  const placeItem = useCallback(
    (itemId: ItemId) => {
      const definition = ITEM_CATALOG[itemId];
      setItems((current) => {
        // Drop new items near the middle, nudged so a stack of them stays visible.
        const nudge = (current.length % 4) * tileSize;
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        const x = snap(
          clamp(
            centerX - definition.width / 2 + nudge,
            bounds.minX,
            bounds.maxX - definition.width,
          ),
        );
        const y = snap(
          clamp(
            centerY - definition.height / 2,
            bounds.minY,
            bounds.maxY - definition.height,
          ),
        );
        return [
          ...current,
          { instanceId: `item-${nextId.current++}`, itemId, x, y },
        ];
      });
    },
    [bounds, tileSize, snap],
  );

  const moveItem = useCallback(
    (instanceId: string, x: number, y: number, snapToGrid = true) => {
      setItems((current) =>
        current.map((item) => {
          if (item.instanceId !== instanceId) {
            return item;
          }
          const definition = ITEM_CATALOG[item.itemId];
          const nextX = clamp(x, bounds.minX, bounds.maxX - definition.width);
          const nextY = clamp(y, bounds.minY, bounds.maxY - definition.height);
          return {
            ...item,
            x: snapToGrid ? snap(nextX) : nextX,
            y: snapToGrid ? snap(nextY) : nextY,
          };
        }),
      );
    },
    [bounds, snap],
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
