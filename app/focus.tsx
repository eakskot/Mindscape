import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useEngine } from "../src/game/engine/EngineProvider";
import { formatMMSS } from "../src/ui/formatDuration";
import { theme } from "../src/ui/TabBar/theme";
import { useCountdown } from "../src/ui/useCountdown";

/** How long the second "give up" tap stays armed before reverting - see `confirmingGiveUp` below. */
const GIVE_UP_CONFIRM_WINDOW_MS = 3000;

/**
 * The Focus modal, opened from the tab bar's center Play button. Now drives
 * the real engine (see EngineProvider.tsx) instead of a local timer:
 * starting/ending/completing all go through `engineLogic.ts`'s pure
 * functions, so "while it runs, tickets can't be started, and an active
 * ticket is ended immediately" and "only counts if the engine is armed"
 * are enforced in one place, not duplicated here.
 *
 * `engine.state.activeFocus` (not local state) is the source of truth, so
 * reopening this modal mid-session (e.g. after the app was backgrounded
 * and the OS kept the process alive) shows the real remaining time, not a
 * reset timer.
 *
 * Natural completion: the countdown hitting zero while this screen is open
 * calls `forceReconcile()` itself (reconcile normally only runs at startup
 * and on AppState "active" - see EngineProvider.tsx - neither of which
 * fires just from watching a number count down in the foreground). The
 * backgrounded case is already covered by that AppState reconcile.
 */
export default function FocusScreen() {
  const insets = useSafeAreaInsets();
  const engine = useEngine();
  const { config, state } = engine;

  const [selectedMinutes, setSelectedMinutes] = useState<number>(
    config.FOCUS_OPTIONS_MIN[1] ?? config.FOCUS_OPTIONS_MIN[0],
  );
  const [confirmingGiveUp, setConfirmingGiveUp] = useState(false);
  const giveUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeFocus = state.activeFocus;
  const remaining = useCountdown(activeFocus?.endsAt);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!activeFocus) {
      completedRef.current = false;
      return;
    }
    if (remaining === 0 && !completedRef.current) {
      completedRef.current = true;
      engine.forceReconcile();
      router.back();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, activeFocus]);

  useEffect(() => {
    return () => {
      if (giveUpTimer.current) clearTimeout(giveUpTimer.current);
    };
  }, []);

  const start = () => engine.startFocus(selectedMinutes);

  const pressGiveUp = () => {
    if (!confirmingGiveUp) {
      setConfirmingGiveUp(true);
      giveUpTimer.current = setTimeout(
        () => setConfirmingGiveUp(false),
        GIVE_UP_CONFIRM_WINDOW_MS,
      );
      return;
    }
    if (giveUpTimer.current) clearTimeout(giveUpTimer.current);
    setConfirmingGiveUp(false);
    engine.giveUpFocus();
    router.back();
  };

  const isRunning = activeFocus !== null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{theme.labels.focus}</Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Feather name="x" size={22} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      {!isRunning ? (
        <>
          <Text style={styles.body}>Choose a session length.</Text>
          {!state.armed && (
            <Text style={styles.warning}>
              The engine isn't armed yet - this focus session will run, but won't pay coins
              (see the Screen time tab).
            </Text>
          )}
          <View style={styles.durationRow}>
            {config.FOCUS_OPTIONS_MIN.map((minutes) => (
              <Pressable
                key={minutes}
                style={[styles.chip, selectedMinutes === minutes && styles.chipSelected]}
                onPress={() => setSelectedMinutes(minutes)}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedMinutes === minutes && styles.chipTextSelected,
                  ]}
                >
                  {minutes} min
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.primaryButton} onPress={start}>
            <Text style={styles.primaryButtonText}>Start</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.countdownBox}>
            <Text style={styles.countdown}>
              {remaining !== null ? formatMMSS(remaining) : "--:--"}
            </Text>
          </View>
          <Pressable style={styles.secondaryButton} onPress={pressGiveUp}>
            <Text style={styles.secondaryButtonText}>
              {confirmingGiveUp ? "Tap again to give up - no reward" : "Give up"}
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
    backgroundColor: theme.colors.modalBackground,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  body: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginBottom: 16,
  },
  warning: {
    color: theme.colors.danger,
    fontSize: 13,
    marginBottom: 16,
  },
  durationRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 28,
  },
  chip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: theme.radii.chip,
    backgroundColor: theme.colors.cardBackground,
    alignItems: "center",
  },
  chipSelected: {
    backgroundColor: theme.colors.accent,
  },
  chipText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: theme.colors.playIcon,
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: theme.radii.chip,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
  },
  primaryButtonText: {
    color: theme.colors.playIcon,
    fontSize: 16,
    fontWeight: "700",
  },
  countdownBox: {
    alignItems: "center",
    paddingVertical: 48,
    marginBottom: 28,
  },
  countdown: {
    color: theme.colors.textPrimary,
    fontSize: 56,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: theme.radii.chip,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
});
