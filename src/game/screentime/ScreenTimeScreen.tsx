import { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useWalletContext } from "../economy/WalletContext";
import { useEngine } from "../engine/EngineProvider";
import { theme } from "../../ui/TabBar/theme";
import { formatMMSS } from "../../ui/formatDuration";
import { useCountdown } from "../../ui/useCountdown";
import { BrainrotAppPicker } from "./BrainrotAppPicker";
import { useAuthorization } from "./useAuthorization";
import { makeStyles, useTheme } from "../../ui/theme";

/**
 * The real Screen Time tab: setup (authorize -> pick apps -> Activate) when
 * the engine isn't armed yet, then the live dashboard once it is. See
 * EngineProvider.tsx for everything this reads/calls - this file owns no
 * engine rules itself, only how they're displayed.
 */
export default function ScreenTimeScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const auth = useAuthorization();
  const engine = useEngine();

  if (!auth.isAvailable) {
    // iOS only, and the Simulator has no Screen Time data at all - see
    // CLAUDE.md. Both land here instead of a broken authorize button.
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.title}>{theme.labels.screentime}</Text>
        <Text style={styles.body}>
          Screen Time isn't available here - it needs a physical iPhone
          signed into iCloud, not the Simulator (and iOS only, no Android
          equivalent).
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 48 }}
    >
      <Text style={styles.title}>{theme.labels.screentime}</Text>

      {!engine.state.armed ? (
        <SetupFlow auth={auth} />
      ) : (
        <Dashboard />
      )}

      <DeveloperSection />
    </ScrollView>
  );
}

function SetupFlow({ auth }: { auth: ReturnType<typeof useAuthorization> }) {
  const styles = useStyles();
  const engine = useEngine();
  return (
    <View style={styles.section}>
      <Text style={styles.statusLine}>
        Authorized: {auth.isAuthorized ? "yes" : "no"}
      </Text>

      {!auth.isAuthorized && (
        <Pressable style={styles.button} onPress={auth.requestAccess}>
          <Text style={styles.buttonText}>Request access</Text>
        </Pressable>
      )}

      {auth.isAuthorized && (
        <>
          <Text style={styles.sectionLabel}>
            Pick 1-3 apps - once activated, they're locked all the time except during a
            ticket, focus session, or emergency unlock.
          </Text>
          <BrainrotAppPicker />
          <Pressable style={[styles.button, styles.spacedTop]} onPress={engine.arm}>
            <Text style={styles.buttonText}>Activate</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const STATUS_LABEL: Record<string, string> = {
  notSetUp: "Not set up",
  locked: "Locked",
  ticketActive: "Unlocked",
  cooldown: "Cooldown",
  outOfTickets: "Out of tickets",
  focus: "Focus",
};

function Dashboard() {
  const styles = useStyles();
  const engine = useEngine();
  const { state, status, config } = engine;

  const countdownTarget =
    state.activeTicket?.endsAt ??
    state.emergencyActive?.endsAt ??
    state.activeFocus?.endsAt ??
    state.cooldownUntil ??
    null;
  const remaining = useCountdown(countdownTarget);

  // Same staleness fix as TodayCard.tsx/tickets.tsx: `status` only
  // recomputes when reconcile() runs, which a countdown reaching zero while
  // this screen sits open doesn't trigger by itself (confirmed on-device
  // 2026-10-07 - the Focus readout stuck at 0:00 here specifically, since
  // this screen didn't have the fix the other two already had).
  const reconciledForRef = useRef<number | null>(null);
  useEffect(() => {
    if (countdownTarget !== null && remaining === 0 && reconciledForRef.current !== countdownTarget) {
      reconciledForRef.current = countdownTarget;
      engine.forceReconcile();
    }
  }, [countdownTarget, remaining, engine]);

  return (
    <View style={styles.section}>
      <View style={styles.statusRow}>
        <Text style={styles.statusBig}>{STATUS_LABEL[status] ?? status}</Text>
        {remaining !== null && (
          <Text style={styles.statusCountdown}>{formatMMSS(remaining)}</Text>
        )}
      </View>

      <View style={styles.pipsRow}>
        {Array.from({ length: config.TICKETS_PER_DAY }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.pip,
              state.ticketsUsedToday[i] !== undefined ? styles.pipUsed : styles.pipAvailable,
            ]}
          />
        ))}
        <Text style={styles.pipsLabel}>
          {config.TICKETS_PER_DAY - state.ticketsUsedToday.length} / {config.TICKETS_PER_DAY}{" "}
          tickets left today
        </Text>
      </View>

      <Text style={styles.streakLine}>🔥 {state.streak} day streak</Text>

      {state.activeTicket && (
        <Pressable style={[styles.button, styles.dangerButton]} onPress={engine.endTicketEarly}>
          <Text style={styles.buttonText}>End ticket now</Text>
        </Pressable>
      )}

      <Pressable style={[styles.secondaryButton, styles.spacedTop]} onPress={engine.disarm}>
        <Text style={styles.secondaryButtonText}>Disarm</Text>
      </Pressable>
    </View>
  );
}

function DeveloperSection() {
  const { palette } = useTheme();
  const styles = useStyles();
  const engine = useEngine();
  const wallet = useWalletContext();

  return (
    <View style={styles.devSection}>
      <Text style={styles.devTitle}>Developer</Text>

      <View style={styles.devRow}>
        <Text style={styles.sectionLabel}>Fast test mode</Text>
        <Switch
          value={engine.state.fastMode}
          onValueChange={engine.setFastMode}
          trackColor={{ true: palette.accent }}
        />
      </View>

      <View style={styles.devButtonRow}>
        <Pressable style={[styles.secondaryButton, styles.devButton]} onPress={engine.forceReconcile}>
          <Text style={styles.secondaryButtonText}>Force reconcile</Text>
        </Pressable>
        <Pressable style={[styles.secondaryButton, styles.devButton]} onPress={engine.resetDay}>
          <Text style={styles.secondaryButtonText}>Reset day</Text>
        </Pressable>
      </View>
      <Pressable
        style={[styles.button, styles.dangerButton, styles.spacedTop]}
        onPress={engine.unblockEverything}
      >
        <Text style={styles.buttonText}>Unblock everything (safety hatch)</Text>
      </Pressable>

      <Text style={[styles.sectionLabel, styles.spacedTop]}>Last events</Text>
      <View style={styles.logBox}>
        {engine.events.length === 0 ? (
          <Text style={styles.logEmpty}>Nothing yet.</Text>
        ) : (
          [...engine.events].reverse().map((e, i) => (
            <Text key={i} style={styles.logLine}>
              {e}
            </Text>
          ))
        )}
      </View>

      <Text style={[styles.sectionLabel, styles.spacedTop]}>Wallet ledger (last 100)</Text>
      <View style={styles.logBox}>
        {wallet.ledger.length === 0 ? (
          <Text style={styles.logEmpty}>Nothing yet.</Text>
        ) : (
          [...wallet.ledger]
            .reverse()
            .slice(0, 20)
            .map((entry, i) => (
              <Text key={i} style={styles.logLine}>
                {new Date(entry.t).toLocaleTimeString()} · {entry.amount > 0 ? "+" : ""}
                {entry.amount} · {entry.source}
              </Text>
            ))
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: {
    flex: 1,
    backgroundColor: c.bg,
    paddingHorizontal: 20,
  },
  title: {
    color: c.textPrimary,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
  },
  body: {
    color: c.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  statusLine: {
    color: c.textSecondary,
    fontSize: 13,
    marginBottom: 16,
  },
  sectionLabel: {
    color: c.textSecondary,
    fontSize: 13,
    marginBottom: 8,
  },
  button: {
    paddingVertical: 14,
    borderRadius: theme.radii.chip,
    backgroundColor: c.accent,
    alignItems: "center",
  },
  dangerButton: {
    backgroundColor: c.danger,
  },
  buttonText: {
    color: c.accentText,
    fontSize: 15,
    fontWeight: "600",
  },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: theme.radii.chip,
    borderWidth: 1,
    borderColor: c.divider,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: c.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  spacedTop: {
    marginTop: 12,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12,
    marginBottom: 16,
  },
  statusBig: {
    color: c.textPrimary,
    fontSize: 24,
    fontWeight: "700",
  },
  statusCountdown: {
    color: c.accent,
    fontSize: 20,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  pipsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  pip: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  pipAvailable: {
    backgroundColor: c.accent,
  },
  pipUsed: {
    backgroundColor: c.divider,
  },
  pipsLabel: {
    color: c.textSecondary,
    fontSize: 13,
    marginLeft: 8,
  },
  streakLine: {
    color: c.textPrimary,
    fontSize: 15,
    marginBottom: 16,
  },
  devSection: {
    marginTop: 12,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.divider,
  },
  devTitle: {
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  devRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  devButtonRow: {
    flexDirection: "row",
    gap: 8,
  },
  devButton: {
    flex: 1,
  },
  logBox: {
    backgroundColor: c.surfaceRaised,
    borderRadius: theme.radii.card,
    padding: 12,
    marginBottom: 8,
  },
  logEmpty: {
    color: c.textDisabled,
    fontSize: 12,
  },
  logLine: {
    color: c.textSecondary,
    fontSize: 12,
    marginBottom: 4,
    fontVariant: ["tabular-nums"],
  },
}));
