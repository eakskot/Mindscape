import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as ReactNativeDeviceActivity from "react-native-device-activity";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useWalletContext } from "../economy/WalletContext";
import { theme } from "../../ui/TabBar/theme";
import { BrainrotAppPicker } from "./BrainrotAppPicker";
import { BRAINROT_SELECTION_ID, useScreenTime } from "./useScreenTime";

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
          <View style={styles.pickerRow}>
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

          {/* TEMP - Phase 0 proof that blockSelection/unblockSelection actually
              shields the picked apps on this physical device. Gone once the
              real ticket engine (Phase 1) owns blocking. */}
          <ShieldProofOfConcept />
        </>
      )}
    </View>
  );
}

// TEMP - see comment above.
function ShieldProofOfConcept() {
  const [shieldActive, setShieldActive] = useState(ReactNativeDeviceActivity.isShieldActive());

  const refresh = () => setShieldActive(ReactNativeDeviceActivity.isShieldActive());

  const block = () => {
    ReactNativeDeviceActivity.updateShield(
      {
        backgroundColor: { red: 15, green: 17, blue: 21 },
        title: "Locked by Mindscape",
        titleColor: { red: 255, green: 255, blue: 255 },
        subtitle: "Open Mindscape to use a ticket.",
        subtitleColor: { red: 138, green: 143, blue: 152 },
        primaryButtonLabel: "Open Mindscape",
        primaryButtonLabelColor: { red: 15, green: 17, blue: 21 },
        primaryButtonBackgroundColor: { red: 61, green: 220, blue: 115 },
      },
      {
        primary: { behavior: "close", actions: [{ type: "openApp" }] },
      },
    );
    ReactNativeDeviceActivity.blockSelection({
      activitySelectionId: BRAINROT_SELECTION_ID,
    });
    refresh();
  };

  const unblock = () => {
    ReactNativeDeviceActivity.unblockSelection({
      activitySelectionId: BRAINROT_SELECTION_ID,
    });
    refresh();
  };

  return (
    <View style={styles.tempSection}>
      <Text style={styles.sectionLabel}>
        TEMP - Phase 0 proof (shield active: {shieldActive ? "yes" : "no"})
      </Text>
      <View style={styles.tempRow}>
        <Pressable style={[styles.button, styles.tempButton]} onPress={block}>
          <Text style={styles.buttonText}>Block now</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.tempButton]} onPress={unblock}>
          <Text style={styles.buttonText}>Unblock now</Text>
        </Pressable>
      </View>
      <Pressable style={[styles.button, styles.tempButtonFull]} onPress={refresh}>
        <Text style={styles.buttonText}>Refresh shield status</Text>
      </Pressable>
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
  pickerRow: {
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
  tempSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.divider,
    gap: 8,
  },
  tempRow: {
    flexDirection: "row",
    gap: 8,
  },
  tempButton: {
    flex: 1,
    backgroundColor: theme.colors.danger,
  },
  tempButtonFull: {
    backgroundColor: theme.colors.danger,
  },
});
