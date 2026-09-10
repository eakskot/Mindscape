import { Group } from "@shopify/react-native-skia";
import type { ReactNode } from "react";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

export type DepthEntity = {
  /** Unique across the whole combined list, not just within one kind. */
  key: string;
  /** The point this entity is Y-sorted against everything else by. */
  baseline: number;
  node: ReactNode;
};

/**
 * One entity's own behind/front toggle - the same "draw both copies, show
 * only one" trick ItemLayer.tsx's PlacedItemSprite uses for a single item
 * against the character, applied here per entity in a mixed list instead.
 */
const DepthSortedEntity = ({
  baseline,
  node,
  pass,
  characterY,
}: {
  baseline: number;
  node: ReactNode;
  pass: "behind" | "front";
  characterY: SharedValue<number>;
}) => {
  const opacity = useDerivedValue(() => {
    // The character stands in front of this entity when its feet are below
    // the entity's baseline - same comparison PlacedItemSprite uses.
    const characterInFront = characterY.value > baseline;
    return (pass === "behind") === characterInFront ? 1 : 0;
  });
  return <Group opacity={opacity}>{node}</Group>;
};

/**
 * Draws a pre-sorted (by baseline, ascending) list of depth entities -
 * placed `object` items and scenery pieces (trees, rocks, bushes) alike -
 * so they resolve their draw order against *each other* as well as against
 * the character, instead of items always losing to scenery or vice versa
 * (see villageLayout.ts's comment on why the old always-above collision
 * layer couldn't do this).
 *
 * Two calls are needed, one before the Character in HomeScreen.tsx's JSX
 * (pass="behind") and one after (pass="front") - the same shape ItemLayer's
 * own "object" pass already used for items alone, generalised here to a
 * mixed list. `entities` must already be sorted by baseline before it gets
 * here for the relative order between two non-character entities to come
 * out right - see HomeScreen.tsx's own combined, memoised list - since
 * within a single pass both copies of an out-of-order pair would otherwise
 * show or hide together instead of overlapping correctly.
 */
export const DepthSortedLayer = ({
  entities,
  pass,
  characterY,
}: {
  entities: DepthEntity[];
  pass: "behind" | "front";
  characterY: SharedValue<number>;
}) => (
  <>
    {entities.map((entity) => (
      <DepthSortedEntity
        key={`${pass}-${entity.key}`}
        baseline={entity.baseline}
        node={entity.node}
        pass={pass}
        characterY={characterY}
      />
    ))}
  </>
);
