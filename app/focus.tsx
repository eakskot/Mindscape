import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useWalletContext } from "../src/game/economy/WalletContext";
import { theme } from "../src/ui/TabBar/theme";

const DURATIONS_MINUTES = [15, 25, 45] as const;

/**
 * The Focus modal, opened from the tab bar's center Play button (see
 * TabBar.tsx). Picks a duration, counts down, and rewards the wallet on
 * natural completion - cancelling pays nothing.
 *
 * The countdown is derived from an `endsAt` timestamp, not a decrementing
 * counter - a `setInterval` tick just recomputes `endsAt - Date.now()`, so
 * backgrounding the app (timers pause, the clock doesn't) can never leave
 * the session "stuck" or let someone dodge a tick. An AppState listener
 * forces one extra recompute the moment the app comes back to the
 * foreground, so the result is visible immediately rather than waiting for
 * the next interval tick.
 *
 * In-memory only, same as every other piece of state in this app (see
 * useWallet.ts) - leaving the modal or killing the app abandons the running
 * session with no reward, there's nothing to resume into yet.
 *
 * TODO(Screen Time): this does not yet shield the chosen apps for the
 * session's duration - that's ManagedSettings' job (see CLAUDE.md "Where
 * this is going" #3), not wired here. Today this is a plain timer; the
 * actual "locked out of other apps" behavior lands when that does.
 */
export default function FocusScreen() {
  const insets = useSafeAreaInsets();
  const wallet = useWalletContext();

  const [selectedMinutes, setSelectedMinutes] = useState<number>(DURATIONS_MINUTES[1]);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  // Avoids a double-accrue: the completion effect below can run once more
  // (e.g. the AppState recompute firing right after the interval already
  // did) before `endsAt` itself gets cleared.
  const awardedRef = useRef(false);

  useEffect(() => {
    if (endsAt === null) return;

    const recompute = () => setRemainingMs(Math.max(0, endsAt - Date.now()));
    recompute();
    const interval = setInterval(recompute, 250);
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") recompute();
    });
    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [endsAt]);

  useEffect(() => {
    if (endsAt === null || remainingMs > 0 || awardedRef.current) return;
    awardedRef.current = true;
    wallet.accrue(selectedMinutes, "focus");
    setEndsAt(null);
    router.back();
  }, [remainingMs, endsAt, selectedMinutes, wallet]);

  const start = () => {
    awardedRef.current = false;
    setEndsAt(Date.now() + selectedMinutes * 60_000);
  };

  const cancel = () => {
    // No accrue call - cancelling a session earns nothing.
    setEndsAt(null);
  };

  const isRunning = endsAt !== null;

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
          <View style={styles.durationRow}>
            {DURATIONS_MINUTES.map((minutes) => (
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
            <Text style={styles.countdown}>{formatRemaining(remainingMs)}</Text>
          </View>
          <Pressable style={styles.secondaryButton} onPress={cancel}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
