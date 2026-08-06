import {
  Atlas,
  Group,
  Image,
  useClock,
  useRSXformBuffer,
  useRectBuffer,
  type SkImage,
} from "@shopify/react-native-skia";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import { PIXEL_ART } from "../Room";
import {
  ITEM_CATALOG,
  type ItemDefinition,
  type LayerName,
} from "./itemCatalog";
import { baselineOf, type PlacedItem } from "./useWorldItems";
import type { ItemImages } from "./itemImages";

/**
 * Layering. The character is one moving entity, so instead of re-sorting the
 * scene in React every frame we render each `object` item in two passes and let
 * the UI thread switch which copy is visible:
 *
 *   room floor + walls
 *   floorDecal items          - always under the character
 *   object items (behind)     - baseline above the character's feet
 *   the character
 *   object items (front)      - baseline below the character's feet
 *   overhead items            - always over the character
 *
 * Only one copy of an item is ever visible, and no React render is needed when
 * the character walks past something.
 */
export type LayerPass = "behind" | "front" | "always";

const StaticSprite = ({
  definition,
  item,
  image,
}: {
  definition: ItemDefinition;
  item: PlacedItem;
  image: SkImage | null;
}) => (
  <Image
    image={image}
    x={item.x}
    y={item.y}
    width={definition.width}
    height={definition.height}
    sampling={PIXEL_ART}
  />
);

/** Items whose sprite is a horizontal strip of frames (fireplace, TV, fountain). */
const AnimatedSprite = ({
  definition,
  item,
  image,
}: {
  definition: ItemDefinition;
  item: PlacedItem;
  image: SkImage | null;
}) => {
  const { frames, fps } = definition.animation!;
  const clock = useClock();

  const sprites = useRectBuffer(1, (rect) => {
    "worklet";
    const frame = Math.floor((clock.value / 1000) * fps) % frames;
    rect.setXYWH(
      frame * definition.width,
      0,
      definition.width,
      definition.height,
    );
  });
  const transforms = useRSXformBuffer(1, (xform) => {
    "worklet";
    xform.set(1, 0, item.x, item.y);
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

const PlacedItemSprite = ({
  item,
  image,
  pass,
  characterY,
}: {
  item: PlacedItem;
  image: SkImage | null;
  pass: LayerPass;
  characterY: SharedValue<number>;
}) => {
  const definition = ITEM_CATALOG[item.itemId];
  const baseline = baselineOf(item);

  const opacity = useDerivedValue(() => {
    if (pass === "always") {
      return 1;
    }
    // The character stands in front of the item when its feet are below the
    // item's baseline.
    const characterInFront = characterY.value > baseline;
    return (pass === "behind") === characterInFront ? 1 : 0;
  });

  return (
    <Group opacity={opacity}>
      {definition.animation ? (
        <AnimatedSprite definition={definition} item={item} image={image} />
      ) : (
        <StaticSprite definition={definition} item={item} image={image} />
      )}
    </Group>
  );
};

type ItemLayerProps = {
  items: PlacedItem[];
  images: ItemImages;
  characterY: SharedValue<number>;
  /** Which catalog layer to draw. */
  layer: LayerName;
  pass: LayerPass;
};

export const ItemLayer = ({
  items,
  images,
  characterY,
  layer,
  pass,
}: ItemLayerProps) => (
  <>
    {items
      .filter((item) => ITEM_CATALOG[item.itemId].layer === layer)
      // Items further back are drawn first, so overlapping furniture stacks right.
      .sort((a, b) => baselineOf(a) - baselineOf(b))
      .map((item) => (
        <PlacedItemSprite
          key={`${pass}-${item.instanceId}`}
          item={item}
          image={images[item.itemId]}
          pass={pass}
          characterY={characterY}
        />
      ))}
  </>
);
