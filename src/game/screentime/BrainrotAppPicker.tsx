import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { DeviceActivitySelectionSheetViewPersisted } from "react-native-device-activity";

import { BRAINROT_SELECTION_ID } from "./useScreenTime";

/**
 * Lets the user choose which apps/categories count toward the daily budget
 * (see useScreenTime.ts). The native "Persisted" picker variant stores the
 * selection under `familyActivitySelectionId` itself - we never learn which
 * apps were picked (Apple's privacy model: opaque tokens only), just this
 * fixed id to refer back to it by.
 *
 * Uses the native *sheet* presentation (`DeviceActivitySelectionSheetViewPersisted`),
 * not the inline/embedded view - the embedded one
 * (`DeviceActivitySelectionViewPersisted`) was found on-device (physical
 * iPhone, 2026-10-04) to render completely blank and silently swallow every
 * touch on the whole screen, including sibling Pressables with no relation
 * to it (Start monitoring, the Phase 0 proof buttons) - matches the
 * library's own README warning that this picker is crash-prone. The sheet
 * variant presents as a proper native modal instead of embedding inline, so
 * a broken/blank render can't block the rest of the screen - see CLAUDE.md.
 *
 * Needs FamilyControls authorization already granted (useScreenTime's
 * `requestAccess`) - presenting before that has happened is untested; the
 * caller is expected to gate on `isAuthorized`.
 */
export function BrainrotAppPicker() {
  const [pickerVisible, setPickerVisible] = useState(false);

  return (
    <>
      <Pressable style={styles.button} onPress={() => setPickerVisible(true)}>
        <Text style={styles.buttonText}>Choose apps</Text>
      </Pressable>
      {pickerVisible && (
        <DeviceActivitySelectionSheetViewPersisted
          style={styles.hiddenAnchor}
          familyActivitySelectionId={BRAINROT_SELECTION_ID}
          headerText="Choose the apps that count as brainrot"
          // Without this, picking a category (e.g. "Social") ignores the apps
          // inside it for our purposes - see the type's own doc link.
          includeEntireCategory
          onDismissRequest={() => setPickerVisible(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#3DDC73",
    alignItems: "center",
  },
  buttonText: {
    color: "#0F1115",
    fontSize: 15,
    fontWeight: "600",
  },
  // The sheet view is an invisible anchor - the native side presents the
  // actual iOS sheet; this view itself never needs to be seen or sized.
  hiddenAnchor: {
    width: 1,
    height: 1,
    position: "absolute",
  },
});
