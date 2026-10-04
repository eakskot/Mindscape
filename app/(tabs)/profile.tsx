import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../../src/ui/TabBar/theme";

/**
 * Placeholder - no accounts/backend yet. The one deliberate thing here is
 * the disabled Friends row: CLAUDE.md "Where this is going" calls out that a
 * real Friends tab needs a backend, so it isn't one of the five bar slots
 * (see tabs.config.ts) - this is where it lives until it is.
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.title}>{theme.labels.profile}</Text>

      <View style={styles.row}>
        <Feather name="users" size={18} color={theme.colors.textDisabled} />
        <Text style={styles.rowTextDisabled}>{theme.labels.friendsComingSoon}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.screenBackground,
    paddingHorizontal: 20,
  },
  title: {
    color: theme.colors.textPrimary,
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
    backgroundColor: theme.colors.cardBackground,
  },
  rowTextDisabled: {
    color: theme.colors.textDisabled,
    fontSize: 14,
  },
});
