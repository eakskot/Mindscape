import { useMemo } from "react";
import type { SharedValue } from "react-native-reanimated";

import type { Bounds, TileCollision } from "./bounds";
import type { Rect } from "./items/itemCatalog";
import type { Scene } from "./scene";
import { useCharacter } from "./useCharacter";

/** How far from its spawn an NPC will wander, in tiles each way - see WanderingNpc's old own comment (moved here). */
const WANDER_RADIUS_TILES = 5;

export type WanderingNpcCharacter = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  column: SharedValue<number>;
  row: SharedValue<number>;
  skin?: "npc" | "npc2" | "npc3";
  /** See HomeScreen.tsx's frame-callback "kick" fix for why this is exposed. */
  setFrameCallbackActive: (isActive: boolean) => void;
};

/**
 * Runs the movement engine for every one of a scene's ambient NPCs, living
 * in `SceneStage` - *outside* `<Canvas>` - the same place the player's own
 * `useCharacter` call already lives. Moved here from `WanderingNpc.tsx`
 * (2026-10-08): that component used to call `useCharacter` itself, which
 * meant its position/pause-timer/animation state lived *inside* the Canvas
 * subtree - fine on its own, but it meant a Canvas remount (see
 * HomeScreen.tsx's background-recovery fix) reset every NPC back to its
 * spawn point and froze it for a few seconds, reading as "the app just
 * launched." Lifting the state up here means a Canvas remount only rebuilds
 * the *drawing* of each NPC (a plain `<Character>`, same as the player),
 * never its position - exactly how the player was already architected.
 *
 * One hook call in `SceneStage` rather than each NPC owning its own
 * `useCharacter` import keeps SceneStage's hook list from growing per NPC -
 * the same reasoning `WanderingNpc.tsx` used to justify being its own
 * component. Calling `useCharacter`/`useMemo` inside the `.map()` below is
 * safe specifically because `npcs` is fixed for a scene's whole mounted
 * lifetime (`SceneStage` remounts on a scene switch, keyed by `sceneId` -
 * see HomeScreen.tsx) - this hook's own call count/order never changes
 * across `SceneStage`'s re-renders, which is all Rules of Hooks actually
 * requires.
 */
export function useWanderingNpcCharacters(
  npcs: Scene["wanderingNpcs"],
  obstacles: SharedValue<Rect[]>,
  walkable: Bounds,
  tileCollision: TileCollision | undefined,
  frozen: SharedValue<boolean>,
  tileSize: number,
): WanderingNpcCharacter[] {
  return (npcs ?? []).map((npc) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- see doc comment above
    const wanderArea = useMemo<Bounds>(() => {
      const radius = WANDER_RADIUS_TILES * tileSize;
      return {
        minX: Math.max(walkable.minX, npc.spawn.x - radius),
        maxX: Math.min(walkable.maxX, npc.spawn.x + radius),
        minY: Math.max(walkable.minY, npc.spawn.y - radius),
        maxY: Math.min(walkable.maxY, npc.spawn.y + radius),
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [npc.spawn.x, npc.spawn.y, tileSize, walkable]);

    // eslint-disable-next-line react-hooks/rules-of-hooks -- see doc comment above
    const { x, y, column, row, setFrameCallbackActive } = useCharacter(
      obstacles,
      walkable,
      npc.spawn,
      tileCollision,
      frozen,
      wanderArea,
    );

    return { x, y, column, row, skin: npc.skin, setFrameCallbackActive };
  });
}
