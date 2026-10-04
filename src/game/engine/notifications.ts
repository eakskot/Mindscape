import * as Notifications from "expo-notifications";
import { router } from "expo-router";

/**
 * The fallback for the shield's "Open Mindscape" button - see
 * deviceActivityBridge.ts's `configureShield` doc comment for why this
 * exists at all (`{type: "openApp"}` is confirmed non-functional).
 *
 * The notification itself is posted natively, by the ShieldAction
 * extension process executing the `sendNotification` action we configured
 * (see Shared.swift) - this file never posts it from JS. All this file does
 * is (a) make sure notification permission has been asked for, so the
 * extension's post isn't silently dropped, and (b) listen for the user
 * tapping it and deep-link to /tickets.
 */

export async function ensureNotificationPermission(): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    await Notifications.requestPermissionsAsync();
  }
}

/**
 * Call once, near the root (see app/_layout.tsx) - not per-screen, or
 * tapping the notification would deep-link once per mounted listener.
 */
export function registerNotificationTapHandler(): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const route = response.notification.request.content.data?.route;
      if (typeof route === "string") {
        router.push(route as `/${string}`);
      }
    },
  );
  return () => subscription.remove();
}
