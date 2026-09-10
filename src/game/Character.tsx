import {
  Atlas,
  useImage,
  useRSXformBuffer,
  useRectBuffer,
  type DataSourceParam,
} from "@shopify/react-native-skia";
import type { SharedValue } from "react-native-reanimated";

import { PIXEL_ART } from "./atlas";
import { FRAME_HEIGHT, FRAME_WIDTH } from "./characterSheet";
import { toScreenPoint } from "./entitySprite";

/**
 * The player's own skin. Every `Premade_Character_XX.png` in the pack shares
 * the exact sheet geometry in characterSheet.ts, so an NPC only needs to
 * pass a different one of these as `sheet` (see NPC_SHEET, HomeScreen.tsx).
 */
export const PLAYER_SHEET: DataSourceParam = require("../assets/sprites/player/Premade_Character_03.png");
/** A visibly different skin (grey hair, glasses) for the wandering NPC. */
export const NPC_SHEET: DataSourceParam = require("../assets/sprites/player/Premade_Character_20.png");

type CharacterProps = {
  /** Position of the character's feet, in room pixels. */
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** Which frame of the sheet to draw. */
  column: SharedValue<number>;
  row: SharedValue<number>;
  /**
   * Camera position, in screen pixels - the same value the world's own
   * Group transform uses, so the character tracks the camera exactly.
   */
  camera: SharedValue<{ x: number; y: number }>;
  /**
   * Screen pixels per room pixel for the world (tiles, items). A shared
   * value, not a number, because a pinch drives it continuously between
   * whole numbers (see HomeScreen.tsx) - the character has to scale in step
   * with the tiles on every frame of that, not one React render behind.
   */
  worldScale: SharedValue<number>;
  /**
   * Screen pixels per sprite pixel for the character - `worldScale` x a
   * fixed factor, so the character stays in strict proportion with the tiles
   * at every zoom level. Whole at rest (see roomLayout.ts's "integer scale
   * only"); briefly fractional mid-pinch, like worldScale.
   */
  entityScale: SharedValue<number>;
  /** Device pixels per RN point - see entitySprite.ts's toScreenPoint. */
  density: number;
  /**
   * Which character sheet to cut frames from. Defaults to the player's skin;
   * an NPC passes NPC_SHEET. All premade sheets share characterSheet.ts's
   * geometry, so nothing else changes.
   */
  sheet?: DataSourceParam;
};

/**
 * Draws a single 16x32 frame out of the character sheet.
 *
 * Skia has no "source rect" on <Image>, so we use Atlas with one sprite: the
 * rect picks the frame, the RSXform places it. Both are Reanimated buffers, so
 * the sprite is re-cut on the UI thread whenever the animation advances.
 *
 * Draws *outside* the world's scaled Group (see HomeScreen.tsx) so it can
 * carry its own scale - the RSXform below does the camera placement itself
 * (via entitySprite.ts's toScreenPoint, shared with placed items) instead of
 * inheriting an ambient transform.
 */
export const Character = ({
  x,
  y,
  column,
  row,
  camera,
  worldScale,
  entityScale,
  density,
  sheet = PLAYER_SHEET,
}: CharacterProps) => {
  const image = useImage(sheet);

  const sprites = useRectBuffer(1, (rect) => {
    "worklet";
    rect.setXYWH(
      column.value * FRAME_WIDTH,
      row.value * FRAME_HEIGHT,
      FRAME_WIDTH,
      FRAME_HEIGHT,
    );
  });

  const transforms = useRSXformBuffer(1, (xform) => {
    "worklet";
    const feet = toScreenPoint(x.value, y.value, camera.value, worldScale.value, density);
    const s = entityScale.value;
    // Anchored by the feet: the bottom centre of the frame sits on `feet`.
    xform.set(s, 0, feet.x - (FRAME_WIDTH * s) / 2, feet.y - FRAME_HEIGHT * s);
  });

  return (
    <Atlas
      image={image}
      sprites={sprites}
      transforms={transforms}
      sampling={PIXEL_ART}
    />
  );
};
