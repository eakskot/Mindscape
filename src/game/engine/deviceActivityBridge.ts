import * as ReactNativeDeviceActivity from "react-native-device-activity";

import {
  BRAINROT_SELECTION_ID,
  MIN_SCHEDULE_MINUTES,
  SCHEDULE_WINDOW_MINUTES,
  TICKET_END_ACTIVITY_NAME,
} from "./config";

/**
 * The only file that imports react-native-device-activity's actual
 * blocking/scheduling/shield APIs. engineLogic.ts never touches the
 * library directly - it describes what it wants as an `EngineEffect`
 * (see types.ts), and EngineProvider.tsx runs each one through exactly one
 * of the functions below. Keeps the rules pure and testable; keeps "what
 * Apple's API actually needs" in one place.
 */

export function blockAll(): void {
  ReactNativeDeviceActivity.blockSelection({
    activitySelectionId: BRAINROT_SELECTION_ID,
  });
}

export function unblockAll(): void {
  ReactNativeDeviceActivity.unblockSelection({
    activitySelectionId: BRAINROT_SELECTION_ID,
  });
}

export function isShieldActive(): boolean {
  return ReactNativeDeviceActivity.isShieldActive();
}

/**
 * Schedules a one-shot native re-block at `endsAtMs`, surviving the app
 * being killed - the DeviceActivityMonitor extension itself runs the
 * configured "blockSelection" action on `intervalDidStart`, independent of
 * our JS process (see CLAUDE.md and targets/ActivityMonitorExtension).
 *
 * Uses ONE fixed activity name ("ticketEnd") for every ticket/emergency
 * window - Apple caps concurrent monitors at 20, and nothing here ever
 * needs more than one pending reblock at a time, so a fixed name keeps
 * this simple: stop whatever's scheduled under it before scheduling the
 * next one, rather than accumulating names.
 *
 * `configureActions` is re-registered on every call rather than once ever -
 * it's just a UserDefaults write (cheap, idempotent, no native round trip),
 * and doing it here means the action config can never drift out of sync
 * with what this function schedules.
 *
 * Schedule timing, explained because none of it is arbitrary:
 * - DeviceActivitySchedule silently misbehaves under ~15 minutes (Apple's
 *   own constraint, not this library's) - so the window is never just
 *   [endsAt, endsAt], it's padded to SCHEDULE_WINDOW_MINUTES (16) wide.
 * - intervalStart is endsAt rounded UP to the next whole minute (schedules
 *   are minute-resolution; rounding down could fire the reblock early).
 * - repeats: false - this is a one-shot for this specific ticket/emergency
 *   window, not a recurring daily schedule.
 */
export async function scheduleReblock(endsAtMs: number): Promise<void> {
  ReactNativeDeviceActivity.stopMonitoring([TICKET_END_ACTIVITY_NAME]);

  ReactNativeDeviceActivity.configureActions({
    activityName: TICKET_END_ACTIVITY_NAME,
    callbackName: "intervalDidStart",
    actions: [
      {
        type: "blockSelection",
        familyActivitySelectionId: BRAINROT_SELECTION_ID,
      },
    ],
  });

  const start = new Date(endsAtMs);
  // Round up to the next whole minute.
  if (start.getSeconds() > 0 || start.getMilliseconds() > 0) {
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 1);
  }
  const end = new Date(
    start.getTime() + SCHEDULE_WINDOW_MINUTES * 60_000,
  );
  void MIN_SCHEDULE_MINUTES; // documents the constraint the window above satisfies

  await ReactNativeDeviceActivity.startMonitoring(
    TICKET_END_ACTIVITY_NAME,
    {
      intervalStart: {
        year: start.getFullYear(),
        month: start.getMonth() + 1,
        day: start.getDate(),
        hour: start.getHours(),
        minute: start.getMinutes(),
      },
      intervalEnd: {
        year: end.getFullYear(),
        month: end.getMonth() + 1,
        day: end.getDate(),
        hour: end.getHours(),
        minute: end.getMinutes(),
      },
      repeats: false,
    },
    [],
  );
}

export function cancelReblock(): void {
  ReactNativeDeviceActivity.stopMonitoring([TICKET_END_ACTIVITY_NAME]);
}

/**
 * ONE generic, state-agnostic shield - see CLAUDE.md for why there are no
 * per-status variants (the text would go stale while the app is dead and
 * can't update it). Configured once at arm time and whenever the app
 * starts, not re-configured per ticket/cooldown/etc.
 *
 * The primary button's `{type: "openApp"}` action is confirmed non-
 * functional on-device (2026-10-04 - see CLAUDE.md): it closes the shield
 * but never reopens Mindscape (the library's own implementation opens a
 * hardcoded, unrelated URL scheme via a disconnected `NSExtensionContext`).
 * Kept in the action list anyway (harmless, and might start working in a
 * future library version) alongside the real mechanism: a local
 * notification whose tap is handled in app/_layout.tsx to deep-link to
 * /tickets - see src/game/engine/notifications.ts.
 */
export function configureShield(): void {
  ReactNativeDeviceActivity.updateShield(
    {
      backgroundColor: { red: 15, green: 17, blue: 21 },
      title: "Locked by Mindscape",
      titleColor: { red: 255, green: 255, blue: 255 },
      subtitle: "Open Mindscape to use a ticket.",
      subtitleColor: { red: 138, green: 143, blue: 152 },
      primaryButtonLabel: "Open Mindscape",
      primaryButtonLabelColor: { red: 15, green: 17, blue: 21 },
      primaryButtonBackgroundColor: { red: 61, green: 220, blue: 115 },
      secondaryButtonLabel: "Not now",
      secondaryButtonLabelColor: { red: 138, green: 143, blue: 152 },
    },
    {
      primary: {
        behavior: "close",
        actions: [
          { type: "openApp" },
          {
            type: "sendNotification",
            payload: {
              title: "Mindscape",
              body: "Tap to open a ticket.",
              identifier: "mindscape-open-tickets",
              // Read back in notifications.ts's response listener to
              // deep-link to /tickets - see that file's doc comment.
              userInfo: { route: "/tickets" },
            },
          },
        ],
      },
      secondary: { behavior: "close" },
    },
  );
}
