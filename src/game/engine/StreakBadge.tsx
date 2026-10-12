import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { strings } from "../../ui/strings";

/** Colors with no token in theme.ts yet - kept local so a future theme system can absorb them. */
const localColors = {
  flame: "#ff9f43",
  text: "#ffd9b0",
};

type StreakBadgeProps = {
  /** `EngineState.streak` - consecutive clean days, as `settleDay()` updates it. */
  streak: number;
};

/**
 * The flame + streak count next to CurrencyHud, same visual language as the
 * coin badge. Presentational only, not positioned itself (HomeScreen.tsx's
 * `topRightRow` places it). A zero streak is shown dimmed rather than
 * hidden, so the badge is always there to explain itself. Not a button yet
 * - `pointerEvents="none"`, same as CurrencyHud, so it never steals a world
 * touch.
 */
export const StreakBadge = ({ streak }: StreakBadgeProps) => (
  <View
    style={[styles.root, streak === 0 && styles.dimmed]}
    pointerEvents="none"
    accessible
    accessibilityLabel={strings.streak.accessibility(streak)}
  >
    <Ionicons name="flame" size={14} color={localColors.flame} />
    <Text style={styles.count}>{streak}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#000000cc",
  },
  dimmed: {
    opacity: 0.5,
  },
  count: {
    color: localColors.text,
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
