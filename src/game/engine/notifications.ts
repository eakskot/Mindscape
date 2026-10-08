import { router } from "expo-router";
import { useEffect } from "react";
import * as Notifications from "expo-notifications";

/**
 * Re-added 2026-10-08 after a false start (2026-10-04, see CLAUDE.md "Where
 * this is going" #3). The shield's "Open Mindscape" button can't actually
 * reopen the app by itself - Apple's Shield UI calls a disconnected
 * `NSExtensionContext`, a confirmed library bug (see
 * deviceActivityBridge.ts's `configureShield` comment). The workaround: the
 * ShieldAction extension also posts a real local notification (a second
 * `sendNotification` action on the same button, `userInfo: {route:
 * "/tickets"}` - see `configureShield`) that genuinely does launch the app
 * through iOS's normal notification-tap path when the user taps it from the
 * lock screen/notification center.
 *
 * First attempt broke the native build (`SwiftUICore` link error) and was
 * reverted - since root-caused to an unrelated React-Core-prebuilt version
 * skew (fixed via `ios.buildReactNativeFromSource`), so this package was
 * never actually the problem. Re-added once that fix landed.
 */

/**
 * Fire-and-forget, called once at startup (see app/_layout.tsx). If denied,
 * the notification still gets sent by the extension but never shows up -
 * "Open Mindscape" just stays as cosmetic as it was before this existed, no
 * special handling needed here for that case.
 */
export async function ensureNotificationPermission(): Promise<void> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return;
  await Notifications.requestPermissionsAsync();
}

/**
 * Navigates to a tapped notification's `data.route`. Covers both tapping
 * while the app is already running/backgrounded *and* a cold launch via tap
 * - `useLastNotificationResponse` handles both itself (see its own doc
 * comment in expo-notifications), so there's no separate "check for a
 * pending launch response" step needed. Call once, from the root layout.
 */
export function useNotificationTapNavigation(): void {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const route = response?.notification.request.content.data?.route;
    if (typeof route === "string") {
      router.push(route);
    }
  }, [response]);
}
