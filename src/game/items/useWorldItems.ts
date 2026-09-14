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

import type { Bounds, TileCollision } from "../bounds";
import { clamp } from "../bounds";
import { ITEM_CATALOG, type ItemDefinition, type ItemId, type Rect } from "./itemCatalog";

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

/**
 * Whether a room-pixel point is inside a placed item's *rendered* sprite -
 * for hit testing (tapping/dragging in move or delete mode).
 *
 * `entityScaleMultiplier` must be `useCamera.ts`'s `ENTITY_SCALE_MULTIPLIER`
 * - items draw at their own `entityScale`, which is `worldScale *
 * entityScaleMultiplier`, deliberately bigger on screen than strict tile
 * proportion (see entitySprite.ts). Room-pixel positions like `item.x` and
 * `definition.width` are worldScale-space, not entityScale-space, so a
 * sprite's on-screen box - converted back into that same worldScale room-
 * pixel space, the way useCamera's `toRoomPoint` converts a touch -
 * spans `item.x` to `item.x + width*entityScaleMultiplier`, not
 * `item.x + width`. Comparing against the unmultiplied width (as this once
 * did) only accepted a tap in the box's top-left quadrant - the exact
 * region a real tap in the visual centre of an item almost never lands in.
 * That was the actual cause of "the hitbox is too small, I can never grab
 * it on the first try": every grab attempt aimed at what looked like the
 * middle of the item was landing outside the box the code actually
 * checked, even though DragHighlight's own glow was already drawing the
 * correct (larger) box the whole time.
 */
export const hitTest = (
  item: PlacedItem,
  roomX: number,
  roomY: number,
  entityScaleMultiplier: number,
) => {
  const { width, height } = ITEM_CATALOG[item.itemId];
  return (
    roomX >= item.x &&
    roomX <= item.x + width * entityScaleMultiplier &&
    roomY >= item.y &&
    roomY <= item.y + height * entityScaleMultiplier
  );
};

/**
 * The single point a placement check is judged by: the footprint's
 * bottom-centre, i.e. where the item visually "stands" - the same spirit as
 * `baselineOf`. A big item (say a 4-tile-wide fountain) is judged by this
 * one point, not by every tile its sprite covers, so it can straddle a
 * decorative edge without being rejected for it.
 */
const footprintAnchor = (x: number, y: number, definition: ItemDefinition) => ({
  anchorX: x + definition.footprint.x + definition.footprint.width / 2,
  anchorY: y + definition.footprint.y + definition.footprint.height,
});

/** Whether `mask` marks the tile under `anchorX,anchorY` as valid ground. */
const cellIsValid = (
  mask: TileCollision,
  anchorX: number,
  anchorY: number,
) => {
  const col = Math.floor(anchorX / mask.tileSize);
  const row = Math.floor(anchorY / mask.tileSize);
  if (col < 0 || row < 0 || col >= mask.columns || row >= mask.rows) {
    return false;
  }
  return mask.grid.value[row * mask.columns + col] === 1;
};

/** Whether an item of `definition` at `x,y` would overlap `other`'s sprite. */
const overlapsItem = (
  x: number,
  y: number,
  definition: ItemDefinition,
  other: PlacedItem,
) => {
  const otherDefinition = ITEM_CATALOG[other.itemId];
  return (
    x < other.x + otherDefinition.width &&
    x + definition.width > other.x &&
    y < other.y + otherDefinition.height &&
    y + definition.height > other.y
  );
};

export const useWorldItems = (
  bounds: Bounds,
  tileSize: number,
  /**
   * Which tiles an item may stand on - e.g. the village restricts placement
   * to grass/beach/paths/water's edge/small-extras, not fences or house
   * walls. Omitted (the room) means anywhere in `bounds` is valid, same as
   * before this existed.
   */
  placementMask?: TileCollision,
) => {
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

  /**
   * Whether an item's footprint would land on valid ground if placed at
   * `x,y` - always true where the scene has no `placementMask` (the room).
   * Exposed so HomeScreen.tsx can both preview it live while dragging (the
   * yellow/red highlight) and decide, on release, whether to commit the
   * drop or bounce the item back to where the drag started.
   *
   * Snaps `x,y` first, the same way moveItem's actual commit does (its
   * default `snapToGrid=true`) - checking the raw, unsnapped drag position
   * instead let the two disagree: a spot that reads as valid mid-drag could
   * still round to an invalid tile on release, or vice versa. That gap
   * scales with how far an item's footprint anchor sits from its top-left
   * corner, so it barely showed on small 16-32px furniture but bounced
   * large items (a 48-96px fountain) back on nearly every drop - exactly
   * the "the old items move fine, the new ones don't" split.
   */
  const isValidPlacement = useCallback(
    (x: number, y: number, itemId: ItemId) => {
      if (!placementMask) {
        return true;
      }
      const definition = ITEM_CATALOG[itemId];
      const snappedX = snap(clamp(x, bounds.minX, bounds.maxX - definition.width));
      const snappedY = snap(clamp(y, bounds.minY, bounds.maxY - definition.height));
      const { anchorX, anchorY } = footprintAnchor(snappedX, snappedY, definition);
      return cellIsValid(placementMask, anchorX, anchorY);
    },
    [placementMask, bounds, snap],
  );

  /**
   * Whether an item at `x,y` would overlap any *other* placed item's
   * sprite - `excludeInstanceId` is the item being dragged itself (it's
   * still in `items` at its live, continuously-updated drag position, so
   * without excluding it every drag would "overlap itself" and read as
   * invalid everywhere). Same snap-before-check reasoning as
   * `isValidPlacement`: HomeScreen.tsx combines the two for both the live
   * yellow/red drag highlight and the release commit/bounce-back decision,
   * so both must judge the exact position that would actually be
   * committed, not the raw finger position.
   *
   * `placeItem`'s own placement search (`findFreeSpot` below) does its own
   * overlap check against a fresher item list instead of this one - see
   * that function's comment for why a plain drag doesn't need the same
   * care.
   */
  const overlapsOtherItem = useCallback(
    (x: number, y: number, itemId: ItemId, excludeInstanceId?: string) => {
      const definition = ITEM_CATALOG[itemId];
      const snappedX = snap(clamp(x, bounds.minX, bounds.maxX - definition.width));
      const snappedY = snap(clamp(y, bounds.minY, bounds.maxY - definition.height));
      return items.some(
        (other) =>
          other.instanceId !== excludeInstanceId &&
          overlapsItem(snappedX, snappedY, definition, other),
      );
    },
    [items, bounds, snap],
  );

  /**
   * Nudges a desired drop point out to the nearest free, valid tile if the
   * point itself isn't one - either because it fails `isValidPlacement`
   * (village-only) or because it would overlap an already-placed item's
   * sprite - searching outward ring by ring (cheap: a few hundred grid
   * lookups at most, and only run once per placement, never per frame).
   * Gives up and returns the original point after a generous radius - the
   * map's centre should already be valid ground in practice, this is a
   * defensive fallback, not the common case.
   *
   * The overlap check is what actually keeps placed items apart - a fixed
   * "nudge by N tiles per placement" (what this did before) doesn't know
   * how big any given item is, so two items of different sizes can nudge
   * to the exact same spot by coincidence (a 16px-wide item nudged one
   * step can land exactly where a 48px-wide item nudged two steps did).
   * Stacked items are hard to tell apart and hard to grab individually -
   * tapping the visible one can hit-test whichever is on top by baseline
   * instead, which reads as "the item I'm looking at won't move".
   */
  const findFreeSpot = useCallback(
    (
      startX: number,
      startY: number,
      definition: ItemDefinition,
      existingItems: PlacedItem[],
    ) => {
      const fits = (x: number, y: number) => {
        if (placementMask && !isValidPlacement(x, y, definition.id)) {
          return false;
        }
        return !existingItems.some((other) => overlapsItem(x, y, definition, other));
      };
      if (fits(startX, startY)) {
        return { x: startX, y: startY };
      }
      const maxRing = 10;
      for (let ring = 1; ring <= maxRing; ring++) {
        for (let dx = -ring; dx <= ring; dx++) {
          for (let dy = -ring; dy <= ring; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) {
              continue; // already tried on a smaller ring
            }
            const x = clamp(
              snap(startX + dx * tileSize),
              bounds.minX,
              bounds.maxX - definition.width,
            );
            const y = clamp(
              snap(startY + dy * tileSize),
              bounds.minY,
              bounds.maxY - definition.height,
            );
            if (fits(x, y)) {
              return { x, y };
            }
          }
        }
      }
      return { x: startX, y: startY };
    },
    [placementMask, isValidPlacement, bounds, tileSize, snap],
  );

  const placeItem = useCallback(
    (
      itemId: ItemId,
      /**
       * Where to drop it, in room pixels - HomeScreen.tsx passes the
       * current centre of the screen, so a new item lands where the player
       * is actually looking rather than always the same fixed map spot
       * (which, on the village, is right next to the house regardless of
       * where you'd wandered off to). Falls back to the scene bounds'
       * centre for callers that don't have a viewport to ask (there are
       * none today, but the room's "camera" is always centred on the room
       * anyway, so the two coincide there regardless).
       */
      desiredCenter?: { x: number; y: number },
    ) => {
      const definition = ITEM_CATALOG[itemId];
      setItems((current) => {
        const centerX = desiredCenter?.x ?? (bounds.minX + bounds.maxX) / 2;
        const centerY = desiredCenter?.y ?? (bounds.minY + bounds.maxY) / 2;
        const desiredX = snap(
          clamp(
            centerX - definition.width / 2,
            bounds.minX,
            bounds.maxX - definition.width,
          ),
        );
        const desiredY = snap(
          clamp(
            centerY - definition.height / 2,
            bounds.minY,
            bounds.maxY - definition.height,
          ),
        );
        const { x, y } = findFreeSpot(desiredX, desiredY, definition, current);
        return [
          ...current,
          { instanceId: `item-${nextId.current++}`, itemId, x, y },
        ];
      });
    },
    [bounds, tileSize, snap, findFreeSpot],
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

  /**
   * Topmost item under a point, for tapping and dragging. "Topmost" means
   * highest baseline, not most-recently-placed - the same rule ItemLayer's
   * paint order uses (see baselineOf), so you always grab whatever you can
   * actually see on top. Picking by insertion order instead (as this once
   * did) could hit-test an older item hidden underneath a newer, taller one
   * - invisibly grabbing the wrong thing, which read as "this item won't
   * move" for exactly the tall new items (fountains, the plant stand) that
   * are big enough to overlap their neighbours.
   */
  const itemAt = useCallback(
    (
      roomX: number,
      roomY: number,
      /**
       * See hitTest's own comment - `useCamera.ts`'s ENTITY_SCALE_MULTIPLIER,
       * the constant items render at.
       */
      entityScaleMultiplier: number,
    ) => {
      let best: PlacedItem | undefined;
      let bestBaseline = -Infinity;
      for (const item of items) {
        if (!hitTest(item, roomX, roomY, entityScaleMultiplier)) {
          continue;
        }
        const baseline = baselineOf(item);
        if (baseline >= bestBaseline) {
          best = item;
          bestBaseline = baseline;
        }
      }
      return best;
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
      isValidPlacement,
      overlapsOtherItem,
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
      isValidPlacement,
      overlapsOtherItem,
    ],
  );
};
