import { StyleSheet, Text, View } from "react-native";

type CurrencyHudProps = {
  balance: number;
};

/**
 * Fixed top-right balance badge. Purely presentational - HomeScreen owns the
 * wallet (see useWallet.ts) and passes the number down, the same split
 * DevInventory uses for edit mode. `pointerEvents="none"` since it's a
 * read-out, not a button - it must never steal a touch from the world view
 * underneath it.
 *
 * Not safe-area-aware (same as DevInventory's hardcoded margins elsewhere in
 * this screen) - `top: 56` is a plain constant chosen to clear the notch /
 * Dynamic Island on current iPhones, not a real inset. Worth revisiting with
 * `react-native-safe-area-context` if this ever needs to be pixel-exact
 * across devices.
 */
export const CurrencyHud = ({ balance }: CurrencyHudProps) => (
  <View style={styles.root} pointerEvents="none">
    <Text style={styles.icon}>🪙</Text>
    <Text style={styles.balance}>{balance}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 56,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#000000cc",
  },
  icon: {
    fontSize: 14,
  },
  balance: {
    color: "#ffd978",
    fontSize: 14,
    fontWeight: "600",
  },
});
