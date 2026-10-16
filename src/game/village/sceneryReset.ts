import { setJSON, StorageKeys } from "../engine/storage";
import { restoreAllVillageScenery } from "./villageLayout";

/**
 * Developer tool (Settings -> Developer): brings back every piece of
 * scenery the player has paid to remove, as if on a fresh install. Coins
 * spent are not refunded.
 *
 * The removed set itself is React state in HomeScreen (above SceneStage),
 * which lives on another screen than Settings - so it subscribes here, and
 * this plain-module listener list is the whole bridge (no state library).
 */
const listeners = new Set<() => void>();

export const onSceneryReset = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const resetRemovedScenery = () => {
  restoreAllVillageScenery();
  setJSON(StorageKeys.removedScenery, []);
  listeners.forEach((listener) => listener());
};
