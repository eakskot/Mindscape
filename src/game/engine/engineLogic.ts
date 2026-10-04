import { ECONOMY } from "../economy/economyConfig";
import { settleDay } from "../economy/settleDay";
import { configFor, type EngineConfig } from "./config";
import type {
  EngineEffect,
  EngineResult,
  EngineState,
  EngineStatus,
  TicketRecord,
} from "./types";

/**
 * The whole ticket engine's rules, as pure functions: `(state, ...) =>
 * { state, effects, events }`. Nothing here calls a native API or touches
 * storage - see types.ts's `EngineEffect` and EngineProvider.tsx, the one
 * place effects actually run. Keeps every rule here testable by just
 * fabricating a state and a `now`, which matters a lot for a system whose
 * real tests (Phase 3) require actually waiting out hour-long timers.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A day runs config.DAY_ROLLOVER_HOUR -> next day's same hour, not midnight->midnight. */
export function dayKeyFor(ts: number, rolloverHour: number): string {
  const d = new Date(ts);
  if (d.getHours() < rolloverHour) {
    d.setDate(d.getDate() - 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The engine-day boundary (as a timestamp) that follows `dayKey`. */
function nextDayBoundary(dayKey: string, rolloverHour: number): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  const boundary = new Date(y, m - 1, d, rolloverHour, 0, 0, 0);
  // dayKeyFor(ts) folds pre-rollover-hour timestamps back a day, so the
  // boundary that *follows* a given day key is that calendar day's
  // rollover hour plus one day.
  boundary.setDate(boundary.getDate() + 1);
  return boundary.getTime();
}

export function initialEngineState(now: number, fastMode = false): EngineState {
  return {
    version: 1,
    armed: false,
    armedAt: null,
    fastMode,
    currentDay: dayKeyFor(now, configFor(fastMode).DAY_ROLLOVER_HOUR),
    ticketsUsedToday: [],
    activeTicket: null,
    cooldownUntil: null,
    emergencyUsedToday: false,
    emergencyActive: null,
    activeFocus: null,
    focusMinutesRewardedToday: 0,
    streak: 0,
    lastSettledDay: null,
    firstArmBonusPaid: false,
    firstFocusBonusPaid: false,
    pendingSummary: null,
  };
}

export function deriveStatus(state: EngineState, now: number): EngineStatus {
  if (!state.armed) return "notSetUp";
  if (state.activeFocus && now < state.activeFocus.endsAt) return "focus";
  if (state.activeTicket && now < state.activeTicket.endsAt) return "ticketActive";
  if (state.emergencyActive && now < state.emergencyActive.endsAt) return "ticketActive";
  if (state.cooldownUntil && now < state.cooldownUntil) return "cooldown";
  if (state.ticketsUsedToday.length >= configFor(state.fastMode).TICKETS_PER_DAY) {
    return "outOfTickets";
  }
  return "locked";
}

/** Whether the emergency valve can be used right now - "only when no ticket is available ... not during focus". */
export function emergencyEligible(state: EngineState, now: number): boolean {
  if (!state.armed || state.emergencyUsedToday) return false;
  const status = deriveStatus(state, now);
  return status === "cooldown" || status === "outOfTickets";
}

export function arm(state: EngineState, now: number): EngineResult {
  if (state.armed) return { state, effects: [], events: [] };

  const effects: EngineEffect[] = [
    { type: "configureShield" },
    { type: "blockAll" },
  ];
  const events = ["armed"];
  if (!state.firstArmBonusPaid) {
    effects.push({
      type: "walletAccrue",
      amount: ECONOMY.FIRST_ARM_BONUS,
      source: "firstArm",
    });
    events.push(`firstArmBonus +${ECONOMY.FIRST_ARM_BONUS}`);
  }

  return {
    state: {
      ...state,
      armed: true,
      armedAt: state.armedAt ?? now,
      firstArmBonusPaid: true,
    },
    effects,
    events,
  };
}

export function disarm(state: EngineState): EngineResult {
  if (!state.armed) return { state, effects: [], events: [] };
  const effects: EngineEffect[] = [{ type: "unblockAll" }, { type: "cancelReblock" }];
  return {
    state: {
      ...state,
      armed: false,
      activeTicket: null,
      emergencyActive: null,
      cooldownUntil: null,
    },
    effects,
    events: ["disarmed"],
  };
}

export function startTicket(state: EngineState, now: number): EngineResult {
  if (deriveStatus(state, now) !== "locked") {
    return { state, effects: [], events: ["startTicket: ignored (not locked)"] };
  }
  const config = configFor(state.fastMode);
  const endsAt = now + config.TICKET_MIN * 60_000;
  const record: TicketRecord = { startedAt: now, endedAt: null };

  return {
    state: {
      ...state,
      activeTicket: { startedAt: now, endsAt },
      ticketsUsedToday: [...state.ticketsUsedToday, record],
    },
    effects: [{ type: "unblockAll" }, { type: "scheduleReblock", endsAtMs: endsAt }],
    events: [`ticket started, ends ${new Date(endsAt).toLocaleTimeString()}`],
  };
}

/** Shared by "end ticket early" and reconcile() noticing a ticket's time is up. */
function closeTicket(state: EngineState, endedAt: number): EngineState {
  const config = configFor(state.fastMode);
  const tickets = state.ticketsUsedToday.map((t) =>
    t.endedAt === null && state.activeTicket && t.startedAt === state.activeTicket.startedAt
      ? { ...t, endedAt }
      : t,
  );
  return {
    ...state,
    activeTicket: null,
    ticketsUsedToday: tickets,
    cooldownUntil: endedAt + config.COOLDOWN_MIN * 60_000,
  };
}

export function endTicketEarly(state: EngineState, now: number): EngineResult {
  if (!state.activeTicket) return { state, effects: [], events: [] };
  return {
    state: closeTicket(state, now),
    effects: [{ type: "blockAll" }, { type: "cancelReblock" }],
    events: ["ticket ended early"],
  };
}

export function startEmergency(state: EngineState, now: number): EngineResult {
  if (!emergencyEligible(state, now)) {
    return { state, effects: [], events: ["startEmergency: ignored (not eligible)"] };
  }
  const config = configFor(state.fastMode);
  const endsAt = now + config.EMERGENCY_MIN * 60_000;
  return {
    state: {
      ...state,
      emergencyActive: { startedAt: now, endsAt },
      emergencyUsedToday: true,
    },
    effects: [{ type: "unblockAll" }, { type: "scheduleReblock", endsAtMs: endsAt }],
    events: ["emergency valve used"],
  };
}

/**
 * Starting focus while a ticket is running ends that ticket immediately
 * (same close-and-cooldown as `endTicketEarly`) - "While it runs, tickets
 * can't be started, and an active ticket is ended immediately" governs both
 * directions of that rule, this is the half where focus wins.
 */
export function startFocus(state: EngineState, minutes: number, now: number): EngineResult {
  if (state.activeFocus) return { state, effects: [], events: [] };

  const endingTicket = state.activeTicket !== null;
  const base = endingTicket ? closeTicket(state, now) : state;
  const effects: EngineEffect[] = endingTicket
    ? [{ type: "blockAll" }, { type: "cancelReblock" }]
    : [];

  return {
    state: {
      ...base,
      activeFocus: { minutes, startedAt: now, endsAt: now + minutes * 60_000 },
    },
    effects,
    events: [
      endingTicket
        ? `focus started (${minutes}m) - active ticket ended early`
        : `focus started (${minutes}m)`,
    ],
  };
}

export function giveUpFocus(state: EngineState): EngineResult {
  if (!state.activeFocus) return { state, effects: [], events: [] };
  return {
    state: { ...state, activeFocus: null },
    effects: [],
    events: ["focus given up - no reward"],
  };
}

/** Pulled out of reconcile so completion always pays the same way, whatever triggers it. */
function completeFocus(state: EngineState, focusEndsAt: number): EngineResult {
  const focus = state.activeFocus;
  if (!focus) return { state, effects: [], events: [] };

  // "Focus only counts if the engine is armed" - and nothing after the
  // emergency valve has been used that day.
  if (!state.armed || state.emergencyUsedToday) {
    return {
      state: { ...state, activeFocus: null },
      effects: [],
      events: ["focus completed - not rewarded (unarmed or emergency used today)"],
    };
  }

  const rewardableMinutes = Math.max(
    0,
    Math.min(
      focus.minutes,
      ECONOMY.FOCUS_MAX_REWARDED_MIN - state.focusMinutesRewardedToday,
    ),
  );
  const amount = Math.floor(rewardableMinutes * ECONOMY.FOCUS_COIN_PER_MIN);

  const effects: EngineEffect[] = [];
  const events: string[] = [];
  if (amount > 0) {
    effects.push({ type: "walletAccrue", amount, source: "focus" });
    events.push(`focus completed - +${amount} coins`);
  } else {
    events.push("focus completed - daily focus cap reached, no reward");
  }

  let firstFocusBonusPaid = state.firstFocusBonusPaid;
  if (!firstFocusBonusPaid && amount > 0) {
    effects.push({
      type: "walletAccrue",
      amount: ECONOMY.FIRST_FOCUS_BONUS,
      source: "firstFocus",
    });
    events.push(`firstFocusBonus +${ECONOMY.FIRST_FOCUS_BONUS}`);
    firstFocusBonusPaid = true;
  }

  return {
    state: {
      ...state,
      activeFocus: null,
      focusMinutesRewardedToday: state.focusMinutesRewardedToday + rewardableMinutes,
      firstFocusBonusPaid,
    },
    effects,
    events,
  };
}

export type ReconcileInputs = {
  isShieldActive: boolean;
  isAuthorized: boolean;
};

/**
 * Runs at startup and on every AppState "active" (see EngineProvider.tsx).
 * In order: settle and roll forward any engine day(s) that have fully
 * elapsed, expire a finished ticket/emergency window, pay out a finished
 * focus session, then repair fail-open drift (armed, nothing should be
 * unlocked right now, yet the shield somehow isn't up).
 *
 * Settling a *skipped* day (the app was never opened on it) assumes `armed`
 * was whatever it currently is for that whole day, with zero tickets/
 * emergency used - a deliberate simplification for a single-user app: there
 * is no record of exactly when a toggle happened mid-gap, only what it is
 * now and what it was on the last day actually tracked.
 */
export function reconcile(
  state: EngineState,
  now: number,
  inputs: ReconcileInputs,
): EngineResult {
  let s = state;
  const effects: EngineEffect[] = [];
  const events: string[] = [];
  const config = configFor(s.fastMode);

  // Authorization revoked outside the app - settle what's pending as
  // nothing earned and disarm, rather than silently keep "armed" with a
  // selection Apple no longer honors (fail open, never pay on an uncertain
  // signal - see CLAUDE.md).
  if (s.armed && !inputs.isAuthorized) {
    events.push("authorization no longer approved - disarming, no reward for today");
    s = { ...s, armed: false, activeTicket: null, emergencyActive: null, cooldownUntil: null };
    effects.push({ type: "unblockAll" }, { type: "cancelReblock" });
  }

  // Roll the day forward, settling each elapsed day as we go.
  let guard = 0;
  while (dayKeyFor(now, config.DAY_ROLLOVER_HOUR) !== s.currentDay && guard < 3650) {
    guard++;
    const result = settleDay({
      armed: s.armed,
      ticketsUsed: s.ticketsUsedToday.length,
      ticketsPerDay: config.TICKETS_PER_DAY,
      usedEmergency: s.emergencyUsedToday,
      previousStreak: s.streak,
    });
    const settledDay = s.currentDay;
    if (result.totalCoins > 0) {
      effects.push({ type: "walletAccrue", amount: result.totalCoins, source: "daySettlement" });
    }
    events.push(
      `settled ${settledDay}: +${result.totalCoins} coins, streak -> ${result.newStreak}`,
    );

    const nextDay = dayKeyFor(nextDayBoundary(s.currentDay, config.DAY_ROLLOVER_HOUR), config.DAY_ROLLOVER_HOUR);
    s = {
      ...s,
      currentDay: nextDay,
      lastSettledDay: settledDay,
      streak: result.newStreak,
      ticketsUsedToday: [],
      emergencyUsedToday: false,
      focusMinutesRewardedToday: 0,
      // Known simplification, not a non-issue: a cooldown *can* genuinely
      // span the rollover hour (any ticket ending within COOLDOWN_MIN of
      // it), and clearing it here means that cooldown is cut short at the
      // boundary instead of carrying over - a ticket becomes available a
      // little earlier than the full 60 minutes in that specific window.
      // Accepted for now (rare - needs a ticket started in roughly the
      // last COOLDOWN_MIN before DAY_ROLLOVER_HOUR - and low-stakes: it
      // only ever makes a ticket available slightly sooner, never blocks
      // one that should be available). activeTicket/emergencyActive are
      // cleared the same way but that part really is moot - both are far
      // shorter than COOLDOWN_MIN, let alone a day.
      activeTicket: null,
      cooldownUntil: null,
      emergencyActive: null,
      // Shown once by app/summary.tsx - only when a settlement actually
      // paid something ("shown once when a settlement paid something").
      // Overwritten (not accumulated) if several days settle in one
      // reconcile - only the most recent is worth surfacing.
      pendingSummary:
        result.totalCoins > 0
          ? { day: settledDay, totalCoins: result.totalCoins, breakdown: result.breakdown }
          : s.pendingSummary,
    };
  }

  // Expire a finished ticket.
  if (s.activeTicket && now >= s.activeTicket.endsAt) {
    events.push("ticket expired - re-locking");
    s = closeTicket(s, s.activeTicket.endsAt);
    effects.push({ type: "blockAll" }, { type: "cancelReblock" });
  }

  // Expire a finished emergency window.
  if (s.emergencyActive && now >= s.emergencyActive.endsAt) {
    events.push("emergency window expired - re-locking");
    s = { ...s, emergencyActive: null };
    effects.push({ type: "blockAll" }, { type: "cancelReblock" });
  }

  // Clear a lapsed cooldown so status recomputes cleanly.
  if (s.cooldownUntil && now >= s.cooldownUntil) {
    s = { ...s, cooldownUntil: null };
  }

  // Pay out a finished focus session.
  if (s.activeFocus && now >= s.activeFocus.endsAt) {
    const result = completeFocus(s, s.activeFocus.endsAt);
    s = result.state;
    effects.push(...result.effects);
    events.push(...result.events);
  }

  // Fail-open repair: should be locked right now, but isn't actually shielded.
  const shouldBeLocked =
    s.armed && !s.activeTicket && !s.emergencyActive && !s.activeFocus;
  if (shouldBeLocked && !inputs.isShieldActive) {
    events.push("fail-open repair: re-applying block");
    effects.push({ type: "blockAll" });
  }

  return { state: s, effects, events };
}

void DAY_MS; // kept for clarity/future use (e.g. multi-day-gap diagnostics), not currently read
export type { EngineConfig };
