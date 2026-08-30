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
      // `previousIndex` is `null` on this reaction's very first evaluation
      // after mount, which trivially differs from any real `index` - so a
      // scene arriving with the character already standing inside a
      // trigger, with `controlled` turning true before that first
      // evaluation runs (a human can't tap fast enough to hit this, but a
      // scripted walkTo can fire close enough to a fresh mount to race it),
      // must not read as a crossing. Excluding `previousIndex === null`
      // means only a *second-or-later* evaluation - i.e. an actual measured
      // change in position - can ever fire onEnter.
      if (
        index !== -1 &&
        index !== previousIndex &&
        previousIndex !== null &&
        controlled.value
      ) {
        runOnJS(onEnter)(portals[index]);
      }
    },
  );
};
