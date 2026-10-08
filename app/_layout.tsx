import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { configureReanimatedLogger, ReanimatedLogLevel } from "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { WalletProvider } from "../src/game/economy/WalletContext";
import { EngineProvider } from "../src/game/engine/EngineProvider";
import { ensureNotificationPermission, useNotificationTapNavigation } from "../src/game/engine/notifications";

// Reanimated's "strict mode" logger (default on since Reanimated 3.16) warns
// on any `.value` read outside a worklet/useDerivedValue/event-handler - a
// real diagnostic, but @shopify/react-native-skia's own useRectBuffer/
// useRSXformBuffer (atlas.ts, ItemLayer.tsx's AnimatedSprite - every
// animated tile/item sprite) calls Reanimated's low-level `startMapper`
// straight in its hook body rather than inside a useEffect
// (node_modules/@shopify/react-native-skia/.../external/reanimated/
// buffers.js), which Reanimated's strict check can't tell apart from a real
// render-time violation - a known cross-library false positive (see
// Reanimated's own issue tracker for the same class of report against other
// libraries, e.g. gorhom/react-native-bottom-sheet#1983). Confirmed nothing
// in this app's own code triggers it - every `.value` read here was audited
// and is already inside a worklet/useDerivedValue/useEffect/event handler.
// Keeping `level: warn` (not silencing real warnings/errors), only turning
// off the extra strict-mode class of check this specific false positive
// belongs to - see
// https://docs.swmansion.com/react-native-reanimated/docs/debugging/logger-configuration
//
// Moved here from the old index.ts: with `main` now "expo-router/entry"
// (see package.json), this file - not index.ts - is the first app code the
// router loads, so this is where the call has to run to keep the same
// "before any component renders" timing.
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

/**
 * The root stack: the tab group plus the screens that float above it as
 * modals (Focus, Settings, Tickets, Summary).
 *
 * `WalletProvider` wraps everything here, not just the tab group, so the
 * Focus/Tickets modals and the Village screen underneath share the exact
 * same wallet instance - see WalletContext.tsx. `EngineProvider` lives
 * inside it (the ticket engine pays through the wallet, so the wallet has
 * to exist first) - see EngineProvider.tsx.
 */
export default function RootLayout() {
  useEffect(() => {
    void ensureNotificationPermission();
  }, []);
  // Navigates to /tickets when the shield's notification fallback is
  // tapped - see engine/notifications.ts. Needs to run above EngineProvider
  // (router is available regardless, this just needs to be mounted once).
  useNotificationTapNavigation();

  return (
    <SafeAreaProvider>
      <WalletProvider>
        <EngineProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="focus" options={{ presentation: "modal" }} />
            <Stack.Screen name="settings" options={{ presentation: "modal" }} />
            <Stack.Screen name="tickets" options={{ presentation: "modal" }} />
            <Stack.Screen name="summary" options={{ presentation: "modal" }} />
          </Stack>
        </EngineProvider>
      </WalletProvider>
    </SafeAreaProvider>
  );
}
