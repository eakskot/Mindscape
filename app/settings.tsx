import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../src/ui/TabBar/theme";
import { strings } from "../src/ui/strings";
import { AppearancePicker, makeStyles, useTheme } from "../src/ui/theme";

/** Settings modal - opened from the gear button on the Village screen. Appearance is the only real section so far. */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const styles = useStyles();

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
}));
