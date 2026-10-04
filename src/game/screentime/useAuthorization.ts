import { useCallback } from "react";
import {
  AuthorizationStatus,
  isAvailable,
  requestAuthorization,
  useAuthorizationStatus,
} from "react-native-device-activity";

/**
 * Just the authorization half of Screen Time setup - picking apps and
 * arming the engine are separate steps owned by ScreenTimeScreen.tsx and
 * EngineProvider.tsx. What used to live here (a daily-budget/threshold
 * monitor built on `eventDidReachThreshold`) is gone - see CLAUDE.md
 * "Where this is going": Apple's threshold events are unreliable, so the
 * ticket engine is built entirely on wall-clock timestamps instead.
 */
export function useAuthorization() {
  const authorizationStatus = useAuthorizationStatus();

  const requestAccess = useCallback(async () => {
    if (!isAvailable()) return;
    // "individual" (not "child") - this is the user monitoring their own
    // phone, not a parent monitoring a child's. See CLAUDE.md.
    await requestAuthorization("individual");
  }, []);

  return {
    isAvailable: isAvailable(),
    authorizationStatus,
    isAuthorized: authorizationStatus === AuthorizationStatus.approved,
    requestAccess,
  };
}
