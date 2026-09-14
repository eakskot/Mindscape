import { Group, RoundedRect, type SkImage } from "@shopify/react-native-skia";

import { StaticTileAtlas } from "../SceneLayers";
import type { SceneryGroup } from "../scene";

/**
 * One removable scenery group's draw node - the tiles themselves (same
 * batched-atlas approach as an ordinary SceneSceneryBand, just addressed by
 * id instead of by row) plus, when selected, a highlight outline. Drawn
 * inside the world's camera-scaled `<Group>` (see HomeScreen.tsx), so
 * `group.bounds` can be used directly in room pixels - no screen-space math
 * needed here, unlike the confirm button (SceneryRemovalPrompt.tsx), which
 * draws as a real RN view above the canvas instead.
 */
export const SceneryGroupVisual = ({
  group,
  images,
  tileSize,
  selected,
}: {
  group: SceneryGroup;
  images: (SkImage | null)[];
  tileSize: number;
  selected: boolean;
}) => (
  <Group>
    {group.tilesByTileset.map((tiles, tilesetIndex) =>
      tiles.length > 0 ? (
        <StaticTileAtlas
          key={tilesetIndex}
          image={images[tilesetIndex]}
          tiles={tiles}
          tileSize={tileSize}
        />
      ) : null,
    )}
    {selected && (
      <RoundedRect
        x={group.bounds.minX - 1}
        y={group.bounds.minY - 1}
        width={group.bounds.maxX - group.bounds.minX + 2}
        height={group.bounds.maxY - group.bounds.minY + 2}
        r={2}
        style="stroke"
        strokeWidth={1}
        color="#ffd978"
      />
    )}
  </Group>
);
