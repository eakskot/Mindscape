import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { makeStyles, useTheme } from "./theme";

/**
 * A press-and-hold confirm button - used for starting a ticket (3s/15s,
 * see engine/config.ts) and the emergency valve (60s). A bottom-up fill
 * behind the label is the progress indicator: a plain `View` clipped by a
 * rounded parent rather than an SVG ring - no react-native-svg dependency,
 * since the phone is away for testing when this was built and a new native
 * module would mean another rebuild cycle before it could be tried. Easy to
 * swap for a true ring later (purely visual, see CLAUDE.md's UI polish
 * note) without touching the hold logic below.
 *
 * Releasing early cancels and resets - there is no partial credit.
 */
export function HoldToConfirm({
  label,
  holdingLabel,
  holdSeconds,
  onConfirm,
  color,
  textColor,
  disabled = false,
}: {
  label: string;
  holdingLabel?: string;
  holdSeconds: number;
  onConfirm: () => void;
  color?: string;
  textColor?: string;
  disabled?: boolean;
}) {
  const { palette } = useTheme();
  const styles = useStyles();
  const fillColor = color ?? palette.accent;
  // Was `accentText` (dark-on-dark before the fill reached it, unreadable)
  // - textPrimary reads on the resting surfaceRaised in both palettes.
  const labelColor = textColor ?? palette.textPrimary;
  const progress = useSharedValue(0);
  const [holding, setHolding] = useState(false);

  const fillStyle = useAnimatedStyle(() => ({
    height: `${progress.value * 100}%`,
  }));

  const start = () => {
    if (disabled) return;
    setHolding(true);
    progress.value = withTiming(1, { duration: holdSeconds * 1000 }, (finished) => {
      if (finished) {
        runOnJS(onConfirm)();
        progress.value = 0;
        runOnJS(setHolding)(false);
      }
    });
  };

  const cancel = () => {
    cancelAnimation(progress);
    progress.value = withTiming(0, { duration: 150 });
    setHolding(false);
  };

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      disabled={disabled}
      style={[styles.button, disabled && styles.disabled]}
    >
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle, { backgroundColor: fillColor }]} />
      </View>
      <Text style={[styles.label, { color: labelColor }]}>
        {holding ? (holdingLabel ?? `Hold... (${holdSeconds}s)`) : label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  button: {
    height: 56,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surfaceRaised,
  },
  disabled: {
    opacity: 0.4,
  },
  track: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
  },
  fill: {
    width: "100%",
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
  },
}));
