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

import { PIXEL_ART } from "../atlas";
import { toScreenPoint } from "../entitySprite";
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
 *
 * Items draw at their own `entityScale` - the same one the character uses
 * (see entitySprite.ts) - not the world's `worldScale`, so furniture reads as
 * consistent with the character regardless of how zoomed out the camera is.
 */
export type LayerPass = "behind" | "front" | "always";

/** Shared with DragHighlight.tsx, which places its glow the same way. */
export type EntityProps = {
  camera: SharedValue<{ x: number; y: number }>;
  worldScale: number;
  entityScale: number;
  /** Device pixels per RN point - see entitySprite.ts's toScreenPoint. */
  density: number;
};

const StaticSprite = ({
  definition,
  item,
  image,
  camera,
  worldScale,
  entityScale,
  density,
}: {
  definition: ItemDefinition;
  item: PlacedItem;
  image: SkImage | null;
} & EntityProps) => {
  const transform = useDerivedValue(() => {
    const point = toScreenPoint(item.x, item.y, camera.value, worldScale, density);
    return [
      { translateX: point.x },
      { translateY: point.y },
      { scale: entityScale },
    ];
  });

  return (
    <Group transform={transform}>
      <Image
        image={image}
        x={0}
        y={0}
        width={definition.width}
        height={definition.height}
        sampling={PIXEL_ART}
      />
    </Group>
  );
};

/** Items whose sprite is a horizontal strip of frames (fireplace, TV, fountain). */
const AnimatedSprite = ({
  definition,
  item,
  image,
  camera,
  worldScale,
  entityScale,
  density,
}: {
  definition: ItemDefinition;
  item: PlacedItem;
  image: SkImage | null;
} & EntityProps) => {
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
    const point = toScreenPoint(item.x, item.y, camera.value, worldScale, density);
    xform.set(entityScale, 0, point.x, point.y);
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

/**
 * Picks the animated-strip or static-image sprite for one item, with no
 * opacity wrapper of its own. Exported so DepthSortedLayer.tsx's merged
 * scenery+item depth pass can draw a placed item through the exact same
 * path this file's own `object`-layer pass does, instead of duplicating the
 * animated/static switch - see PlacedItemSprite below for the version with
 * the behind/front opacity trick this file's own layers still use.
 */
export const ItemVisual = ({
  item,
  image,
  ...entityProps
}: {
  item: PlacedItem;
  image: SkImage | null;
} & EntityProps) => {
  const definition = ITEM_CATALOG[item.itemId];
  return definition.animation ? (
    <AnimatedSprite definition={definition} item={item} image={image} {...entityProps} />
  ) : (
    <StaticSprite definition={definition} item={item} image={image} {...entityProps} />
  );
};

const PlacedItemSprite = ({
  item,
  image,
  pass,
  characterY,
  ...entityProps
}: {
  item: PlacedItem;
  image: SkImage | null;
  pass: LayerPass;
  characterY: SharedValue<number>;
} & EntityProps) => {
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
      <ItemVisual item={item} image={image} {...entityProps} />
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
} & EntityProps;

export const ItemLayer = ({
  items,
  images,
  characterY,
  layer,
  pass,
  ...entityProps
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
          {...entityProps}
        />
      ))}
  </>
);
