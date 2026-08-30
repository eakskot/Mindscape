import {
  Atlas,
  useImage,
  useRSXformBuffer,
  useRectBuffer,
} from "@shopify/react-native-skia";
import type { SharedValue } from "react-native-reanimated";

import { PIXEL_ART } from "./atlas";
import { FRAME_HEIGHT, FRAME_WIDTH } from "./characterSheet";
import { toScreenPoint } from "./entitySprite";

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
  /** Screen pixels per room pixel for the world (tiles, items). */
  worldScale: number;
  /**
   * Screen pixels per sprite pixel for the character - deliberately its own
   * number, independent of worldScale, so the character can read as bigger
   * than strict tile-proportion without the world having to zoom in to match.
   * Both must stay whole numbers - see roomLayout.ts's "Integer scale only".
   */
  entityScale: number;
  /** Device pixels per RN point - see entitySprite.ts's toScreenPoint. */
  density: number;
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
}: CharacterProps) => {
  const sheet = useImage(
    require("../assets/sprites/player/Premade_Character_03.png"),
  );

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
    const feet = toScreenPoint(x.value, y.value, camera.value, worldScale, density);
    // Anchored by the feet: the bottom centre of the frame sits on `feet`.
    xform.set(
      entityScale,
      0,
      feet.x - (FRAME_WIDTH * entityScale) / 2,
      feet.y - FRAME_HEIGHT * entityScale,
    );
  });

  return (
    <Atlas
      image={sheet}
      sprites={sprites}
      transforms={transforms}
      sampling={PIXEL_ART}
    />
  );
};
