import { Feather } from "@expo/vector-icons";
import { Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../../src/ui/TabBar/theme";
import { strings } from "../../src/ui/strings";
import { makeStyles, useTheme } from "../../src/ui/theme";

/**
 * Placeholder - no accounts/backend yet. The one deliberate thing here is
 * the disabled Friends row: CLAUDE.md "Where this is going" calls out that a
 * real Friends tab needs a backend, so it isn't one of the five bar slots
 * (see tabs.config.ts) - this is where it lives until it is.
 *
 * Also a one-tap light/dark switch, so the app can be flipped mid-demo
 * without opening Settings (which has the full Light/Dark/System control).
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { palette, scheme, setPreference } = useTheme();
  const styles = useStyles();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.title}>{theme.labels.profile}</Text>

      <View style={[styles.row, styles.rowSpacing]}>
        <Feather name="moon" size={18} color={palette.textPrimary} />
        <Text style={styles.rowText}>{strings.appearance.darkModeToggle}</Text>
        <Switch
          value={scheme === "dark"}
          onValueChange={(on) => setPreference(on ? "dark" : "light")}
          trackColor={{ true: palette.accent }}
        />
      </View>

      <View style={styles.row}>
        <Feather name="users" size={18} color={palette.textDisabled} />
        <Text style={styles.rowTextDisabled}>{theme.labels.friendsComingSoon}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: {
    flex: 1,
    backgroundColor: c.bg,
    paddingHorizontal: 20,
  },
  title: {
    color: c.textPrimary,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: theme.radii.card,
    backgroundColor: c.surfaceRaised,
  },
  rowSpacing: {
    marginBottom: 12,
  },
  rowText: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 14,
  },
  rowTextDisabled: {
    color: c.textDisabled,
    fontSize: 14,
  },
}));
