import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../src/ui/TabBar/theme";
import { resetRemovedScenery } from "../src/game/village/sceneryReset";
import { strings } from "../src/ui/strings";
import { AppearancePicker, makeStyles, useTheme } from "../src/ui/theme";

/**
 * Settings modal - opened from the gear button on the Village screen.
 * Appearance, plus a Developer section for testing (restore removed scenery).
 */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const styles = useStyles();
  const [restored, setRestored] = useState(false);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{theme.labels.settings}</Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Feather name="x" size={22} color={palette.textPrimary} />
        </Pressable>
      </View>
      <Text style={styles.sectionTitle}>{strings.appearance.section}</Text>
      <AppearancePicker />

      <Text style={[styles.sectionTitle, styles.sectionSpacing]}>{strings.developer.section}</Text>
      <Pressable
        style={styles.row}
        onPress={() => {
          resetRemovedScenery();
          setRestored(true);
        }}
        accessibilityRole="button"
      >
        <Text style={styles.rowText}>{strings.developer.restoreScenery}</Text>
        {restored ? (
          <Text style={styles.rowDone}>{strings.developer.restoredScenery}</Text>
        ) : (
          <Feather name="rotate-ccw" size={16} color={palette.textSecondary} />
        )}
      </Pressable>
      <Text style={styles.hint}>{strings.developer.restoreSceneryHint}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: {
    flex: 1,
    backgroundColor: c.modalBg,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    color: c.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  sectionTitle: {
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  sectionSpacing: {
    marginTop: 28,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: c.surfaceRaised,
  },
  rowText: {
    color: c.textPrimary,
    fontSize: 14,
  },
  rowDone: {
    color: c.accent,
    fontSize: 13,
    fontWeight: "600",
  },
  hint: {
    color: c.textSecondary,
    fontSize: 12,
    marginTop: 6,
  },
}));
