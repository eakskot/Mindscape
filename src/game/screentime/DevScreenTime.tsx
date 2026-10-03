import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BrainrotAppPicker } from "./BrainrotAppPicker";
import { useScreenTime } from "./useScreenTime";
import type { WalletSource } from "../economy/useWallet";

/**
 * Throwaway test UI, same spirit as DevInventory.tsx: no real screen for
 * this yet (CLAUDE.md's navigation item is further down the list than
 * Screen Time), so this is how the whole flow - authorize, pick apps, start
 * watching - gets exercised at all before there's a proper settings screen.
 * Expect this file to be deleted once that screen exists.
 */
export function DevScreenTime({
  accrue,
}: {
  accrue: (amount: number, source: WalletSource) => void;
}) {
  const [open, setOpen] = useState(false);
  const screenTime = useScreenTime(accrue);

  if (!screenTime.isAvailable) {
    // iOS only - see CLAUDE.md. Simulators without the Screen Time
    // frameworks, and Android, both land here.
    return null;
  }

  return (
    <View style={styles.root} pointerEvents="box-none">
      {open && (
        <View style={styles.panel}>
          <Text style={styles.statusText}>
            Autorisert: {screenTime.isAuthorized ? "ja" : "nei"} · Overvåker:{" "}
            {screenTime.isMonitoring ? "ja" : "nei"}
          </Text>

          {!screenTime.isAuthorized && (
            <Pressable style={styles.button} onPress={screenTime.requestAccess}>
              <Text style={styles.buttonText}>Be om tilgang</Text>
            </Pressable>
          )}

          {screenTime.isAuthorized && (
            <>
              <View style={styles.pickerBox}>
                <BrainrotAppPicker />
              </View>
              <Pressable
                style={styles.button}
                onPress={
                  screenTime.isMonitoring
                    ? screenTime.stopWatching
                    : screenTime.startWatching
                }
              >
                <Text style={styles.buttonText}>
                  {screenTime.isMonitoring ? "Stopp overvåking" : "Start overvåking"}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      <View style={styles.buttons}>
        <Pressable style={styles.button} onPress={() => setOpen(!open)}>
          <Text style={styles.buttonText}>{open ? "Lukk" : "Skjermtid"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  panel: {
    margin: 12,
    padding: 10,
    width: 260,
    borderRadius: 8,
    backgroundColor: "#000000cc",
  },
  statusText: {
    color: "#ffffff",
    fontSize: 12,
    marginBottom: 8,
  },
  pickerBox: {
    height: 220,
    marginBottom: 8,
    borderRadius: 6,
    overflow: "hidden",
  },
  buttons: {
    flexDirection: "row",
    gap: 8,
    margin: 12,
    marginBottom: 32,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#000000cc",
    marginBottom: 6,
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 13,
  },
});
