import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet } from "react-native";

import { strings } from "../../ui/strings";
import { theme } from "../../ui/TabBar/theme";

/**
 * The pencil that enters village edit mode (shows DevInventory's toolbar -
 * see HomeScreen.tsx). Stacked under SettingsButton's gear, same size and
 * look, so the top-right column reads as "status row, settings, edit".
 * Hidden while editing - the toolbar's own "Done" is the way back out.
 */
export const EditVillageButton = ({ onPress }: { onPress: () => void }) => (
  <Pressable
    style={styles.root}
    onPress={onPress}
    hitSlop={8}
    accessibilityRole="button"
    accessibilityLabel={strings.edit.editVillage}
  >
    <Feather name="edit-2" size={16} color={theme.colors.textPrimary} />
  </Pressable>
);

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    // SettingsButton sits at `top: 100` with a 32pt height - this clears it
    // by the same 12pt gap, same right edge.
    top: 144,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#000000cc",
    alignItems: "center",
    justifyContent: "center",
  },
});
