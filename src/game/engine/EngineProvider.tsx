import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { router } from "expo-router";
import { AppState } from "react-native";
import {
  AuthorizationStatus,
  getAuthorizationStatus,
} from "react-native-device-activity";

import { useWalletContext } from "../economy/WalletContext";
import { configFor, type EngineConfig } from "./config";
import * as bridge from "./deviceActivityBridge";
import {
  arm as pureArm,
  deriveStatus,
  disarm as pureDisarm,
  emergencyEligible as pureEmergencyEligible,
  endTicketEarly as pureEndTicketEarly,
  giveUpFocus as pureGiveUpFocus,
  initialEngineState,
  reconcile as pureReconcile,
  startEmergency as pureStartEmergency,
  startFocus as pureStartFocus,
  startTicket as pureStartTicket,
} from "./engineLogic";
import { getJSON, setJSON, StorageKeys } from "./storage";
import type { EngineEffect, EngineResult, EngineState, EngineStatus } from "./types";

const MAX_EVENT_LOG = 20;

type EngineContextValue = {
  state: EngineState;
  status: EngineStatus;
  config: EngineConfig;
  emergencyEligible: boolean;
  events: string[];

  arm: () => void;
  disarm: () => void;
  startTicket: () => void;
  endTicketEarly: () => void;
  startEmergency: () => void;
  startFocus: (minutes: number) => void;
  giveUpFocus: () => void;

  // Developer section (Screen time tab) - see CLAUDE.md.
  setFastMode: (on: boolean) => void;
  forceReconcile: () => void;
  resetDay: () => void;
  unblockEverything: () => void;
  dismissSummary: () => void;
};

const EngineContext = createContext<EngineContextValue | null>(null);

export function EngineProvider({ children }: { children: ReactNode }) {
  const wallet = useWalletContext();
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  const [state, setState] = useState<EngineState>(() => {
    const saved = getJSON<EngineState>(StorageKeys.engineState);
    return saved ?? initialEngineState(Date.now());
  });
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    setJSON(StorageKeys.engineState, state);
  }, [state]);

  const runEffects = useCallback((effects: EngineEffect[]) => {
    for (const effect of effects) {
      switch (effect.type) {
        case "blockAll":
          bridge.blockAll();
          break;
        case "unblockAll":
          bridge.unblockAll();
          break;
        case "scheduleReblock":
          // Fire-and-forget: startMonitoring is async, but nothing in the
          // UI needs to block on it landing - the native extension owns
          // the actual reblock regardless of whether this promise has
          // resolved by the time the user sees "unlocked".
          void bridge.scheduleReblock(effect.endsAtMs);
          break;
        case "cancelReblock":
          bridge.cancelReblock();
          break;
        case "configureShield":
          bridge.configureShield();
          break;
        case "walletAccrue":
          walletRef.current.accrue(effect.amount, effect.source);
          break;
      }
    }
  }, []);

  const apply = useCallback(
    (result: EngineResult) => {
      setState(result.state);
      runEffects(result.effects);
      if (result.events.length > 0) {
        setEvents((current) =>
          [...current, ...result.events].slice(-MAX_EVENT_LOG),
        );
      }
    },
    [runEffects],
  );

  const runReconcile = useCallback(() => {
    setState((current) => {
      const result = pureReconcile(current, Date.now(), {
        isShieldActive: bridge.isShieldActive(),
        // Not `=== approved` - confirmed on-device (2026-10-05) that right
        // after a cold start, getAuthorizationStatus() can briefly read
        // `notDetermined` even though the user approved it ages ago (the
        // library's own README calls this out as a known native delay).
        // reconcile()'s disarm-on-revoke check must only fire on an
        // explicit `denied`, never on "don't know yet" - treating
        // notDetermined as "not approved" was spuriously disarming the
        // engine on every cold start. See CLAUDE.md.
        isAuthorized: getAuthorizationStatus() !== AuthorizationStatus.denied,
      });
      runEffects(result.effects);
      if (result.events.length > 0) {
        setEvents((ev) => [...ev, ...result.events].slice(-MAX_EVENT_LOG));
      }
      return result.state;
    });
  }, [runEffects]);

  // Startup + every return to foreground - see engineLogic.ts's reconcile doc comment.
  useEffect(() => {
    runReconcile();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") runReconcile();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate to the summary modal the moment a settlement pays something -
  // keyed by day, not just "is it set", so it fires once per distinct
  // settlement rather than re-pushing on every unrelated reconcile while
  // the user is already looking at it (dismissSummary clears it to null,
  // which is the normal way this stops firing - this ref guards the rarer
  // case of two reconciles landing before that dismiss happens).
  const shownSummaryForDay = useRef<string | null>(null);
  useEffect(() => {
    const summary = state.pendingSummary;
    if (summary && shownSummaryForDay.current !== summary.day) {
      shownSummaryForDay.current = summary.day;
      router.push("/summary");
    }
  }, [state.pendingSummary]);

  const status = deriveStatus(state, Date.now());
  const config = configFor(state.fastMode);

  const value = useMemo<EngineContextValue>(
    () => ({
      state,
      status,
      config,
      emergencyEligible: pureEmergencyEligible(state, Date.now()),
      events,
      arm: () => apply(pureArm(state, Date.now())),
      disarm: () => apply(pureDisarm(state)),
      startTicket: () => apply(pureStartTicket(state, Date.now())),
      endTicketEarly: () => apply(pureEndTicketEarly(state, Date.now())),
      startEmergency: () => apply(pureStartEmergency(state, Date.now())),
      startFocus: (minutes: number) => apply(pureStartFocus(state, minutes, Date.now())),
      giveUpFocus: () => apply(pureGiveUpFocus(state)),

      setFastMode: (on: boolean) => setState((s) => ({ ...s, fastMode: on })),
      forceReconcile: runReconcile,
      // Dev tool: rewind `currentDay` by one so the next reconcile() settles
      // "today" immediately, instead of needing to actually wait for the
      // real day-rollover hour - see config.ts's fast mode for the other
      // half of fast iteration.
      resetDay: () => {
        setState((s) => ({ ...s, currentDay: "2000-01-01" }));
        setTimeout(runReconcile, 0);
      },
      // Safety hatch: bypass the engine's own rules entirely (no cooldown
      // charged, no ticket consumed) - for when the engine is misbehaving
      // during development, not a normal user action.
      unblockEverything: () => {
        bridge.unblockAll();
        bridge.cancelReblock();
        setState((s) => ({ ...s, activeTicket: null, emergencyActive: null }));
        setEvents((ev) => [...ev, "DEV: unblock everything"].slice(-MAX_EVENT_LOG));
      },
      dismissSummary: () => setState((s) => ({ ...s, pendingSummary: null })),
    }),
    [state, status, config, events, apply, runReconcile],
  );

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineContextValue {
  const engine = useContext(EngineContext);
  if (!engine) {
    throw new Error("useEngine must be used within an EngineProvider (see app/_layout.tsx)");
  }
  return engine;
}
