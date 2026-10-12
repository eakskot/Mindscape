import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { nextGoal } from "../economy/nextGoal";
import { formatMMSS } from "../../ui/formatDuration";
import { strings } from "../../ui/strings";
import { theme } from "../../ui/TabBar/theme";
import { useTabBarHeight } from "../../ui/TabBar/TabBar";
import { useCountdown } from "../../ui/useCountdown";
import { useEngine } from "./EngineProvider";
import type { EngineStatus } from "./types";

/** Colors with no token in theme.ts yet - one object so a future theme system can absorb them. */
const localColors = {
  coin: "#ffd978",
  cardBorder: "rgba(255, 255, 255, 0.10)",
  progressTrack: "rgba(255, 255, 255, 0.12)",
};

/** Gap between the card and the tab bar (incl. the Focus button's overhang). */
const GAP_ABOVE_TAB_BAR = 10;

type TodayCardProps = {
  balance: number;
  /**
   * False while editing the village (or while another tab is focused) - the
   * card then draws nothing, but stays *mounted*: its zero-countdown
   * reconcile watcher below must keep running regardless. See the doc
   * comment.
   */
  visible: boolean;
};

/**
 * The Village screen's "what's my status, what's my next step" card, pinned
 * just above the tab bar. One line of engine state + one primary action,
 * plus one optional goal line from the economy. Detailed metrics belong on
 * Profile, not here - see CLAUDE.md.
 *
 * Doubles as the app's one always-mounted "did a countdown just hit zero"
 * watcher (inherited from the old TicketChip it replaced): bottom-tabs
 * keeps the Village screen mounted regardless of which tab is active, so
 * this is the most reliable place to `forceReconcile()` the moment a
 * ticket/emergency/focus/cooldown window ends - `engine.status` otherwise
 * only updates when *something* calls reconcile, and a countdown reaching
 * zero while just sitting on screen doesn't (confirmed on-device
 * 2026-10-05). That's why `visible` hides the card's output instead of the
 * parent unmounting it.
 *
 * Touches: only the card's own box is touchable - the wrapper is
 * `box-none`, and the card is a sibling of the world's GestureDetector (see
 * HomeScreen.tsx), never inside it, so pans/pinches outside the card's
 * area reach the world unchanged.
 */
export function TodayCard({ balance, visible }: TodayCardProps) {
  const engine = useEngine();
  const { state, status, config } = engine;

  // Same target chain as ScreenTimeScreen's Dashboard - whichever window is
  // running. Only one of ticket/emergency/focus is ever active at a time.
  const watchTarget =
    state.activeTicket?.endsAt ??
    state.emergencyActive?.endsAt ??
    state.activeFocus?.endsAt ??
    state.cooldownUntil ??
    null;
  const remaining = useCountdown(watchTarget);

  const reconciledForRef = useRef<number | null>(null);
  useEffect(() => {
    if (watchTarget !== null && remaining === 0 && reconciledForRef.current !== watchTarget) {
      reconciledForRef.current = watchTarget;
      engine.forceReconcile();
    }
  }, [watchTarget, remaining, engine]);

  const tabBarHeight = useTabBarHeight();
  const goal = useMemo(() => nextGoal(balance), [balance]);

  if (!visible) return null;

  const countdown = remaining !== null ? formatMMSS(remaining) : "…";
  const ticketsLeft = Math.max(0, config.TICKETS_PER_DAY - state.ticketsUsedToday.length);
  const resetHour = `${String(config.DAY_ROLLOVER_HOUR).padStart(2, "0")}:00`;

  const main = mainLine(status, { countdown, ticketsLeft, resetHour });

  return (
    <View
      style={[styles.wrapper, { bottom: tabBarHeight + GAP_ABOVE_TAB_BAR }]}
      pointerEvents="box-none"
    >
      <View style={styles.card}>
        <Pressable
          style={styles.mainRow}
          onPress={main.onPress}
          accessibilityRole="button"
          accessibilityLabel={main.text}
        >
          <Feather name={main.icon} size={16} color={theme.colors.accent} />
          <Text style={styles.mainText} numberOfLines={1}>
            {main.text}
          </Text>
          {main.action ? (
            <View style={styles.actionButton}>
              <Text style={styles.actionText}>{main.action}</Text>
            </View>
          ) : (
            <Feather name="chevron-right" size={16} color={theme.colors.textSecondary} />
          )}
        </Pressable>

        {goal && (
          <Pressable
            style={styles.goalRow}
            onPress={() => router.navigate("/shop")}
            accessibilityRole="button"
          >
            {goal.kind === "canAfford" ? (
              <Text style={styles.goalText} numberOfLines={1}>
                {strings.today.canAfford(goal.label)}
              </Text>
            ) : (
              <>
                <Text style={styles.goalText} numberOfLines={1}>
                  {strings.today.goal(goal.label, balance, goal.price)}
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.min(100, (balance / goal.price) * 100)}%` },
                    ]}
                  />
                </View>
              </>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

type MainLine = {
  text: string;
  icon: keyof typeof Feather.glyphMap;
  /** A visible button label - only for the states with a clear next step. */
  action?: string;
  onPress: () => void;
};

function mainLine(
  status: EngineStatus,
  { countdown, ticketsLeft, resetHour }: { countdown: string; ticketsLeft: number; resetHour: string },
): MainLine {
  const toTickets = () => router.push("/tickets");
  switch (status) {
    case "notSetUp":
      return {
        text: strings.today.notSetUp,
        icon: "lock",
        action: strings.today.setUpAction,
        onPress: () => router.navigate("/screentime"),
      };
    case "ticketActive":
      return { text: strings.today.ticketActive(countdown), icon: "unlock", onPress: toTickets };
    case "cooldown":
      return { text: strings.today.cooldown(countdown), icon: "clock", onPress: toTickets };
    case "outOfTickets":
      return { text: strings.today.outOfTickets(resetHour), icon: "moon", onPress: toTickets };
    case "focus":
      return {
        text: strings.today.focus(countdown),
        icon: "target",
        onPress: () => router.push("/focus"),
      };
    case "locked":
    default:
      return {
        text: strings.today.locked(ticketsLeft),
        icon: "lock",
        action: strings.today.useTicketAction,
        onPress: toTickets,
      };
  }
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 12,
    right: 12,
  },
  card: {
    borderRadius: theme.radii.card,
    backgroundColor: theme.colors.cardBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: localColors.cardBorder,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    overflow: "visible",
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  mainText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  actionButton: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: theme.radii.chip,
    backgroundColor: theme.colors.accent,
  },
  actionText: {
    color: theme.colors.playIcon,
    fontSize: 13,
    fontWeight: "700",
  },
  goalRow: {
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.divider,
  },
  goalText: {
    color: localColors.coin,
    fontSize: 12,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: localColors.progressTrack,
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: localColors.coin,
  },
});
