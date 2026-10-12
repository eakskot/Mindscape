import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { strings } from "../../ui/strings";
import type { SceneId } from "../scene";
import { allowedInScene, type ItemId, unlockedItems } from "./itemCatalog";
import type { EditMode } from "./editMode";
import { floatingSurface, makeStyles } from "../../ui/theme";

/**
 * Throwaway test UI, not the shop. It exists to exercise the item system:
 * open the list, tap to place, then drag things around in the room.
 *
 * Locked items are hidden here the same way the shop will hide them - by
 * filtering on `unlocked` - so the flow is already the real one.
 *
 * Only mounted while the village is in edit mode (HomeScreen.tsx, entered
 * via EditVillageButton's pencil). "Done" leaves edit mode; the parent
 * resets `editMode` to "none" on the way out.
 */
type DevInventoryProps = {
  onPlace: (itemId: ItemId) => void;
  onClear: () => void;
  /**
   * "none": tapping/dragging never touches a placed item - it's just tap-
   * to-walk and camera-drag, same as if there were no furniture at all.
   * "move": tap-and-drag a placed item to reposition it (see HomeScreen.tsx's
   * PanResponder and DragHighlight for the yellow/red feedback while doing
   * so). "delete": tapping a placed item removes it.
   * Gating item-dragging behind a deliberate mode - rather than always-on,
   * as it was before - is the fix for touches near a big new item (a
   * fountain, the plant stand) getting eaten as an accidental grab instead
   * of a walk, and vice versa.
   */
  editMode: EditMode;
  onSetEditMode: (mode: EditMode) => void;
  placedCount: number;
  onDone: () => void;
  /** Only items allowed in this scene are listed (houses are village-only). */
  sceneId: SceneId;
};

export const DevInventory = ({
  onPlace,
  onClear,
  editMode,
  onSetEditMode,
  placedCount,
  onDone,
  sceneId,
}: DevInventoryProps) => {
  const [open, setOpen] = useState(false);
  const styles = useStyles();
  const items = unlockedItems().filter((item) => allowedInScene(item, sceneId));

  /** Tapping an already-active mode button turns it back off. */
  const toggle = (mode: EditMode) =>
    onSetEditMode(editMode === mode ? "none" : mode);

  return (
    <View style={styles.root} pointerEvents="box-none">
      {open && (
        <View style={styles.panel}>
          <Text style={styles.heading}>
            Items ({items.length} unlocked, {placedCount} placed)
          </Text>
          <ScrollView style={styles.list}>
            {items.map((item) => (
              <Pressable
                key={item.id}
                style={styles.row}
                onPress={() => onPlace(item.id)}
              >
                <Text style={styles.rowText}>{item.label}</Text>
                <Text style={styles.rowMeta}>
                  {item.width}x{item.height}
                  {item.solid ? " solid" : ""}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.buttons}>
        <Pressable style={styles.button} onPress={() => setOpen(!open)}>
          <Text style={styles.buttonText}>{open ? "Close" : "Items"}</Text>
        </Pressable>
        <Pressable
          style={[styles.button, editMode === "move" && styles.buttonMoveActive]}
          onPress={() => toggle("move")}
        >
          <Text style={[styles.buttonText, editMode === "move" && styles.buttonTextMoveActive]}>
            {editMode === "move" ? "Moving" : "Move"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.button, editMode === "delete" && styles.buttonActive]}
          onPress={() => toggle("delete")}
        >
          <Text style={[styles.buttonText, editMode === "delete" && styles.buttonTextActive]}>
            {editMode === "delete" ? "Deleting" : "Delete"}
          </Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onClear}>
          <Text style={styles.buttonText}>Clear</Text>
        </Pressable>
        <View style={styles.spacer} />
        <Pressable
          style={[styles.button, styles.doneButton]}
          onPress={onDone}
          accessibilityRole="button"
        >
          <Text style={styles.doneText}>{strings.edit.done}</Text>
        </Pressable>
      </View>
    </View>
  );
};

const useStyles = makeStyles((c) => ({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    // Was `bottom: 0` - collided with the new tab bar (TabBar.tsx) once
    // that started owning the bottom of the screen; this plain constant
    // just clears its height + safe area, same spirit as this file's other
    // hardcoded margins.
    bottom: 110,
    justifyContent: "flex-end",
  },
  panel: {
    margin: 12,
    padding: 10,
    maxHeight: 280,
    borderRadius: 8,
    ...floatingSurface(c),
  },
  heading: {
    color: c.coin,
    fontSize: 12,
    marginBottom: 6,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.divider,
  },
  rowText: {
    color: c.textPrimary,
    fontSize: 14,
  },
  rowMeta: {
    color: c.textSecondary,
    fontSize: 10,
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
    ...floatingSurface(c),
  },
  buttonActive: {
    backgroundColor: c.dangerSolid,
  },
  buttonMoveActive: {
    // The same yellow the in-world drag highlight uses (see
    // DragHighlight.tsx), so the button and the glow read as one idea.
    backgroundColor: c.warning,
  },
  spacer: {
    flex: 1,
  },
  doneButton: {
    backgroundColor: c.accent,
  },
  doneText: {
    color: c.accentText,
    fontSize: 13,
    fontWeight: "700",
  },
  buttonText: {
    color: c.textPrimary,
    fontSize: 13,
  },
  buttonTextActive: {
    color: c.onSolid,
  },
  buttonTextMoveActive: {
    color: c.warningText,
  },
}));
