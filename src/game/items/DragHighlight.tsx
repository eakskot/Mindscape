import { Group, Oval, RoundedRect, useClock } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

import { toScreenPoint } from "../entitySprite";
import { ITEM_CATALOG } from "./itemCatalog";
import type { EntityProps } from "./ItemLayer";
import type { PlacedItem } from "./useWorldItems";

/**
 * The "you're holding this" feedback for move mode: a soft drop-shadow
 * under the item (it visually lifts off the ground while dragged) and a
 * pulsing rounded outline around its sprite - yellow on valid ground, red
 * where the drop would be rejected (see useWorldItems.ts's
 * `isValidPlacement`). Habbo-style furniture-arranging feedback, in effect.
 *
 * A separate overlay on top of the normal item render, not a replacement
 * for it - the actual sprite still draws through ItemLayer at its current
 * (live, unsnapped) position exactly as it did before move mode existed.
 * This only adds the glow, so it is drawn last in HomeScreen's Canvas,
 * safely above every layer/item/character paint order questions below it.
 */
export const DragHighlight = ({
  item,
  valid,
  camera,
  worldScale,
  entityScale,
  density,
}: {
  item: PlacedItem | null;
  valid: boolean;
} & EntityProps) => {
  // A local clock only this glow's pulse reads - no tile animation shares
  // it, so it doesn't need to be the scene's single synced clock (see
  // SceneLayers.tsx's own comment on why *that* one is shared).
  const clock = useClock();
  const pulse = useDerivedValue(() => 0.55 + 0.35 * Math.sin(clock.value / 220));

  const definition = item ? ITEM_CATALOG[item.itemId] : null;

  const transform = useDerivedValue(() => {
    if (!item) {
      return [{ translateX: 0 }, { translateY: 0 }, { scale: entityScale.value }];
    }
    const point = toScreenPoint(item.x, item.y, camera.value, worldScale.value, density);
    return [
      { translateX: point.x },
      { translateY: point.y },
      { scale: entityScale.value },
    ];
  });

  if (!item || !definition) {
    return null;
  }

  const color = valid ? "#f6cf3f" : "#e8503f";
  const { footprint } = definition;
  const shadowPad = 2;

  return (
    <Group transform={transform}>
      {/* Drop shadow at the footprint's baseline - the item "lifts" off it. */}
      <Oval
        x={footprint.x - shadowPad}
        y={footprint.y + footprint.height - footprint.height * 0.35}
        width={footprint.width + shadowPad * 2}
        height={footprint.height * 0.7}
        color="black"
        opacity={0.28}
      />
      <Group opacity={pulse}>
        <RoundedRect
          x={-2}
          y={-2}
          width={definition.width + 4}
          height={definition.height + 4}
          r={3}
          style="stroke"
          strokeWidth={2}
          color={color}
        />
      </Group>
    </Group>
  );
};
