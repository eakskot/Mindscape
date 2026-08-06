import {
  Atlas,
  useImage,
  useRSXformBuffer,
  useRectBuffer,
} from "@shopify/react-native-skia";
import type { SharedValue } from "react-native-reanimated";

import { FRAME_HEIGHT, FRAME_WIDTH } from "./characterSheet";
import { PIXEL_ART } from "./Room";

type CharacterProps = {
  /** Position of the character's feet, in room pixels. */
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** Which frame of the sheet to draw. */
  column: SharedValue<number>;
  row: SharedValue<number>;
};

/**
 * Draws a single 16x32 frame out of the character sheet.
 *
 * Skia has no "source rect" on <Image>, so we use Atlas with one sprite: the
 * rect picks the frame, the RSXform places it. Both are Reanimated buffers, so
 * the sprite is re-cut on the UI thread whenever the animation advances.
 */
export const Character = ({ x, y, column, row }: CharacterProps) => {
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
    // Anchored by the feet: the bottom centre of the frame sits on (x, y).
    xform.set(1, 0, x.value - FRAME_WIDTH / 2, y.value - FRAME_HEIGHT);
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
