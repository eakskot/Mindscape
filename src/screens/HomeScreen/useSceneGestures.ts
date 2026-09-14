import { useMemo, useRef, useState } from "react";
import { PanResponder } from "react-native";

import type { EditMode } from "../../game/items/editMode";
import type { ItemId } from "../../game/items/itemCatalog";
import type { useWorldItems } from "../../game/items/useWorldItems";
import type { SceneryGroup } from "../../game/scene";
import { ENTITY_SCALE_MULTIPLIER, type useCamera } from "../../game/useCamera";
import { clamp } from "../../game/bounds";

/**
 * A touch has to travel this many RN points before a background touch counts
 * as a camera drag rather than a tap-to-walk - short enough that panning
 * feels immediate, long enough that an unsteady tapping finger isn't eaten.
 */
const TAP_DRAG_THRESHOLD = 8;

type Args = {
  camera: ReturnType<typeof useCamera>;
  world: ReturnType<typeof useWorldItems>;
  walkTo: (roomX: number, roomY: number) => void;
  editMode: EditMode;
  /** Currently-visible removable scenery (already filtered for removed ids). */
  sceneryGroups: SceneryGroup[];
  selectedSceneryId: string | null;
  onSelectScenery: (id: string | null) => void;
};

/**
 * The one PanResponder for the world view. It never re-creates itself (so a
 * gesture in flight is never dropped), reading current state through refs and
 * `camera`'s live shared values. It multiplexes four gestures:
 *
 * - **two fingers** -> pinch-zoom (pre-empts everything else)
 * - **one finger on a placed item, in move/delete mode** -> drag / delete it
 * - **one finger on the background, moved past a threshold** -> pan the camera
 * - **one finger on the background, released without moving** -> walk there
 *
 * Outside move/delete mode items are inert - every touch is a plain
 * walk/pan, so a touch near a big fountain isn't eaten as an accidental grab.
 *
 * Returns the pan handlers plus the "which item is held, and would its drop
 * be legal" state DragHighlight needs.
 */
export const useSceneGestures = ({
  camera,
  world,
  walkTo,
  editMode,
  sceneryGroups,
  selectedSceneryId,
  onSelectScenery,
}: Args) => {
  const {
    toRoomPoint,
    snapshot,
    panBy,
    worldScale,
    minWorldScale,
    maxWorldScale,
    zoomAbout,
    settleZoom,
  } = camera;

  const [draggedInstanceId, setDraggedInstanceId] = useState<string | null>(null);
  const [dragValid, setDragValid] = useState(true);

  // Fresh reads for the built-once responder.
  const worldRef = useRef(world);
  worldRef.current = world;
  const editModeRef = useRef(editMode);
  editModeRef.current = editMode;
  const walkToRef = useRef(walkTo);
  walkToRef.current = walkTo;
  const sceneryGroupsRef = useRef(sceneryGroups);
  sceneryGroupsRef.current = sceneryGroups;
  const selectedSceneryIdRef = useRef(selectedSceneryId);
  selectedSceneryIdRef.current = selectedSceneryId;
  const onSelectSceneryRef = useRef(onSelectScenery);
  onSelectSceneryRef.current = onSelectScenery;

  const drag = useRef<{
    instanceId: string;
    itemId: ItemId;
    grabX: number;
    grabY: number;
    lastX: number;
    lastY: number;
    // Where the item stood before this drag, to bounce back to on an invalid
    // drop - always itself a valid, already-snapped position.
    startX: number;
    startY: number;
  } | null>(null);
  // A background touch starts as a pan *candidate* - it only becomes a real
  // drag past TAP_DRAG_THRESHOLD, so a plain tap still falls through to walkTo.
  const pan = useRef<{
    startX: number;
    startY: number;
    startCameraX: number;
    startCameraY: number;
    moved: boolean;
  } | null>(null);
  // Live pinch: the finger spread and world scale it began at, so every move
  // re-derives an absolute target scale from the ratio (no drift).
  const pinch = useRef<{ startDist: number; startScale: number } | null>(null);
  // Set the moment a gesture becomes a pinch, so its release isn't a tap too.
  const gestureWasPinch = useRef(false);

  /** Which removable scenery group (if any) a room point lands inside. */
  const sceneryGroupAt = (roomX: number, roomY: number) =>
    sceneryGroupsRef.current.find(
      (group) =>
        roomX >= group.bounds.minX &&
        roomX <= group.bounds.maxX &&
        roomY >= group.bounds.minY &&
        roomY <= group.bounds.maxY,
    );

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

          const item =
            editModeRef.current !== "none"
              ? worldRef.current.itemAt(roomX, roomY, ENTITY_SCALE_MULTIPLIER)
              : undefined;
          if (!item) {
            drag.current = null;
            const cam = snapshot();
            pan.current = {
              startX: locationX,
              startY: locationY,
              startCameraX: cam.x,
              startCameraY: cam.y,
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
            // Keep the grab point under the finger, not the item's corner.
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
          // Two fingers = pinch, which pre-empts panning and tap-to-walk. (An
          // item drag in flight wins - two fingers mid-drag isn't a gesture.)
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
            // while the hand is on it), centred on the current midpoint. It
            // settles onto a whole scale on release.
            const next = clamp(
              (pinch.current.startScale * dist) / pinch.current.startDist,
              minWorldScale,
              maxWorldScale,
            );
            zoomAbout(next, focalX, focalY);
            return;
          }
          if (pinch.current) {
            // Dropped back below two fingers - settle now (same as release).
            settleZoom();
            pinch.current = null;
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
            // actually snap to, so the glow never lies about a drop now. Both
            // the ground check and "would this land on another item" have to
            // pass - overlapping items steal each other's touch priority.
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
            return; // still within the tap threshold
          }
          panDrag.moved = true;
          panBy(panDrag.startCameraX, panDrag.startCameraY, dx, dy);
        },

        onPanResponderRelease: (event) => {
          // A pinch this gesture: the lift ends a zoom, not a tap.
          if (gestureWasPinch.current) {
            gestureWasPinch.current = false;
            if (pinch.current) {
              settleZoom();
              pinch.current = null;
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
            worldRef.current.moveItem(
              itemDrag.instanceId,
              valid ? itemDrag.lastX : itemDrag.startX,
              valid ? itemDrag.lastY : itemDrag.startY,
            );
            drag.current = null;
            setDraggedInstanceId(null);
            return;
          }

          const panDrag = pan.current;
          pan.current = null;
          if (panDrag?.moved) {
            return; // a real drag panned the camera - not a tap
          }

          // Inside move/delete mode the screen is for arranging furniture -
          // a background tap does nothing (no accidental walk).
          if (editModeRef.current !== "none") {
            return;
          }

          const { locationX, locationY } = event.nativeEvent;
          const { roomX, roomY } = toRoomPoint(locationX, locationY);

          // A tap on a removable tree selects it instead of walking there -
          // tapping the same one again (or empty ground - see below) clears
          // the selection. Mutually exclusive with tap-to-walk by design:
          // a tap either aims the character or picks something to remove,
          // never both, so there's no ambiguity about what a tap near a
          // tree's edge did.
          const hit = sceneryGroupAt(roomX, roomY);
          if (hit) {
            onSelectSceneryRef.current(
              hit.id === selectedSceneryIdRef.current ? null : hit.id,
            );
            return;
          }
          if (selectedSceneryIdRef.current) {
            onSelectSceneryRef.current(null);
            return;
          }

          walkToRef.current(roomX, roomY);
          // Deliberately not touching the camera here - see useCamera's
          // `following` note. A tap only ever aims the character.
        },
      }),
    // Every dependency is a stable ref/shared value, or (the two scale
    // bounds) a primitive that's constant for the life of the mount.
    [
      toRoomPoint,
      snapshot,
      panBy,
      worldScale,
      minWorldScale,
      maxWorldScale,
      zoomAbout,
      settleZoom,
    ],
  );

  return {
    panHandlers: responder.panHandlers,
    draggedInstanceId,
    dragValid,
  };
};
