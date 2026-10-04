import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useEngine } from "../src/game/engine/EngineProvider";
import { theme } from "../src/ui/TabBar/theme";

/**
 * Pushed automatically by EngineProvider.tsx the moment a day-settlement
 * pays something - "Yesterday: unused tickets +20, clean day +10, streak
 * +8" (see economy/settleDay.ts for where each of these numbers comes
 * from). Closing it calls `dismissSummary()`, which is what stops
 * EngineProvider from pushing this route again for the same settlement.
 */
export default function SummaryScreen() {
  const insets = useSafeAreaInsets();
  const engine = useEngine();
  const summary = engine.state.pendingSummary;

  const close = () => {
    engine.dismissSummary();
    router.back();
  };

  if (!summary) {
    // Shouldn't normally be reachable (EngineProvider only pushes here
    // when one exists), but a cheap guard beats a crash if it somehow is.
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.body}>Nothing to show.</Text>
        <Pressable style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const rows = [
    summary.breakdown.unusedTickets > 0 && [
      "Unused tickets",
      summary.breakdown.unusedTickets,
    ],
    summary.breakdown.cleanDay > 0 && ["Clean day", summary.breakdown.cleanDay],
    summary.breakdown.streakDaily > 0 && ["Streak bonus", summary.breakdown.streakDaily],
    summary.breakdown.streakMilestone > 0 && [
      "Streak milestone!",
      summary.breakdown.streakMilestone,
    ],
  ].filter(Boolean) as [string, number][];

  return (
    <View style={[styles.root, { paddingTop: insets.top + 32 }]}>
      <Text style={styles.heading}>Yesterday</Text>
      <Text style={styles.total}>+{summary.totalCoins} coins</Text>

      <View style={styles.breakdown}>
        {rows.map(([label, amount]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowAmount}>+{amount}</Text>
          </View>
        ))}
      </View>

      <Pressable style={styles.button} onPress={close}>
        <Text style={styles.buttonText}>Nice</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.modalBackground,
    paddingHorizontal: 24,
  },
  heading: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    marginBottom: 4,
  },
  total: {
    color: theme.colors.accent,
    fontSize: 40,
    fontWeight: "800",
    marginBottom: 28,
  },
  body: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  breakdown: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radii.card,
    padding: 16,
    marginBottom: 28,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  rowLabel: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  rowAmount: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  button: {
    paddingVertical: 16,
    borderRadius: theme.radii.chip,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
  },
  buttonText: {
    color: theme.colors.playIcon,
    fontSize: 16,
    fontWeight: "700",
  },
});
