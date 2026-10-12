import { Pressable, Text, View } from "react-native";

import { strings } from "../strings";
import { makeStyles } from "./makeStyles";
import { useTheme, type ThemePreference } from "./ThemeProvider";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: strings.appearance.light },
  { value: "dark", label: strings.appearance.dark },
  { value: "system", label: strings.appearance.system },
];

/** Light / Dark / System segmented control (Settings -> Appearance). Applies live. */
export function AppearancePicker() {
  const { preference, setPreference } = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.track} accessibilityRole="radiogroup">
      {OPTIONS.map((option) => {
        const selected = option.value === preference;
        return (
          <Pressable
            key={option.value}
            style={[styles.segment, selected && styles.segmentSelected]}
            onPress={() => setPreference(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c, t) => ({
  track: {
    flexDirection: "row",
    padding: 3,
    borderRadius: t.radii.chip,
    backgroundColor: c.surfaceRaised,
    borderWidth: 1,
    borderColor: c.border,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: t.radii.chip - 3,
    alignItems: "center",
  },
  segmentSelected: {
    backgroundColor: c.accent,
  },
  label: {
    color: c.textSecondary,
    fontSize: t.fontSizes.md,
    fontWeight: "600",
  },
  labelSelected: {
    color: c.accentText,
  },
}));
