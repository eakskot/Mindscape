/**
 * Watches the character's position against the active scene's portals and
 * fires `onEnter` once per entry - not every frame while standing inside
 * one. Stays out of useCharacter.ts entirely: portals are a HomeScreen-level
 * concern layered on top of the character's position, not something the
 * generic movement engine needs to know about.
 */

import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import type { Bounds } from "./bounds";
import type { Portal } from "./scene";

const insideBounds = (x: number, y: number, bounds: Bounds) => {
  "worklet";
  return (
    x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY
  );
};

export const usePortalWatcher = (
  x: SharedValue<number>,
  y: SharedValue<number>,
  /** Only a player-directed walkTo enters a portal, not idle wandering. */
  controlled: SharedValue<boolean>,
  portals: Portal[],
  onEnter: (portal: Portal) => void,
) => {
  // Whether the reaction below has evaluated at least once yet. Owned here
  // explicitly rather than inferred from Reanimated's own "previousIndex is
  // null on the first call" behaviour - that's real, observed behaviour,
  // but not a documented contract this file should have to keep depending
  // on getting right.
  const hasSettled = useSharedValue(false);

  useAnimatedReaction(
    // Which portal (if any) the character is standing inside - position
    // only, independent of `controlled`. A scene's arrival spawn commonly
    // sits inside the *other* scene's own trigger (e.g. leaving the room
    // lands you right on the village's door porch), so folding `controlled`
    // into this selector was tried and reverted: the instant the player
    // took any action afterwards, `controlled` flipping true - not the
    // character moving - looked like a fresh change and fired onEnter
    // immediately, regardless of where the player had actually tapped.
    () => portals.findIndex((portal) => insideBounds(x.value, y.value, portal.trigger)),
    // Reanimated only calls this when the selector's result actually
    // changes, i.e. the character's position crossed a trigger's boundary -
    // so standing still (including right after a scene transition) never
    // fires this, no matter what `controlled` does in the meantime.
    // `controlled` is read here, gating the *reaction* rather than the
    // selector, so idle wandering into a trigger doesn't enter it, but a
    // deliberate walkTo crossing into one does.
    (index, previousIndex) => {
      if (!hasSettled.value) {
        // This call just establishes a baseline, even if the character
        // already happens to be standing inside a trigger right now (see
        // the scene-arrival note above) - never a real crossing, since
        // nothing has been observed to compare against yet.
        hasSettled.value = true;
        return;
      }
      if (index !== -1 && index !== previousIndex && controlled.value) {
        runOnJS(onEnter)(portals[index]);
      }
    },
  );
};
