import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable } from "react-native";

import { theme } from "./TabBar/theme";
import { floatingSurface, makeStyles, useTheme } from "./theme";

/**
 * The gear button on the Village screen, next to CurrencyHud - opens
 * Settings as a modal (see app/_layout.tsx, app/settings.tsx). Settings has
 * no tab of its own (see CLAUDE.md's tab bar section), this is its only
 * entry point today besides a future link from Profile.
 */
export const SettingsButton = () => {
  const { palette } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      style={styles.root}
      onPress={() => router.push("/settings")}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={theme.labels.settings}
    >
      <Feather name="settings" size={18} color={palette.textPrimary} />
    </Pressable>
  );
};

const useStyles = makeStyles((c) => ({
  root: {
    position: "absolute",
    // Stacked directly under CurrencyHud's badge (`top: 56` there - see
    // CurrencyHud.tsx), same right edge - a plain constant chosen to clear
    // it, not a measured value, same spirit as that badge's own `top: 56`.
    top: 100,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    ...floatingSurface(c),
    alignItems: "center",
    justifyContent: "center",
  },
}));
