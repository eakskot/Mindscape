/**
 * Every tunable number the ticket engine runs on - normal mode and "fast
 * test mode" (for exercising day rollover, cooldowns etc. without actually
 * waiting real hours - see EngineProvider.tsx's `fastMode` flag, toggled in
 * the Screen Time tab's Developer section).
 *
 * The rules themselves (what a ticket/cooldown/emergency/focus/day actually
 * *does*) live in engineLogic.ts - this file is only the numbers.
 */

export type EngineConfig = {
  TICKETS_PER_DAY: number;
  TICKET_MIN: number;
  COOLDOWN_MIN: number;
  EMERGENCY_MIN: number;
  EMERGENCY_HOLD_S: number;
  FOCUS_OPTIONS_MIN: readonly number[];
  /** Local hour (0-23) a new engine day starts at - not midnight. */
  DAY_ROLLOVER_HOUR: number;
  /** Hold-to-confirm duration to start a ticket, in seconds. */
  TICKET_HOLD_S: number;
  /**
   * Hold-to-confirm duration jumps to this (seconds) if the last ticket
   * ended less than TICKET_HOLD_LONG_WINDOW_MIN ago - a speed bump against
   * immediately re-opening right after a ticket, without an actual cooldown
   * (cooldown already blocks a *new* ticket; this only matters for the rare
   * case the ticket was ended early and another is still available).
   */
  TICKET_HOLD_LONG_S: number;
  TICKET_HOLD_LONG_WINDOW_MIN: number;
};

export const NORMAL_CONFIG: EngineConfig = {
  TICKETS_PER_DAY: 3,
  TICKET_MIN: 20,
  COOLDOWN_MIN: 60,
  EMERGENCY_MIN: 10,
  EMERGENCY_HOLD_S: 60,
  FOCUS_OPTIONS_MIN: [15, 25, 45, 60],
  DAY_ROLLOVER_HOUR: 4,
  TICKET_HOLD_S: 3,
  TICKET_HOLD_LONG_S: 15,
  TICKET_HOLD_LONG_WINDOW_MIN: 120,
};

export const FAST_CONFIG: EngineConfig = {
  TICKETS_PER_DAY: 3,
  TICKET_MIN: 2,
  COOLDOWN_MIN: 1,
  EMERGENCY_MIN: 2,
  EMERGENCY_HOLD_S: 10,
  FOCUS_OPTIONS_MIN: [1, 2, 3, 4],
  DAY_ROLLOVER_HOUR: 4,
  TICKET_HOLD_S: 1,
  TICKET_HOLD_LONG_S: 3,
  TICKET_HOLD_LONG_WINDOW_MIN: 2,
};

export const configFor = (fastMode: boolean): EngineConfig =>
  fastMode ? FAST_CONFIG : NORMAL_CONFIG;

/** The one fixed DeviceActivity monitor name used for every reblock schedule. */
export const TICKET_END_ACTIVITY_NAME = "ticketEnd";

/**
 * The persisted id the user's "brainrot apps" selection lives under (see
 * BrainrotAppPicker.tsx's DeviceActivitySelectionSheetViewPersisted, keyed
 * by this same id, and deviceActivityBridge.ts's blockAll/unblockAll). One
 * fixed id because there's exactly one such selection - the whole list is
 * locked or unlocked together, never per-app.
 */
export const BRAINROT_SELECTION_ID = "brainrotApps";

/** A schedule shorter than this silently misbehaves - see deviceActivityBridge.ts. */
export const MIN_SCHEDULE_MINUTES = 15;
/** How far past the real end time the schedule's own window extends - safety margin. */
export const SCHEDULE_WINDOW_MINUTES = 16;
