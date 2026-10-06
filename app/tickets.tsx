import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useEngine } from "../src/game/engine/EngineProvider";
import { HoldToConfirm } from "../src/ui/HoldToConfirm";
import { theme } from "../src/ui/TabBar/theme";
import { useCountdown } from "../src/ui/useCountdown";
import { formatMMSS } from "../src/ui/formatDuration";

/**
 * Deep link `mindscape://tickets`. Three ticket cards, a hold-to-confirm
 * start button, and the emergency valve when it's actually eligible (see
 * engineLogic.ts's `emergencyEligible` - cooldown or out of tickets only,
 * never during a ticket or focus).
 */
export default function TicketsScreen() {
  const insets = useSafeAreaInsets();
  const engine = useEngine();
  const { state, status, config } = engine;

  const activeEndsAt =
    state.activeTicket?.endsAt ?? state.emergencyActive?.endsAt ?? null;
  const activeRemaining = useCountdown(activeEndsAt);
  const cooldownRemaining = useCountdown(state.cooldownUntil);

  // `engine.status` only recomputes when engine state actually changes
  // (an action, or reconcile() running on startup/AppState "active") - a
  // countdown reaching zero while this screen just sits open in the
  // foreground doesn't itself trigger either, so without this the status
  // text/pips go stale at "0:00" until something else happens to trigger a
  // reconcile (confirmed on-device 2026-10-05). Same fix as focus.tsx's
  // natural-completion handling, applied here for ticket/cooldown windows.
  const reconciledForRef = useRef<number | null>(null);
  useEffect(() => {
    const endsAt = activeEndsAt ?? state.cooldownUntil;
    const remaining = activeEndsAt !== null ? activeRemaining : cooldownRemaining;
    if (endsAt !== null && remaining === 0 && reconciledForRef.current !== endsAt) {
      reconciledForRef.current = endsAt;
      engine.forceReconcile();
    }
  }, [activeRemaining, cooldownRemaining, activeEndsAt, state.cooldownUntil, engine]);

  const lastTicketEndedAt = state.ticketsUsedToday.reduce<number | null>(
    (latest, t) => (t.endedAt !== null && t.endedAt > (latest ?? 0) ? t.endedAt : latest),
    null,
  );
  const recentlyEnded =
    lastTicketEndedAt !== null &&
    Date.now() - lastTicketEndedAt < config.TICKET_HOLD_LONG_WINDOW_MIN * 60_000;
  const ticketHoldSeconds = recentlyEnded ? config.TICKET_HOLD_LONG_S : config.TICKET_HOLD_S;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Tickets</Text>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="x" size={22} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      {status === "notSetUp" ? (
        <Text style={styles.body}>
          Set up Screen Time first - go to the Screen time tab, authorize, and pick your apps.
        </Text>
      ) : (
        <>
          <View style={styles.pipsRow}>
            {Array.from({ length: config.TICKETS_PER_DAY }).map((_, i) => {
              const used = state.ticketsUsedToday[i] !== undefined;
              return (
                <View key={i} style={[styles.pip, used ? styles.pipUsed : styles.pipAvailable]}>
                  <Feather
                    name={used ? "check" : "circle"}
                    size={16}
                    color={used ? theme.colors.textDisabled : theme.colors.accent}
                  />
                </View>
              );
            })}
          </View>

          {status === "focus" && (
            <Text style={styles.statusText}>Focus session in progress - tickets unavailable.</Text>
          )}

          {status === "ticketActive" && (
            <>
              <Text style={styles.statusText}>
                {state.emergencyActive ? "Emergency unlock" : "Ticket active"} -{" "}
                {activeRemaining !== null ? formatMMSS(activeRemaining) : ""} left
              </Text>
              {state.activeTicket && (
                <Pressable style={styles.secondaryButton} onPress={engine.endTicketEarly}>
                  <Text style={styles.secondaryButtonText}>End ticket now</Text>
                </Pressable>
              )}
            </>
          )}

          {status === "locked" && (
            <HoldToConfirm
              label={`Hold to start a ${config.TICKET_MIN} min ticket`}
              holdSeconds={ticketHoldSeconds}
              onConfirm={engine.startTicket}
            />
          )}

          {status === "cooldown" && (
            <Text style={styles.statusText}>
              Cooldown - next ticket available in{" "}
              {cooldownRemaining !== null ? formatMMSS(cooldownRemaining) : "..."}
            </Text>
          )}

          {status === "outOfTickets" && (
            <Text style={styles.statusText}>
              All {config.TICKETS_PER_DAY} tickets used today - more tomorrow.
            </Text>
          )}

          {engine.emergencyEligible && (
            <View style={styles.emergencySection}>
              <Text style={styles.emergencyTitle}>Emergency unlock</Text>
              <Text style={styles.emergencyBody}>
                Once per day. Unlocks for {config.EMERGENCY_MIN} min. The rest of today pays no
                coins - coins you've already earned are safe.
              </Text>
              <HoldToConfirm
                label={`Hold ${config.EMERGENCY_HOLD_S}s to confirm`}
                holdSeconds={config.EMERGENCY_HOLD_S}
                onConfirm={engine.startEmergency}
                color={theme.colors.danger}
              />
            </View>
          )}
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
    marginBottom: 20,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  body: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  pipsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  pip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  pipAvailable: {
    backgroundColor: theme.colors.cardBackground,
  },
  pipUsed: {
    backgroundColor: theme.colors.screenBackground,
    borderWidth: 1,
    borderColor: theme.colors.divider,
  },
  statusText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    marginBottom: 16,
  },
  secondaryButton: {
    paddingVertical: 14,
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
  emergencySection: {
    marginTop: 32,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.divider,
    gap: 12,
  },
  emergencyTitle: {
    color: theme.colors.danger,
    fontSize: 15,
    fontWeight: "700",
  },
  emergencyBody: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
});
