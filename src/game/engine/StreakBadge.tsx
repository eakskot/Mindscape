import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { strings } from "../../ui/strings";
import { floatingSurface, makeStyles, useTheme } from "../../ui/theme";

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
export const StreakBadge = ({ streak }: StreakBadgeProps) => {
  const { palette } = useTheme();
  const styles = useStyles();
  return (
    <View
      style={[styles.root, streak === 0 && styles.dimmed]}
      pointerEvents="none"
      accessible
      accessibilityLabel={strings.streak.accessibility(streak)}
    >
      <Ionicons name="flame" size={14} color={palette.streakFlame} />
      <Text style={styles.count}>{streak}</Text>
    </View>
  );
};

const useStyles = makeStyles((c) => ({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    ...floatingSurface(c),
  },
  dimmed: {
    opacity: 0.5,
  },
  count: {
    color: c.streakText,
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
}));
