import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { type ItemId, unlockedItems } from "./itemCatalog";

/**
 * Throwaway test UI, not the shop. It exists to exercise the item system:
 * open the list, tap to place, then drag things around in the room.
 *
 * Locked items are hidden here the same way the shop will hide them - by
 * filtering on `unlocked` - so the flow is already the real one.
 */
type DevInventoryProps = {
  onPlace: (itemId: ItemId) => void;
  onClear: () => void;
  /** Tapping a placed item removes it while this is on. */
  deleteMode: boolean;
  onToggleDeleteMode: () => void;
  placedCount: number;
};

export const DevInventory = ({
  onPlace,
  onClear,
  deleteMode,
  onToggleDeleteMode,
  placedCount,
}: DevInventoryProps) => {
  const [open, setOpen] = useState(false);
  const items = unlockedItems();

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
          style={[styles.button, deleteMode && styles.buttonActive]}
          onPress={onToggleDeleteMode}
        >
          <Text style={styles.buttonText}>
            {deleteMode ? "Deleting" : "Delete"}
          </Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onClear}>
          <Text style={styles.buttonText}>Clear</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
  },
  panel: {
    margin: 12,
    padding: 10,
    maxHeight: 280,
    borderRadius: 8,
    backgroundColor: "#000000cc",
  },
  heading: {
    color: "#ffd978",
    fontSize: 12,
    marginBottom: 6,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ffffff22",
  },
  rowText: {
    color: "#ffffff",
    fontSize: 14,
  },
  rowMeta: {
    color: "#ffffff77",
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
    backgroundColor: "#000000cc",
  },
  buttonActive: {
    backgroundColor: "#a33",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 13,
  },
});
