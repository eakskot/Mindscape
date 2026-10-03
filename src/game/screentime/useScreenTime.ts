import { useCallback, useEffect, useRef, useState } from "react";
import {
  AuthorizationStatus,
  getFamilyActivitySelectionId,
  isAvailable,
  onDeviceActivityMonitorEvent,
  requestAuthorization,
  startMonitoring,
  stopMonitoring,
  useAuthorizationStatus,
  type DeviceActivityEvent,
  type DeviceActivityMonitorEventPayload,
} from "react-native-device-activity";

import type { WalletSource } from "../economy/useWallet";

/**
 * The persisted id the user's "brainrot apps" selection lives under - see
 * BrainrotAppPicker.tsx (DeviceActivitySelectionViewPersisted keyed by this
 * same id). One fixed id because there's exactly one such selection today,
 * not per-user/per-scene.
 */
export const BRAINROT_SELECTION_ID = "brainrotApps";

/** The one recurring activity this hook schedules - midnight to midnight. */
const ACTIVITY_NAME = "dailyBrainrotBudget";
const OVER_BUDGET_EVENT_NAME = "overDailyBudget";

/**
 * The "you've gone over" line, in minutes. Reaching it is a signal, not a
 * punishment by itself - see the `eventDidReachThreshold` branch below.
 * 30 min is a starting point per CLAUDE.md's "Where this is going", not
 * tuned against real usage yet - expect to revisit once there's data.
 */
const DAILY_BUDGET_MINUTES = 30;

/**
 * What a budget-respecting day is worth. Same order of magnitude as
 * SCENERY_REMOVAL_COST (HomeScreen.tsx) on purpose, so the first thing
 * currency buys and the first thing that earns it feel comparable - not
 * derived from any real playtesting yet.
 */
const DAILY_REWARD = 15;

/**
 * Ties Apple's Screen Time frameworks to the wallet - see CLAUDE.md's
 * "Screen Time / Family Controls" section for why this exists and, more
 * importantly, what it *can't* do: there is no live per-app minute counter
 * available to third-party code, only threshold-crossing events and an
 * Apple-rendered report view. So the reward loop is built around events,
 * not a number that ticks down over the day.
 *
 * How a day becomes (or doesn't become) a reward:
 * `startWatching` schedules one all-day, repeating activity with a single
 * threshold event at DAILY_BUDGET_MINUTES, against whatever the user chose
 * in BrainrotAppPicker. Two native callbacks matter, both delivered through
 * `onDeviceActivityMonitorEvent`:
 * - `eventDidReachThreshold` - the user went over budget today. Recorded in
 *   `wentOverBudgetToday` (a ref, not state - nothing here should re-render
 *   on it); not acted on further yet. A hook for a future penalty/nudge,
 *   not this pass's job.
 * - `intervalDidEnd` - the day rolled over. If the ref above is still
 *   false, today ended *under* budget - accrue the reward and reset the
 *   ref for the next day.
 *
 * Events only arrive while the app process is alive (see CLAUDE.md) - the
 * same limitation the rest of the app has today (nothing is persisted, see
 * useWallet.ts), not something this hook adds on top. Once persistence
 * lands, `getEvents(ACTIVITY_NAME)` (this library reads it from the app
 * group's shared storage, not from this hook's own state) is the way to
 * catch up on what happened while the app was closed - deliberately not
 * wired here yet, so this hook doesn't need touching when that lands.
 */
export function useScreenTime(
  accrue: (amount: number, source: WalletSource) => void,
) {
  const authorizationStatus = useAuthorizationStatus();
  const [isMonitoring, setIsMonitoring] = useState(false);
  const wentOverBudgetToday = useRef(false);

  const requestAccess = useCallback(async () => {
    if (!isAvailable()) return;
    // "individual" (not "child") - this is the user monitoring their own
    // phone, not a parent monitoring a child's. See CLAUDE.md.
    await requestAuthorization("individual");
  }, []);

  const startWatching = useCallback(async () => {
    // getFamilyActivitySelectionId reads back the raw selection token the
    // native side persisted under BRAINROT_SELECTION_ID when the user used
    // BrainrotAppPicker - undefined until they've picked at least once.
    const selectionToken = getFamilyActivitySelectionId(BRAINROT_SELECTION_ID);
    if (!selectionToken) {
      return;
    }

    const events: DeviceActivityEvent[] = [
      {
        familyActivitySelection: selectionToken,
        threshold: { minute: DAILY_BUDGET_MINUTES },
        eventName: OVER_BUDGET_EVENT_NAME,
      },
    ];

    await startMonitoring(
      ACTIVITY_NAME,
      {
        intervalStart: { hour: 0, minute: 0, second: 0 },
        intervalEnd: { hour: 23, minute: 59, second: 59 },
        repeats: true,
      },
      events,
    );
    wentOverBudgetToday.current = false;
    setIsMonitoring(true);
  }, []);

  const stopWatching = useCallback(() => {
    stopMonitoring([ACTIVITY_NAME]);
    setIsMonitoring(false);
  }, []);

  useEffect(() => {
    const subscription = onDeviceActivityMonitorEvent(
      (event: DeviceActivityMonitorEventPayload) => {
        if (event.callbackName === "eventDidReachThreshold") {
          wentOverBudgetToday.current = true;
          return;
        }
        if (event.callbackName === "intervalDidEnd") {
          if (!wentOverBudgetToday.current) {
            accrue(DAILY_REWARD, "screenTime");
          }
          wentOverBudgetToday.current = false;
        }
      },
    );
    return () => subscription.remove();
  }, [accrue]);

  return {
    isAvailable: isAvailable(),
    authorizationStatus,
    isAuthorized: authorizationStatus === AuthorizationStatus.approved,
    isMonitoring,
    requestAccess,
    startWatching,
    stopWatching,
  };
}
