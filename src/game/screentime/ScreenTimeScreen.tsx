import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useWalletContext } from "../economy/WalletContext";
import { theme } from "../../ui/TabBar/theme";
import { BrainrotAppPicker } from "./BrainrotAppPicker";
import { useScreenTime } from "./useScreenTime";

/**
 * The real Screen Time tab - what DevScreenTime.tsx used to stand in for
 * (see CLAUDE.md "Where this is going" #3; that file is gone now). Reads
 * `accrue` straight from WalletContext instead of having it drilled down
 * through HomeScreen/SceneStage the way DevScreenTime needed.
 */
export default function ScreenTimeScreen() {
  const insets = useSafeAreaInsets();
  const wallet = useWalletContext();
  const screenTime = useScreenTime(wallet.accrue);

  if (!screenTime.isAvailable) {
    // iOS only, and the Simulator has no Screen Time data at all - see
    // CLAUDE.md. Both land here instead of a broken authorize button.
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.title}>{theme.labels.screentime}</Text>
        <Text style={styles.body}>
          Screen Time isn't available here - it needs a physical iPhone
          signed into iCloud, not the Simulator (and iOS only, no Android
          equivalent).
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.title}>{theme.labels.screentime}</Text>
      <Text style={styles.statusLine}>
        Authorized: {screenTime.isAuthorized ? "yes" : "no"} · Monitoring:{" "}
        {screenTime.isMonitoring ? "yes" : "no"}
      </Text>

      {!screenTime.isAuthorized && (
        <Pressable style={styles.button} onPress={screenTime.requestAccess}>
          <Text style={styles.buttonText}>Request access</Text>
        </Pressable>
      )}

      {screenTime.isAuthorized && (
        <>
          <Text style={styles.sectionLabel}>Apps that count against your daily budget</Text>
          <View style={styles.pickerBox}>
            <BrainrotAppPicker />
          </View>
          <Pressable
            style={styles.button}
            onPress={screenTime.isMonitoring ? screenTime.stopWatching : screenTime.startWatching}
          >
            <Text style={styles.buttonText}>
              {screenTime.isMonitoring ? "Stop monitoring" : "Start monitoring"}
            </Text>
          </Pressable>
        </>
      )}
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
    marginBottom: 12,
  },
  body: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  statusLine: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginBottom: 20,
  },
  sectionLabel: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginBottom: 8,
  },
  pickerBox: {
    height: 320,
    borderRadius: theme.radii.card,
    overflow: "hidden",
    backgroundColor: theme.colors.cardBackground,
    marginBottom: 16,
  },
  button: {
    paddingVertical: 14,
    borderRadius: theme.radii.chip,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
  },
  buttonText: {
    color: theme.colors.playIcon,
    fontSize: 15,
    fontWeight: "600",
  },
});
