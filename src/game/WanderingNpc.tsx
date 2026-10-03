import { memo, useMemo } from "react";
import type { SharedValue } from "react-native-reanimated";
import type { DataSourceParam } from "@shopify/react-native-skia";

import type { Bounds, TileCollision } from "./bounds";
import { Character, NPC_SHEET } from "./Character";
import type { Rect } from "./items/itemCatalog";
import { useCharacter } from "./useCharacter";

/** How far from its spawn the NPC will wander, in tiles each way. */
const WANDER_RADIUS_TILES = 5;

type WanderingNpcProps = {
  /** Where the NPC spawns and centres its roaming, in room pixels. */
  spawn: { x: number; y: number };
  /** Item collision rects, shared with the player (see useCharacter). */
  obstacles: SharedValue<Rect[]>;
  /** The scene's full walkable box - the clamp of last resort. */
  walkable: Bounds;
  /** Imported map terrain collision, if the scene has any. */
  tileCollision?: TileCollision;
  /** Held still while the player is arranging furniture. */
  frozen: SharedValue<boolean>;
  /** Room pixels per tile - sizes the wander radius. */
  tileSize: number;
  /** The camera/scale/density quartet every on-canvas entity needs. */
  camera: SharedValue<{ x: number; y: number }>;
  worldScale: SharedValue<number>;
  entityScale: SharedValue<number>;
  density: number;
  /** Which premade sheet draws this NPC. Defaults to NPC_SHEET (grey hair, glasses). */
  sheet?: DataSourceParam;
};

/**
 * An ambient character that only ever wanders on its own. Runs the exact
 * same movement engine as the player, but nothing calls its `walkTo` and no
 * portal watcher reads it - so a tap on the ground only ever moves the
 * player, and this one drifting into a door does nothing. Different skin
 * from the player, and from any other WanderingNpc drawn alongside it - the
 * `sheet` prop picks which premade character sheet (see NPC_SHEET/
 * NPC_SHEET_2/NPC_SHEET_3 in Character.tsx and Scene.wanderingNpcs' `skin`).
 * It respects the scene's terrain and item collision; it and the player pass
 * through each other (neither is in the other's obstacle list) - cheaper
 * than feeding each other's live position in as an obstacle, and overlapping
 * cozy-game characters read fine. Two WanderingNpcs pass through each other
 * for the same reason.
 *
 * A whole component rather than a bare `useCharacter` call in HomeScreen so
 * that (a) all of its hooks - including a `useFrameCallback` - stay out of
 * SceneStage's already long hook list, and (b) a scene without any
 * `wanderingNpcs` (the room) simply doesn't mount one and pays nothing.
 *
 * Penned to a small patch around `spawn` (`wanderArea`), not the whole
 * scene: an NPC that picked targets across the entire village spent its time
 * grinding along a far-off shoreline the camera never shows - it read as a
 * glitch. Kept near its spawn it also stays near the player, which is what
 * keeps its shared-paint-slot occlusion (see HomeScreen.tsx) looking right.
 *
 * Wrapped in `memo` for the same reason Character.tsx is: every prop here
 * (spawn/walkable/tileSize come straight from the stable `scene` singleton;
 * obstacles/frozen/camera/worldScale/entityScale are SharedValues; sheet is
 * one of the fixed NPC_SHEET* constants) is reference-stable across a
 * SceneStage re-render, so without `memo` every one of these - all three of
 * them today - tears down and rebuilds its own `<Character>`'s Reanimated
 * mapper on every unrelated re-render (most of all `moveItem` firing per
 * frame of an item drag), fighting its own idle-wander animation. See
 * Character.tsx's own comment and CLAUDE.md.
 */
export const WanderingNpc = memo(function WanderingNpc({
  spawn,
  obstacles,
  walkable,
  tileCollision,
  frozen,
  tileSize,
  camera,
  worldScale,
  entityScale,
  density,
  sheet = NPC_SHEET,
}: WanderingNpcProps) {
  const wanderArea = useMemo<Bounds>(() => {
    const radius = WANDER_RADIUS_TILES * tileSize;
    return {
      minX: Math.max(walkable.minX, spawn.x - radius),
      maxX: Math.min(walkable.maxX, spawn.x + radius),
      minY: Math.max(walkable.minY, spawn.y - radius),
      maxY: Math.min(walkable.maxY, spawn.y + radius),
    };
  }, [spawn.x, spawn.y, tileSize, walkable]);

  const { x, y, column, row } = useCharacter(
    obstacles,
    walkable,
    spawn,
    tileCollision,
    frozen,
    wanderArea,
  );

  return (
    <Character
      x={x}
      y={y}
      column={column}
      row={row}
      sheet={sheet}
      camera={camera}
      worldScale={worldScale}
      entityScale={entityScale}
      density={density}
    />
  );
});
