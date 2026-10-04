/**
 * The ticket engine's persisted shape, plus the derived (never persisted)
 * status UI reads. See engineLogic.ts for the pure functions that produce
 * and transition this, and EngineProvider.tsx for the one place it's wired
 * to React + the native bridge.
 */

/** One ticket actually taken today - `endedAt` is null while it's running. */
export type TicketRecord = {
  startedAt: number;
  endedAt: number | null;
};

export type ActiveWindow = {
  startedAt: number;
  endsAt: number;
};

export type ActiveFocus = ActiveWindow & {
  minutes: number;
};

export type EngineState = {
  /** Bumped on a breaking shape change - see storage.ts. */
  version: 1;

  /** Whether the brainrot selection is locked all the time (outside tickets/focus/emergency). */
  armed: boolean;
  /** Set once, the first time `arm()` is ever called - for the one-time bonus and "first full day" rule. */
  armedAt: number | null;

  /** "Fast test mode" - see config.ts. Persisted so it survives a restart mid-test. */
  fastMode: boolean;

  /**
   * The engine day currently being tracked, as a "YYYY-MM-DD" key from
   * `dayKeyFor()` (a day runs 04:00->04:00, not midnight->midnight - see
   * config.ts's DAY_ROLLOVER_HOUR). Everything below it (tickets used,
   * emergency, streak-in-progress bookkeeping) describes *this* day only;
   * `reconcile()` settles and rolls it forward - see engineLogic.ts.
   */
  currentDay: string;
  ticketsUsedToday: TicketRecord[];
  activeTicket: ActiveWindow | null;
  /** Null once the cooldown has passed - `reconcile()` clears it, nothing reads a stale past timestamp as "still in cooldown". */
  cooldownUntil: number | null;

  emergencyUsedToday: boolean;
  emergencyActive: ActiveWindow | null;

  activeFocus: ActiveFocus | null;
  /** Minutes of focus already paid today - caps at ECONOMY.FOCUS_MAX_REWARDED_MIN. */
  focusMinutesRewardedToday: number;

  /** Consecutive clean days (see economy/settleDay.ts) - an emergency day neither advances nor resets this. */
  streak: number;
  /** The last day key `settleDay()` has already paid out for - prevents double-settling. */
  lastSettledDay: string | null;

  firstArmBonusPaid: boolean;
  firstFocusBonusPaid: boolean;

  /**
   * The most recent day-settlement result, shown once by app/summary.tsx
   * then cleared (`dismissSummary()`) - persisted so it survives the app
   * being killed between the settlement happening and the user seeing it.
   */
  pendingSummary: {
    day: string;
    totalCoins: number;
    breakdown: {
      unusedTickets: number;
      cleanDay: number;
      streakDaily: number;
      streakMilestone: number;
    };
  } | null;
};

export type EngineStatus =
  | "notSetUp"
  | "locked"
  | "ticketActive"
  | "cooldown"
  | "outOfTickets"
  | "focus";

/** What kind of "unlocked" window is live, when status is "ticketActive" - the status itself doesn't say which. */
export type UnlockKind = "ticket" | "emergency" | null;

export type EngineEvent = {
  t: number;
  kind: string;
  detail?: string;
};

/**
 * What a pure engineLogic.ts function wants done, described as data rather
 * than done directly - keeps every action/reconcile function testable with
 * zero native calls. EngineProvider.tsx is the only place that takes a list
 * of these and actually executes them (via deviceActivityBridge.ts and the
 * wallet).
 */
export type EngineEffect =
  | { type: "blockAll" }
  | { type: "unblockAll" }
  | { type: "scheduleReblock"; endsAtMs: number }
  | { type: "cancelReblock" }
  | { type: "configureShield" }
  | { type: "walletAccrue"; amount: number; source: string };

export type EngineResult = {
  state: EngineState;
  effects: EngineEffect[];
  /** Appended to the last-20 developer log - see EngineProvider.tsx. */
  events: string[];
};
