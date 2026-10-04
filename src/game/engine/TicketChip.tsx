import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";

import { formatMMSS } from "../../ui/formatDuration";
import { theme } from "../../ui/TabBar/theme";
import { useCountdown } from "../../ui/useCountdown";
import { useEngine } from "./EngineProvider";

/**
 * Sits next to CurrencyHud on the Village screen (see HomeScreen.tsx) -
 * "3 left" normally, a live countdown while a ticket/emergency/cooldown is
 * running, or nothing at all before the engine's ever been set up (there's
 * nothing useful to show yet - the Screen time tab's setup flow is the
 * entry point, not this chip). Tap -> /tickets.
 */
export function TicketChip() {
  const engine = useEngine();
  const { state, status, config } = engine;

  const countdownTarget =
    state.activeTicket?.endsAt ?? state.emergencyActive?.endsAt ?? state.cooldownUntil ?? null;
  const remaining = useCountdown(countdownTarget);

  if (status === "notSetUp") return null;

  const label = (() => {
    switch (status) {
      case "ticketActive":
        return remaining !== null ? formatMMSS(remaining) : "...";
      case "cooldown":
        return remaining !== null ? formatMMSS(remaining) : "...";
      case "outOfTickets":
        return "0 left";
      case "focus":
        return "Focus";
      case "locked":
      default:
        return `${config.TICKETS_PER_DAY - state.ticketsUsedToday.length} left`;
    }
  })();

  return (
    <Pressable style={styles.chip} onPress={() => router.push("/tickets")}>
      <Feather name="tag" size={13} color={theme.colors.accent} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#000000cc",
  },
  label: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
