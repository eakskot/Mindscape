import { Pressable, StyleSheet, Text } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { toScreenPoint, type EntityProps } from "../entitySprite";
import type { SceneryGroup } from "../scene";

const BUTTON_WIDTH = 120;

type Props = {
  group: SceneryGroup;
  cost: number;
  canAfford: boolean;
  onConfirm: () => void;
} & EntityProps;

/**
 * The "remove this for N coins" confirm button that floats above a selected
 * scenery group - see useSceneGestures' tap-to-select and villageLayout.ts's
 * SceneryGroup. A real RN Pressable, not something drawn into the Skia
 * canvas (contrast DragHighlight, which is purely decorative) - it has to
 * actually receive a touch outside the world's own PanResponder, the same
 * way DevInventory's buttons already coexist with it.
 *
 * Tracks the live camera itself via useAnimatedStyle, reading the same
 * shared values every on-canvas entity does (see entitySprite.ts), so it
 * stays glued to the tree through a pan or pinch instead of only being
 * correct at the moment it was selected.
 */
export const SceneryRemovalPrompt = ({
  group,
  cost,
  canAfford,
  onConfirm,
  camera,
  worldScale,
  density,
}: Props) => {
  // Anchored at the top-centre of the group's bounding box, in room pixels -
  // computed once per selection, not per frame (the box itself doesn't move).
  const anchorX = (group.bounds.minX + group.bounds.maxX) / 2;
  const anchorY = group.bounds.minY;

  const style = useAnimatedStyle(() => {
    const point = toScreenPoint(anchorX, anchorY, camera.value, worldScale.value, density);
    return {
      transform: [
        { translateX: point.x - BUTTON_WIDTH / 2 },
        // Floats just above the tree's top edge rather than sitting on it.
        { translateY: point.y - 40 },
      ],
    };
  });

  return (
    <Animated.View style={[styles.root, style]} pointerEvents="box-none">
      <Pressable
        style={[styles.button, !canAfford && styles.buttonDisabled]}
        disabled={!canAfford}
        onPress={onConfirm}
      >
        <Text style={styles.text}>
          {canAfford ? `Fjern for ${cost} 🪙` : `Trenger ${cost} 🪙`}
        </Text>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 0,
    top: 0,
    width: BUTTON_WIDTH,
    alignItems: "center",
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#000000cc",
  },
  buttonDisabled: {
    backgroundColor: "#00000088",
  },
  text: {
    color: "#ffd978",
    fontSize: 12,
    fontWeight: "600",
  },
});
