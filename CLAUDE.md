@AGENTS.md

# Mindscape

A React Native + Expo (SDK 57) + Skia pixel-art app meant to counteract doom-scrolling:
a character lives in a world you decorate, and the eventual point is that you earn the
currency to decorate it by spending **less** time on your phone (Screen Time / Family
Controls - see "Where this is going"). Art is LimeZu "Modern Interiors" (16x16, room +
character) plus "Modern Exteriors" (16x16, outdoor tiles/props) - two separate packs, see
Asset facts.

This file is the project's long-term memory. Read it before changing anything, and keep
it current - it is the thing that survives between sessions.

## Current state

Two scenes exist and connect: an outdoor **village** (imported from a Tiled map the user
maintains outside this repo) and the indoor **room**, joined by a working door portal both
ways. What's in:

- **Movement**: tap-to-walk, idle wandering, collision against imported terrain + placed
  items, a progress watchdog. All on the UI thread (`useCharacter`).
- **Ambient villagers**: three **wandering villagers** (`useWanderingNpcCharacters`) in the
  village, each a different premade sheet (`NPC_SHEET`/`NPC_SHEET_2`/`NPC_SHEET_3`, see
  Character.tsx) - never tapped, never trigger portals, each keeps to a small patch near
  its own spawn. Driven by `Scene.wanderingNpcs` data (the room has none, so it mounts
  none there); HomeScreen.tsx resolves each entry's `skin` id to the actual sheet via
  `WANDERING_NPC_SHEETS` (scene.ts stays Skia-free, same reason `SCENES` exists there).
- **Camera** (`useCamera`): follows the character; a pan or pinch is a **one-way handoff**
  (following stops for the scene's life). Seam-snapped to the device-pixel grid.
- **Pinch-to-zoom**: the world/tile scale is a shared value a pinch drives *continuously*
  (fractional in between) and eases onto a **whole number on release** (pixel art shimmers
  at a fractional scale). Stays centred on the fingers. Character/furniture scale locked to
  the tile scale (`entityScale = worldScale x 2`) so proportions never shift.
- **Decorate**: a throwaway **dev inventory** with a Move/Delete edit mode. Dragging
  validates against ground layers and against every other item (never overlap), shows a
  yellow/red highlight, freezes the characters + camera meanwhile. Its toolbar (Items/Move/
  Delete/Clear + "Done") only shows in **village edit mode**, entered via the pencil
  (`EditVillageButton`) under the settings gear (2026-10-12, `feat/home-today`).
- **Village = home, with a Today card** (2026-10-12, `feat/home-today`): the village stays
  the home screen, but it must answer "what's my status?" and "what's my next step?" within
  two seconds. `engine/TodayCard.tsx` sits above the tab bar: one line of engine state + one
  primary action (Set up / Use a ticket / tap through to `/tickets` or `/focus`). A
  secondary "next shop goal" line used to sit under it - removed 2026-10-12 at Emil's
  request (cluttered the card); don't re-add without asking. Top-right row is now `StreakBadge` + `CurrencyHud`. **No detailed
  metrics on the home screen** (time saved, weekly charts) - those belong on Profile. User
  copy for this overlay lives in `src/ui/strings.ts`.
- **Scenery** (trees/rocks/bushes): free-standing, Y-sorted against the character and
  placed items - so you walk *behind* a tree top and *in front* of its trunk. Batched into
  per-map-row bands for performance (see Design decisions).
- **Zones + clouds - built, tried on the phone, reverted (2026-10-12).** Emil didn't like the
  clouds or the locked-zone gameplay. The complete work (cloud layer, locked-zone collision/
  placement, restore prompt + reveal, `ZonesContext` persistence, Developer zone tools,
  debug overlay, and a CLAUDE.md writeup incl. measured walkability facts - e.g.
  `lookout_isle`'s land sits on `ground_water_collision` and is unwalkable) is preserved
  untouched on the **`archive/zones-clouds`** branch. On `main`, only inert pieces remain,
  imported by nothing (so not bundled): `village/zones.ts` (zone rectangles + overlap
  ownership), `ZONE_PRICES` in economyConfig.ts, the importer's optional Tiled `zones`
  layer -> `VILLAGE_ZONES` (null today), and `scripts/generate-clouds.py` + its sheet
  (`src/assets/sprites/clouds/clouds.png`, `village/cloudSheet.generated.ts`). Don't wire
  any of it back up without asking. **Two later redesigns were also dropped (2026-10-14)** -
  `feat/sky-zones` (blue sky + soft dithered cloud sprites) and `feat/sky-fog` (ocean around
  the map + opaque flat fog covers + lock/price markers), both local-only branches. Emil is
  taking zones/progression in another direction: don't revive clouds/fog or propose them
  again unless he asks. (The black bands seen when fully zoomed out are not
  from zones - min zoom is `MIN_DEVICE_PIXEL_SCALE / density`, from the older "let the pinch
  reach further out" commit.)
- **Removable scenery + a currency HUD**: village scenery Tiled tags with a `group`
  property (a multi-tile tree, say `tree_04`) becomes a `SceneryGroup` - tap it to select
  (a highlight + a floating "remove for N" button), confirm to spend currency and remove it
  for the session (collision/placement clear too). A top-right badge (`CurrencyHud`) shows
  the balance, starting at 100. See `village/villageLayout.ts`'s `removeVillageSceneryGroup`
  and HomeScreen.tsx's `tryRemoveScenery`.
- **Navigation + tab bar** (`expo-router`, landed 2026-10-03): a bottom tab bar - Village,
  Shop, a center Focus action, Screen time, Profile - plus Focus/Settings/Tickets/Summary as
  modals on the root stack. See "Where this is going" #4 for the full writeup; `src/ui/TabBar/`
  and `app/` are the entry points. The tab bar is clean native-chrome UI (`theme.ts`), never
  pixel art - pixel art stays in the world only.
- **The ticket engine** (landed 2026-10-04, `feat/ticket-engine`): real Screen Time blocking,
  not a mock. "Brainrot" apps are locked all the time once armed; 3 tickets/day unlock them
  for 20 min each (60 min cooldown between), a once-daily emergency valve, and Focus sessions
  that pay coins. See "Where this is going" #3 for the full writeup - `src/game/engine/` is
  the core (pure rules in `engineLogic.ts`, native calls only in `deviceActivityBridge.ts`,
  both wired together by `EngineProvider.tsx`/`useEngine()`). **Verified on a physical iPhone
  through Phase 3 (2026-10-04 through 2026-10-07)**: ticket unlock/native re-lock (app
  killed), cooldown, the emergency valve, Focus paying out (and giving up paying nothing),
  a real overnight day rollover, state surviving a force-quit, and Low Power Mode. Three
  real bugs were found and fixed along the way, plus the shield's "Open Mindscape" button
  now genuinely gets you back into the app via a notification tap (2026-10-08) - see
  "Where this is going" #3. **Still open: Phase 4 (Shop purchasing, not started), whether a
  notification from a shielded app surfaces during an active Focus session (not yet
  observed) - say so plainly if asked, don't imply otherwise.**
- **Persistence** (landed 2026-10-04, alongside the engine): the wallet (+ last-100
  transaction ledger), the ticket engine's whole state, and the removed-scenery set now
  survive an app restart - see `engine/storage.ts` (a thin JSON-over-`userDefaultsSet/Get`
  wrapper, no new native dependency) and "Where this is going" #1. Placed items and the
  active scene/camera still don't - that part of #1 is still open.

Not in: **placed-item/scene persistence** (the wallet, engine state and removed scenery
survive a restart now, but switching scenes or restarting still drops placed furniture -
see "Where this is going" #1), **no purchasing** (Shop is read-only: balance + the catalog's
`unlocked` flag - currency's only sink is still removing scenery; sources are now the ticket
engine's daily settlement, Focus sessions, and two one-time bonuses - see "Where this is
going" #2-#3), **no door art** on the room's exit wall.

## Where this is going (read before any big structural change)

The reward loop is: **reduced phone use -> currency -> unlock/buy decor**. Everything
below is a prerequisite, roughly in order. Design new code so it doesn't have to be
un-picked when these land.

1. **Persistence - partly done (2026-10-04).** The wallet (+ ledger), the whole ticket
   engine, and the removed-scenery set now survive a restart - see `engine/storage.ts`, a
   thin JSON-over-`userDefaultsSet/Get` wrapper (the same shared UserDefaults the native
   extensions themselves read/write - no new native dependency). **Still open:** placed
   items. `useWorldItems` already has `serialize`/`restore` and the placed-item shape
   (`{itemId, x, y}`) is final - just not wired to storage. **The seam that has to move:**
   per-scene item state currently lives *inside* `SceneStage`, which remounts on every scene
   switch, so switching village<->room drops placements. It needs to live *above*
   `SceneStage` - a store (plain module + `useSyncExternalStore`, or a context) keyed by
   `sceneId`, loaded once at startup, saved on change. Reuse `engine/storage.ts` for this
   too rather than reaching for MMKV/SQLite/AsyncStorage - nothing so far has needed
   anything storage.ts can't do.
2. **Currency / wallet / economy - done (2026-10-04).** `useWallet()` (`game/economy/`) has
   `balance`, `accrue(amount, source)`, `spend(amount, source?)`, and now `ledger` (last 100
   `{t, amount, source}` entries). Persisted and hydrated synchronously at startup via
   `WalletContext.tsx` - see #1. Every reward amount lives in `economy/economyConfig.ts`
   (`ECONOMY`); `economy/settleDay.ts` is the pure function that turns one day's engine
   state into a coin total + new streak (unused tickets, clean-day bonus, streak daily bonus
   + milestones) - see #3 for how it's actually triggered. The eventual shop reads `balance`
   and calls `spend` the same way; unlocking is `itemCatalog`'s job (it already models
   "unlocked" - see `unlockedItems()`) - shop prices are already defined in
   `economyConfig.ts`'s `SHOP_PRICES`, purchasing itself isn't wired yet.
3. **Screen Time / Family Controls - the ticket engine, built 2026-10-04 (`feat/ticket-engine`),
   verified on-device through Phase 3 (2026-10-07).** Ties rewards to real reduced phone use.
   The rules (decided, don't redesign without asking): 1-3 "brainrot" apps are locked all the
   time once armed; a day has 3 tickets of 20 min that unlock everything, 60 min cooldown
   between; a day runs 04:00->04:00, not midnight->midnight; a once-daily emergency valve
   (60s hold, 10 min unlock, zeroes the rest of that day's coin income but never claws back
   coins already earned); Focus sessions (15/25/45/60 min, or fast-mode 1/2/3/4) pay coins on
   completion, nothing on giving up, and only count if the engine is armed - starting one
   ends an active ticket immediately.

   **Why it's built the way it is:**
   - `react-native-device-activity` wraps Apple's `FamilyControls`/`DeviceActivity`/
     `ManagedSettings`. Real API surface actually used (verified against `src/index.ts` and
     the types file, not just the README): `blockSelection`/`unblockSelection` (take
     `{activitySelectionId}`), `startMonitoring`/`stopMonitoring` + `configureActions`
     (writes `actions_for_<activity>_<callback>` to UserDefaults; the DeviceActivityMonitor
     extension itself reads and executes it on that callback - this is what re-blocks even
     with the app killed), `updateShield`, `isShieldActive`, `userDefaultsSet/Get`.
   - **Never base blocking or rewards on `eventDidReachThreshold` or any live-usage
     signal** - Apple doesn't expose real per-app usage minutes to third parties, only
     unreliable threshold-crossing events (this is what the old daily-budget design used
     and why it's gone - see below). The entire engine runs on **wall-clock timestamps**
     only: `startTicket` records `endsAt = now + TICKET_MIN`, a native one-shot
     `DeviceActivitySchedule` fires the re-block at that exact time via `intervalDidStart`,
     and `reconcile()` (JS-side bookkeeping) catches up whenever the app is next opened.
     Failure direction: if monitoring can't be confirmed, **fail open** (apps stay
     unlocked) and **never pay a reward on an uncertain signal**.
   - `DeviceActivitySchedule` silently misbehaves under ~15 minutes (Apple's own
     constraint) - `deviceActivityBridge.ts`'s `scheduleReblock` always pads the window to
     16 minutes regardless of how short the real ticket/emergency is.
   - One fixed `DeviceActivityName` ("ticketEnd") for every reblock - Apple caps concurrent
     monitors at 20, and this app never needs more than one pending reblock at a time, so
     `scheduleReblock` always stops the previous one before starting the next rather than
     accumulating names.
   - iOS only, no Android equivalent. Since iOS 16.4-ish a user can self-authorize (not
     just a parent for a child), which is the case here (monitoring yourself).

   **Architecture** (see the architecture table for the full file list):
   `src/game/engine/engineLogic.ts` is pure - `(state, now, ...) => {state, effects, events}`,
   zero native calls, fully testable by fabricating a state and a timestamp.
   `deviceActivityBridge.ts` is the *only* file that calls the library's blocking/scheduling
   APIs. `EngineProvider.tsx`/`useEngine()` is the one place that runs a pure result's
   `effects` through the bridge and the wallet, persists state, and runs `reconcile()` at
   startup and on every `AppState` "active" (rolls the day, settles it via `settleDay()`,
   expires a finished ticket/emergency, pays out a finished focus, and re-applies the block
   if the engine should be locked but `isShieldActive()` says it isn't - the fail-open
   repair). `config.ts` holds every tunable number, normal and "fast test mode" (toggled in
   the Screen time tab's Developer section - 2 min tickets, 1 min cooldown, etc., for
   exercising day rollover without waiting real hours).

   **The shield is ONE generic, state-agnostic config** (`deviceActivityBridge.ts`'s
   `configureShield`) - "Locked by Mindscape" / "Open Mindscape to use a ticket.", not a
   per-status variant, because the text would go stale while the app (and therefore any
   ability to update it) is dead. **Confirmed on-device (2026-10-04): the primary button's
   `{type: "openApp"}` does NOT reopen the app** - it just closes the shield back to the
   Home Screen. Root cause found by reading `node_modules/react-native-device-activity/
   ios/Shared.swift`: it calls `openUrl("device-activity://")` (a hardcoded, unrelated URL
   scheme - "todo: replace with general string" in the library's own source) via a freshly
   constructed `NSExtensionContext()` that has no relationship to the extension's real host,
   so `.open()` on it is a no-op. **Worked around (2026-10-08, after one false start):** the
   primary button now also fires a second `{type: "sendNotification", ...}` action
   (`userInfo: {route: "/tickets"}`, posted natively by the ShieldAction extension) -
   `expo-notifications` (`engine/notifications.ts`) asks for permission once at startup and
   deep-links to `/tickets` on tap, via `useLastNotificationResponse()` (handles both tapping
   while the app's alive and a cold launch through the tap). **Confirmed working on-device
   (2026-10-08):** tap "Open Mindscape" -> shield closes -> notification banner -> tap it ->
   lands on `/tickets`. Two taps, not one - the extension genuinely can't jump straight into
   the host app, this is the closest the platform allows. First attempt at this same fix
   (2026-10-04) broke the native build with `ld: ... cannot link directly with 'SwiftUICore'
   because product being built is not an allowed client of it` and was reverted, dead-ended
   at the time as "not from its own Swift source, not root-caused further." **That error was
   a red herring** - root-caused for real while chasing the React-Core-prebuilt bug below
   (2026-10-05/06): the actual missing symbols were React dev-support/Fabric C++ classes
   (`RCTPackagerConnection`, `Sealable::Sealable()`), nothing to do with expo-notifications;
   "SwiftUICore" was only a warning line Expo's CLI surfaced prominently. Fixed generally by
   the `ios.buildReactNativeFromSource` override below - re-adding expo-notifications against
   that fix just worked, no further issues.

   **Three on-device engine bugs found and fixed (2026-10-05 through 2026-10-07):**
   - **Every cold start disarmed the engine.** Right after launch,
     `getAuthorizationStatus()` can briefly read `notDetermined` even when the user approved
     long ago (the library's README calls out this native delay). `reconcile()`'s
     disarm-on-revoke check treated that as revoked. `EngineProvider.tsx` now passes
     `isAuthorized = status !== denied` - only an explicit `denied` disarms. Don't
     "tighten" this back to `=== approved`.
   - **Status froze at 0:00 when a ticket/cooldown/Focus session ran out in the
     foreground.** `engine.status` only recomputes when `reconcile()` runs (startup,
     `AppState` "active", an action) - a countdown reaching zero triggers none of those.
     Fixed in three places, each guarded by a ref so it fires once per window:
     `TodayCard.tsx` (always mounted - it only hides via its `visible` prop, never
     unmounts, since bottom-tabs keeps the Village screen alive; replaced the old
     `TicketChip.tsx` 2026-10-12, which held this watcher before),
     `tickets.tsx`, and `ScreenTimeScreen.tsx`'s `Dashboard` (found a day later than the
     other two - its own Focus countdown had the same gap). `focus.tsx` already did the
     same. Any new screen that shows an engine countdown and reads `status` needs this too.
   - **A completed Focus session could misreport "daily focus cap reached" when the real
     cause was just rounding.** `completeFocus()`'s reward is
     `floor(minutes * FOCUS_COIN_PER_MIN)` (0.5/min) - fast mode's shortest option (1 min)
     always floors to 0 coins, nothing to do with the 60 min/day cap (normal mode's
     shortest option, 15 min, never hits this). The event message assumed any zero-reward
     completion meant the cap; it now checks `focusMinutesRewardedToday >=
     FOCUS_MAX_REWARDED_MIN` and says "too short to earn a coin" otherwise.

   **Post-background zoom/pan lag - SOLVED (attempt 7, 2026-10-09, confirmed working
   on-device by Emil 2026-10-12): migrating the world's input from `PanResponder` to
   `react-native-gesture-handler`** - see attempt 7 below and `useSceneGestures.ts`'s
   header. The history is kept because it rules out a lot. (Was also investigated via an
   external ChatGPT session, `chatgpt-lag-prompt.md` at the repo root.) The world view
   gets laggy specifically after backgrounding the app and returning - confirmed *not* the
   known Fast-Refresh-orphaned-Reanimated-mapper issue (mistake #3), since it reproduces on
   a genuine background/foreground cycle, not Fast Refresh.

   **Confirmed facts, load-bearing for any future theory:**
   - Does **not** improve by waiting - stays broken indefinitely with no input.
   - Touching the game world itself (the `PanResponder`-driven pan/zoom gestures) does
     **not** fix it.
   - Pressing an ordinary UI button elsewhere in the app (`Pressable`-based, e.g. the dev
     inventory's "Move"/"Clear") **does** reliably fix it.
   - A bare, unrelated React state update on `AppState` "active" - zero game state/camera/
     Canvas-key/animation involvement, confirmed via an isolated diagnostic (see attempt 6
     below) - does **not** fix it on its own.

   Any theory has to explain all four at once: not timing, not any touch, specifically a
   `Pressable`-style UI button, and not merely "a React render happened."

   Six things tried or considered so far, all reverted/removed after being ruled out -
   don't re-attempt any of these without new evidence:
   1. Hypothesis: `EngineProvider.tsx`'s `AppState`-triggered `reconcile()` causing a React
      re-render cascade. Didn't hold up - every on-canvas sprite component is already
      `memo`'d with stable props across an unrelated re-render (mistake #17).
   2. Hypothesis: a known, still-open upstream Skia bug,
      [Shopify/react-native-skia#3695](https://github.com/Shopify/react-native-skia/issues/3695) -
      `<Canvas>`'s GPU surface coming back degraded after a real background suspension.
      Fix tried: `canvasRef.redraw()` (lightweight "repaint now," no remount). **Confirmed
      on-device: did not fix it.**
   3. Fix tried: a full `<Canvas>` remount on every return to foreground. Introduced a new
      problem before the underlying fix could even be judged: every `WanderingNpc`'s own
      `useCharacter` state used to live *inside* that remounted subtree, so every NPC reset
      to its spawn point and froze for a few seconds on each resume.
   4. NPC movement state was lifted above `<Canvas>` into `useWanderingNpcCharacters.ts`
      (replacing the old `WanderingNpc.tsx` component - see the architecture table,
      matching how the player's state already lived outside Canvas) so the same remount
      wouldn't reset anything - **kept** (the one change from this whole investigation that
      stayed, as a real architectural improvement independent of the lag fix itself).
      **Confirmed on-device: the lag was still there, and the remount's own brief flash
      was, on its own, "too annoying."** The remount trigger was reverted.
   5. Hypothesis: Reanimated runs **one shared** `requestAnimationFrame`-driven loop for
      every `useFrameCallback` in the app (confirmed by reading
      `node_modules/react-native-reanimated/src/frameCallback/FrameCallbackRegistryUI.ts`),
      which only resumes scheduling itself when the count of active callbacks goes from
      zero back to one - and nothing in this app ever deactivated one. Fix tried: cycle
      every `useFrameCallback` (player, every NPC, camera follow) off then back on via
      their `setActive`, on every `AppState` "active". **Confirmed on-device: did not fix
      it.** Fully reverted (the `setActive` exposure in `useCharacter.ts`/`useCamera.ts`/
      `useWanderingNpcCharacters.ts` was removed too, not just the trigger).
   6. **Isolated diagnostic (2026-10-09, test designed via ChatGPT)**: to isolate whether
      *any* React re-render - not specifically a Skia/Canvas/Reanimated one - is what a
      touch's fix depends on, a single, wholly unrelated `useState` counter was bumped on
      `AppState` "active" (logged via `console.log`, zero game/camera/Canvas-key/animation
      involvement). **Confirmed on-device: did not fix it either.** Removed after the
      result - see this section's "Confirmed facts" above for what it ruled out.

   7. **The fix (2026-10-09, `experiment/gesture-handler-migration`, now in `main`):**
      following the world-touch/UI-button split (fact 2 vs. fact 3), the world's one
      `PanResponder` was replaced by a Gesture Handler `Gesture.Pan()` on a
      `<GestureDetector>` wrapping only the Canvas container (`GestureHandlerRootView` at
      the top of `app/_layout.tsx`). Touches now arrive through a native
      `UIGestureRecognizer`, like a `Pressable`'s do. It's a same-shape port: raw
      `onTouches*` callbacks with `.runOnJS(true)`, the exact old state machine, so
      performance is the same class as `PanResponder` (JS-thread handling) - not worse.
      **Confirmed on-device: the lag is gone.** Don't revert to `PanResponder`. A possible
      later optimisation (not needed today): move the pan/pinch math into UI-thread
      worklets instead of `runOnJS(true)`.

   **What's confirmed working on a physical iPhone, Phase 0 through Phase 3
   (2026-10-04 through 2026-10-07):**
   - Phase 0: requestAuthorization -> pick apps (via the picker - see the "mistake" below)
     -> `blockSelection` -> native shield appears with our custom title/subtitle/button text
     and colors -> `unblockSelection` -> apps open normally again.
   - A ticket unlocking apps, running out, and the shield **re-applying natively with the
     app fully killed** (not just backgrounded) - the DeviceActivityMonitor extension's own
     `intervalDidStart` action, independent of the JS process, confirmed by swiping the app
     away mid-ticket and watching the shield come back on its own.
   - Cooldown (blocks a new ticket until it elapses), the emergency valve (hold-to-confirm,
     10 min unlock, usable exactly once/day), Focus sessions (completing pays coins, giving
     up pays nothing - see the reward-message fix above for the one wrinkle found).
   - A real overnight day rollover (the 04:00 boundary, not a dev-tool shortcut): tickets
     refreshed to 3/3, an unarmed day settled correctly as +0 coins / streak reset to 0.
   - Engine state, wallet balance/ledger, and `armed` all surviving a full force-quit +
     relaunch (confirmed across multiple cycles, after the authorization-race fix above).
   - Low Power Mode: no observed change in blocking/unlocking behavior.

   - The shield's "Open Mindscape" -> notification -> `/tickets` deep link (see above),
     confirmed 2026-10-08.

   **Still open:** whether a notification from a shielded app surfaces during an active
   Focus session (observe-only, not yet done); Phase 4 (Shop purchasing) not started.
   (The post-background zoom-lag is fixed - attempt 7 above.)

   **A real on-device bug already found and fixed:** `BrainrotAppPicker.tsx` originally used
   the *inline* `DeviceActivitySelectionViewPersisted` (embedded directly in the screen).
   On a physical iPhone this rendered **completely blank** and silently **swallowed every
   touch on the whole Screen Time screen** - no crash, no JS error, every other button on
   that screen (including ones with no relation to it) just stopped responding. Fixed by
   switching to the native **sheet** presentation (`DeviceActivitySelectionSheetViewPersisted`,
   opened from a plain "Choose apps" button) - matches the library's own README guidance for
   a custom-presentation use case, confirmed fixed on-device. If a future screen embeds any
   `DeviceActivitySelection*View` inline again, watch for this exact failure mode.

   **Apple approval status:** the Family Controls (Distribution) entitlement request was
   submitted 2026-09-27 (team-level, not per-bundle-ID - see the request form at
   developer.apple.com/contact/request/family-controls-distribution) and is still pending;
   this only gates App Store/TestFlight distribution, not local development - every bit of
   the above works today via development signing (see "Running it"'s device-build notes),
   which is what's actually been tested. Once approved, Certificates/Identifiers/Profiles
   needs "Family Controls" capability enabled per App ID (self-service, no extra review) for
   the 4 App IDs (`com.emilskotner.mindscape` + `.ActivityMonitorExtension`/`.ShieldAction`/
   `.ShieldConfiguration`).

   **What replaced the old daily-budget design (gone, 2026-10-04):** an earlier pass
   (`useScreenTime.ts`, deleted) scheduled one all-day monitor with an
   `eventDidReachThreshold` event at a fixed daily-usage threshold and paid a reward on
   `intervalDidEnd` if the threshold was never crossed. Replaced entirely by the ticket
   engine above for the reason stated at the top of this section - threshold events are
   Apple's unreliable live-usage signal, exactly what rewards must never be based on.
   `useAuthorization.ts` is what's left of it (just `requestAuthorization`/
   `useAuthorizationStatus`, nothing time-based).
4. **Navigation - done (2026-10-03), `feat/tab-bar`.** `expo-router` installed
   (`npx expo install`, so versions match SDK 57); `package.json`'s `main` is now
   `"expo-router/entry"` - `App.tsx` and the old `index.ts` are gone, and the Reanimated
   logger config (see the Stack section below) moved to the top of `app/_layout.tsx`, the
   first file the router loads, to keep the same before-any-render timing.
   - **Routes**: `app/_layout.tsx` (root `<Stack>`, wraps everything in `WalletProvider` +
     `SafeAreaProvider`) → `(tabs)` group (`app/(tabs)/_layout.tsx`'s `<Tabs>`, custom
     `tabBar`) with `index` (Village, = old `HomeScreen`), `shop`, `screentime`, `profile`;
     `focus` and `settings` are modals on the root stack, not tabs.
   - **Tab bar**: `src/ui/TabBar/` - `tabs.config.ts` (one ordered array, `kind: 'tab' |
     'action'`, add a tab in one line), `theme.ts` (every color/radius/size/label constant),
     `TabBar.tsx` (the custom `tabBar` prop - dark rounded-top bar, Feather icons crossfaded
     active/inactive rather than animating the icon's own `color` prop, a green accent
     underline, the center Focus button floating above the bar on its own `playButtonLift`).
     No Friends tab yet (needs a backend) - a disabled row lives on Profile instead.
   - **Wallet**: moved out of HomeScreen into `WalletProvider`/`useWalletContext()`
     (`src/game/economy/WalletContext.tsx`), wrapping the root `<Stack>` - same `useWallet()`
     API, just living above the navigator now so Shop, Screen time and the Focus modal share
     the Village screen's exact instance instead of needing it drilled down.
   - **Mounting**: bottom-tabs keeps a tab's screen mounted (hidden, not unmounted) after its
     first focus - this is *why* switching tabs doesn't reset the Village screen's camera,
     placed items or removed scenery. Don't add `unmountOnBlur`.
   - **Focus modal** (`app/focus.tsx`) and **Screen time tab**
     (`src/game/screentime/ScreenTimeScreen.tsx`) both existed as of this tab-bar pass with a
     plain local timer / daily-budget design - both have since been rewritten to drive the
     real ticket engine (2026-10-04) - see "Where this is going" #3 for the current design,
     this bullet is history, not the current shape.
   - **Three things discovered building this, worth not re-deriving** (see "Mistakes" below
     for the full writeup of each): `expo-router` pulls in `react-native-gesture-handler` as
     an unused transitive peer dependency (its own optional Drawer support, not a choice made
     here); `@expo/ui@57.0.21` (bundled inside `expo-router`, powering native-tabs support
     this app doesn't use) fails to compile against this SDK's `expo-modules-core` - excluded
     via `package.json`'s `expo.autolinking.exclude`; and Expo's **precompiled modules**
     feature ships a version-skewed `ExpoFont`/`ExpoModulesCore` pair that crashes on launch
     (`dyld: Symbol not found: ...BaseModule...willDestroy...`) - disabled via
     `ios/Podfile.properties.json`'s `EXPO_USE_PRECOMPILED_MODULES: false` (that file is
     gitignored, so a fresh `expo prebuild` needs this reapplied - see "Running it").

## Stack

Versions are in `package.json` (Expo SDK 57, RN 0.86, Reanimated 4, Skia 2.6). Deliberately
**no state library**, **no test runner** - don't add one without deciding to migrate.
`expo-router` (see "Where this is going" #4) is the one navigator. `react-native-gesture-
handler` is in `package.json` (a direct dependency since the 2026-10-04 reinstall that
removed `expo-notifications`) - `expo-router` lists it as a peer dependency for its own
optional Drawer navigator - and since 2026-10-09 it's also what drives **all world input**:
one `Gesture.Pan()` in `useSceneGestures.ts`, `GestureHandlerRootView` at the top of
`app/_layout.tsx` (it fixed the post-background lag - see "Where this is going" #3). `/ios` and `/android` are
generated by `expo prebuild` and gitignored.

**`[Reanimated] Reading from \`value\` during component render` in the log is a known
cross-library false positive, not an app bug** - audited every `.value` read in this repo
(there is no other kind of code search worth re-doing here) and every one is already inside
a worklet/`useDerivedValue`/`useEffect`/event handler. The real source is
`@shopify/react-native-skia`'s own `useRectBuffer`/`useRSXformBuffer` (used by every
animated item sprite - `ItemLayer.tsx`'s `AnimatedSprite` - and every animated scenery tile
- `atlas.ts`'s `useAnimatedAtlasData`, water waves): its `buffers.js` calls Reanimated's
low-level `startMapper` straight in the hook body (not inside a `useEffect`), which
Reanimated's strict-mode patch can't tell apart from a real violation - the same class of
report filed against other libraries after Reanimated 3.16 added this logger (e.g.
gorhom/react-native-bottom-sheet#1983). Fixed by turning the *strict* class of check off
(not the logger entirely) in `app/_layout.tsx`'s `configureReanimatedLogger` call (moved
there from the old `index.ts` when `expo-router` landed - see "Where this is going" #4) -
re-derive this from scratch only if a genuinely new instance shows up somewhere this
reasoning doesn't cover.

## Running it

Needs a native dev build (Skia + dev-client), already installed on the iOS simulator.

```bash
npx expo start --dev-client                 # Metro (leave it in its own terminal)
xcrun simctl openurl booted "exp+mindscape://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
xcrun simctl io booted screenshot /tmp/shot.png
```

**After installing a new native dependency, restart Metro with `--clear`, not just
reload.** A Metro instance already running when a package like `expo-router` is added keeps
the old `babel-preset-expo` state in its worker processes - its JS-side symptom is
`Invalid call at line 2: process.env.EXPO_ROUTER_APP_ROOT ... First argument of
\`require.context\` should be a string`, which reads like an app bug but is purely "Metro
started before this dependency existed." Kill it and run
`npx expo start --dev-client --clear`.

**`ios/Podfile.properties.json` is gitignored and carries two required local overrides** -
reapply both after any fresh `expo prebuild`:
- `"EXPO_USE_PRECOMPILED_MODULES": "false"`. Without it, `pod install` links Expo's
  precompiled `ExpoFont`/`ExpoModulesCore` xcframeworks for this exact SDK 57.0.21 pin,
  which are version-skewed against each other and crash on launch with `dyld: Symbol not
  found: ...BaseModule...willDestroy...` - a real upstream bug, not anything in this repo.
- `"ios.buildReactNativeFromSource": "true"` (sets `RCT_USE_PREBUILT_RNCORE=0`). Without
  it, React Native's own precompiled core (`React-Core-prebuilt` - a *separate*
  precompilation mechanism from the one above) is version-skewed the same way and fails to
  **link** rather than crash at launch: `ld: ... cannot link directly with 'SwiftUICore'
  because product being built is not an allowed client of it`, with the real missing
  symbols being React dev-support/Fabric C++ classes (`RCTPackagerConnection`,
  `Sealable::Sealable()`) once you read past Expo CLI's filtered output - run `xcodebuild`
  directly (not through `expo run:ios`) to see the real link invocation if this error class
  ever needs re-diagnosing. Found 2026-10-05/06 chasing a build break that looked like it
  was caused by adding `expo-notifications` (it wasn't - see "Where this is going" #3).

Both together mean every Expo module *and* React Native's core compile from source instead
of linking prebuilt binaries - dramatically slower (tens of minutes, not seconds) the first
time after a clean `Pods`/`DerivedData` wipe. Flip either back to `"true"` to test whether a
future Expo/RN patch has fixed its mismatch - don't carry these overrides forward out of
habit once it's safe to drop one.

**A small floating "Tools" button with a gear icon appears on every screen in a
dev-client build** (briefly animates in near the top-right after launch) - that's
`expo-dev-client`'s own dev-menu affordance, rendered outside this app's React tree
entirely. It's easy to mistake for a bug in the Settings gear button (`SettingsButton.tsx`,
top-right of the Village screen) since they land in roughly the same corner - it is not
part of the app and will not appear in a production or TestFlight build.

**`npx expo install <pkg>` can fail its own `npm install` step with an ERESOLVE conflict
unrelated to the package you're adding** - `expo-router`'s own dependency tree (via
`@expo/ui`/`vaul`/`@radix-ui`, the same cluster already excluded from native autolinking -
see "Where this is going" #4) has a latent `react-dom` peer mismatch that only surfaces when
anything forces a fresh resolve. Not deterministic - `expo-notifications` hit this the first
time it was added (2026-10-04) and needed `npm install --legacy-peer-deps` to route around
(package.json already had the right entry from the failed `expo install`), then installed
clean with no flag needed the second time (2026-10-08, after being removed and re-added -
see "Where this is going" #3) - something about the dependency tree's exact state at
resolve time matters, not just the package itself. If `expo install` fails this way,
`--legacy-peer-deps` is confirmed harmless; try plain `npm install` again first, since it
may just work. Still run `pod install` afterward either way.

**A new native dependency needs a real device/simulator rebuild
to actually work, not just `pod install`** - `pod install` only makes Xcode's project aware
of it; the app binary on your phone is whatever was last built. If something using a
just-added native module silently does nothing on-device, check whether a rebuild happened
since it was added before assuming the code is wrong.

**Physical-device installs on this Mac: `npx expo run:ios --device` reliably fails its own
final install step with `CommandError: InvalidHostID`**, even though the build itself always
succeeds - confirmed this is specific to how that command's own `child_process.spawn('xcrun',
...)` call behaves right after its own preceding `xcodebuild` run in the same process (an
isolated `node -e` script running the exact same `spawn` call back-to-back with no preceding
build succeeds immediately). The reliable move: let the command build (it will "fail" at the
end), then run the same install manually -
`xcrun devicectl device install app --device <udid-or-name> <path-to-.app>` followed by
`xcrun devicectl device process launch --terminate-existing --device <udid> <bundle-id>` -
both always succeed. `xcrun devicectl list devices` / `xcrun xctrace list devices` show the
device's current state if something seems stuck; if the Mac's trust with the phone itself has
gone stale (install hangs forever at "Connecting to: <device>", not a fast error - a real
case hit once, 2026-10-04), the fix that worked was, on the phone: **Settings → General →
Transfer or Reset iPhone → Reset → Reset Location & Privacy** (resets per-app permissions and
every trusted-computer pairing - does **not** touch installed apps, their data, or anything
else), then reconnect and approve the new "Trust This Computer" prompt.

Run `npx expo run:ios` only when native code or dependencies change. `npx tsc --noEmit`
must be green before anything is "done" - there is **no ESLint config and no test runner**,
so tsc + a screenshot is the whole safety net.

**Installing a Release build on the physical iPhone** (for living with the ticket engine
day-to-day, not a Metro-attached dev build):

```bash
npx expo run:ios --device --configuration Release   # will "fail" at its own install step - that's expected, see above
xcrun devicectl device install app --device <udid> ios/build/Build/Products/Release-iphoneos/Mindscape.app
xcrun devicectl device process launch --terminate-existing --device <udid> com.emilskotner.mindscape
```

Same `InvalidHostID` caveat as the Debug workflow above applies - let the first command
build (it builds the Release configuration, which takes longer than Debug the first time),
then run the two manual commands regardless of whether it reports success or that error.
Find `<udid>` via `xcrun xctrace list devices` (the iPhone's line, not "Simulator"). A
Release build has no Metro/dev-client dependency - it's fully standalone, safe to walk away
from the Mac with. **Before relying on it for real:** flip "Fast test mode" off in the
Screen time tab's Developer section first (it's currently on from testing - a Release build
installed while it's on still runs 2-minute tickets/1-minute cooldowns, not the real rules).

## Architecture

`app/` is `expo-router`'s route tree (thin - each file mostly re-exports or thinly wraps a
`src/` component). `src/screens/HomeScreen/` holds the world view; `src/game/` holds
everything reusable; `src/ui/` holds navigation chrome that isn't the world.

### Routes (`app/`)

| File | Responsibility |
|---|---|
| `_layout.tsx` | Root `<Stack>`: wraps everything in `SafeAreaProvider` + `WalletProvider` + `EngineProvider`, holds the Reanimated logger config (see "Running it" - this is the first file the router loads). Declares `(tabs)` plus `focus`/`settings`/`tickets`/`summary` as modals. |
| `(tabs)/_layout.tsx` | The `<Tabs>` navigator - `tabBar={(props) => <TabBar {...props} />}` replaces the default chrome entirely (see `src/ui/TabBar/`). Screen names here must match `tabs.config.ts`'s `route` values. |
| `(tabs)/index.tsx` | Re-exports `HomeScreen` (Village) - see below. |
| `(tabs)/shop.tsx` | Read-only item catalog + balance - see `itemCatalog.ts`. No purchasing yet. |
| `(tabs)/screentime.tsx` | Re-exports `ScreenTimeScreen` (`src/game/screentime/`) - see "Where this is going" #3. |
| `(tabs)/profile.tsx` | Placeholder; the one real thing on it is the disabled "Friends - coming soon" row. |
| `focus.tsx` | The Focus session modal - drives `useEngine()`'s `activeFocus`/`startFocus`/`giveUpFocus` directly (not a local timer - see "Where this is going" #3). Two-tap "Give up" (pays nothing), natural completion calls `forceReconcile()` itself since reconcile doesn't otherwise run just from a countdown reaching zero in the foreground. |
| `settings.tsx` | Placeholder modal, opened from the Village screen's gear button. |
| `tickets.tsx` | Deep link `mindscape://tickets`. Three ticket pips, `HoldToConfirm` to start one, status/countdown, the emergency-valve section when `useEngine().emergencyEligible`. Calls `forceReconcile()` when its countdown hits zero (see "Where this is going" #3). |
| `summary.tsx` | Pushed automatically by `EngineProvider` the moment a day-settlement pays something (`state.pendingSummary`) - "Yesterday: unused tickets +10, clean day +10, ...". `dismissSummary()` on close, which is also what stops it being pushed again for that same settlement. |

### Navigation chrome (`src/ui/`)

| File | Responsibility |
|---|---|
| `TabBar/tabs.config.ts` | The bottom bar's content, left to right, as one array (`kind: 'tab' \| 'action'`) - `TabBar.tsx` and `(tabs)/_layout.tsx` both derive from it. Add a tab here + its route file, nothing else to touch. |
| `theme/palettes.ts` | The design tokens: `lightPalette`/`darkPalette` (same semantic keys - `bg`, `surface`, `surfaceRaised`, `modalBg`, `floatingBg`, `textPrimary`, `accent`/`accentText`, `danger`, `coin`, `tabBar*`, ...) + shared `tokens` (spacing, radii, font sizes, font family). The only file in `src/ui`/`app` allowed to contain a color literal. |
| `theme/ThemeProvider.tsx` | `ThemeProvider`/`useTheme()` → `{palette, scheme, preference, setPreference}`. Preference `'light' \| 'dark' \| 'system'`, default light, persisted via `engine/storage.ts` (`themePreference`), hydrated synchronously in the `useState` initializer (no wrong-theme flash). Mirrors it to native via `Appearance.setColorScheme` (`'unspecified'` for system). Mounted at the top of `app/_layout.tsx`. |
| `theme/makeStyles.ts` | `makeStyles((c, t) => ({...}))` → a `useStyles()` hook, memoized per palette - the pattern every UI file uses instead of module-level `StyleSheet.create`. Also `floatingSurface(c)`: the shared surface+border+shadow for anything floating over the Skia world. |
| `theme/AppearancePicker.tsx` | Light/Dark/System segmented control (Settings → Appearance). Profile has a one-tap dark-mode `Switch` too. |
| `TabBar/theme.ts` | Tab-bar layout constants (sizes, motion) + re-exported radii and `strings.labels`. **No colors** - those come from the palette; there is one theme system. |
| `TabBar/TabBar.tsx` | The custom `tabBar`. Also exports `useTabBarHeight()` (bar + safe area + the Focus button's overhang) for anything a tab screen pins above the bar - the bar is absolutely positioned over the screen. Crossfades two stacked Feather icons (grey/white) rather than animating the glyph's own `color` prop - robust regardless of how `@expo/vector-icons` merges an animated style internally. The center Focus button is a flex spacer with an absolutely-positioned circle poking up out of it (`playButtonLift`), so it keeps the bar's 5 equal slots while floating above the bar's top edge. |
| `SettingsButton.tsx` | The Village screen's gear button → `/settings`. Gated on `useIsFocused()` in HomeScreen.tsx - bottom-tabs' hiding of an unfocused screen didn't fully clip this `Pressable`'s native view without it (plain `View`s like `CurrencyHud` weren't affected). |
| `strings.ts` | User-facing copy for the Village overlay (TodayCard, StreakBadge, edit controls). |
| `HoldToConfirm.tsx` | The press-and-hold confirm button (ticket start, emergency valve). Progress indicator is a plain bottom-up-filling `View` clipped by a rounded parent, not an SVG ring - no `react-native-svg` dependency (would mean another native rebuild, and the phone was away for testing when this was built) - swap for a true ring later, purely visual, without touching the hold logic. |
| `formatDuration.ts` | `formatMMSS(ms)` - every countdown in the app (tickets, Focus, the Screen time dashboard) formats the same way. |
| `useCountdown.ts` | `useCountdown(endsAt)` - live ms-remaining, ticking once a second, `null` when there's nothing to count down to. Used anywhere a timestamp needs to become a live display. |

### The world view (`src/screens/HomeScreen/`)

| File | Responsibility |
|---|---|
| `HomeScreen.tsx` | `HomeScreen` owns which scene is active (a `SCENES` lookup, remounted on portal) and which scenery has been removed - above `SceneStage` so a scene switch doesn't reset them. The wallet itself now lives in `WalletContext` above the whole navigator, not here (see "Where this is going" #4) - `HomeScreen` just reads it via `useWalletContext()`. `SceneStage` mounts the scene's hooks, composes `depthEntities` (bands + `SceneryGroup`s + items), and renders the Canvas + the removal prompt. ~440 lines - **keep it composition-only**; new mechanics go in a hook. |
| `useSceneGestures.ts` | The one Gesture Handler gesture for the view (was a `PanResponder` until the lag fix) - multiplexes pinch / item-drag / camera-pan / tap-to-walk, built once, reads state through refs + `useCamera`'s live values. Owns the drag-highlight state. |

### Engine (`src/game/`)

| File | Responsibility |
|---|---|
| `scene.ts` | The `Scene` / `Tile` / `Portal` / `SceneSceneryBand` / `SceneryGroup` shapes both scenes produce - **read this first**. Optional fields (`sceneryBands`, `sceneryGroups`, `wanderingNpcs`, `tileCollision`, `placementMask`, `topLayerName`) let a scene opt in to a feature; a scene without one costs nothing. |
| `useCamera.ts` | The camera as a unit: `worldScale` + split `cameraX/cameraY` shared values, `transform`, `entityProps`, the follow frame-loop, and stable methods (`toRoomPoint`, `panBy`, `zoomAbout`, `settleZoom`). Its header lists the rules that must not be reverted. Owns `ENTITY_SCALE_MULTIPLIER` and `MIN/MAX_WORLD_SCALE`. |
| `useCharacter.ts` | Movement, collision, animation on the UI thread. `frozen` holds it still (edit mode); `wanderArea` pens the idle wander to a box (NPCs). Returns `walkTo` and `controlled` (true only for a tap, so portals ignore idle wandering). |
| `useWanderingNpcCharacters.ts` | Runs `useCharacter` (never calling `walkTo`, no portal watcher) once per `Scene.wanderingNpcs` entry, in `SceneStage` - *outside* `<Canvas>`, same as the player's own `useCharacter` call. Returns each NPC's `{x, y, column, row, skin}`; `SceneStage` draws each through a plain `<Character>` inside Canvas. Moved out of a dedicated `WanderingNpc.tsx` component (2026-10-08) so an NPC's position/pause-timer state would survive a Canvas remount - see the post-background zoom-lag writeup in "Where this is going" #3 (the remount itself was later reverted as ineffective, this refactor was kept as a genuine improvement on its own). |
| `Character.tsx` | Draws one 16x32 frame via `<Atlas>`. `sheet` prop picks the skin (`PLAYER_SHEET` / `NPC_SHEET` / `NPC_SHEET_2` / `NPC_SHEET_3`). |
| `characterSheet.ts` | Sprite-sheet geometry + animation clips (measured, don't re-derive). |
| `entitySprite.ts` | `toScreenPoint` (camera + scale -> screen px, device-pixel-snapped) + the `EntityProps` type. Shared by the character and every item. |
| `DepthSortedLayer.tsx` | The behind/front opacity toggle for the merged scenery+item list - draws each entity twice, UI thread picks which copy is visible against the character's Y. No re-sort in React per frame. |
| `SceneLayers.tsx` | `SceneLayers` draws a scene's tile layers (batched `<Atlas>` per layer/tileset/flip/animated group). `StaticTileAtlas` is the no-per-frame-worklet variant scenery bands use. |
| `atlas.ts` | `<Atlas>` plumbing: RSXform for rotation, one mirrored image per tileset for `flip` tiles, clock-driven buffer for `animationFrames` tiles. `PIXEL_ART` sampling. |
| `portals.ts` | Watches the character against the active scene's portals; fires a scene switch on a deliberate crossing only. |
| `bounds.ts` | `Bounds`, `TileCollision`, `clamp` - shared shapes. `TileCollision.grid` is a `SharedValue<Uint8Array>`, not a plain array - see the file's own comment and Design decisions. |
| `roomConfig.ts` / `roomLayout.ts` / `tilesets.ts` / `Room.tsx` | The procedural room: config is two numbers + styles; layout builds a `Scene`; tilesets map style -> coords; `Room.tsx` loads its images. |
| `village/villageMap.generated.ts` | **GENERATED** by `scripts/import-village-map.mjs` - never hand-edit. GID arrays, tileset defs, `VILLAGE_SCENERY`, `VILLAGE_SPAWN`. |
| `village/villageLayout.ts` | Builds the village `Scene` from the generated data: decodes Tiled flip/rotate/animation bits, builds `tileCollision` + `placementMask` (SharedValue-backed, see Design decisions), **bands ungrouped scenery by map row**, and turns `group`-tagged scenery into `SceneryGroup`s (splitting a reused group name by physical adjacency - see the file's own `splitCellsIntoClusters`). Exports `removeVillageSceneryGroup`. Sets `wanderingNpc`. |
| `village/SceneryGroupVisual.tsx` | One `SceneryGroup`'s draw node - its tiles (batched, like a band) plus a selection outline. |
| `village/SceneryRemovalPrompt.tsx` | The floating "remove for N" button over a selected group - a real `Pressable`, not a Skia draw; tracks the camera via `useAnimatedStyle`. |
| `Village.tsx` | `useVillageImages` - the hand-written `require()` list for the village's tilesets. **Keep in sync with `VILLAGE_TILESETS`** (see the file's own comment). |
| `economy/useWallet.ts` | `useWallet()`: `balance`, `accrue(amount, source)`, `spend(amount, source?)`, `ledger` (last 100 `{t, amount, source}`) - source-agnostic. See "Where this is going" #2. |
| `economy/WalletContext.tsx` | `WalletProvider`/`useWalletContext()` - lifts the wallet above the navigator (survives a tab switch) and persists it (`engine/storage.ts`), hydrated synchronously before first render. |
| `economy/economyConfig.ts` | Every coin amount (`ECONOMY`) and the Shop's prices (`SHOP_PRICES`) - the one place to tune the economy. |
| `economy/settleDay.ts` | `settleDay()` - pure, no wallet/storage access: one day's engine summary in, `{totalCoins, newStreak, breakdown}` out. Called from `engineLogic.ts`'s `reconcile()`. |
| `economy/CurrencyHud.tsx` | The balance badge - presentational only, sits in `HomeScreen.tsx`'s `topRightRow` next to `engine/StreakBadge.tsx`, not positioned itself. |
| `engine/types.ts` | `EngineState`/`EngineStatus`/`EngineEffect`/`EngineResult` - **read this first** for the ticket engine, same role `scene.ts` plays for the world. |
| `engine/config.ts` | Every engine constant, normal + "fast test mode" (`configFor(fastMode)`), plus `BRAINROT_SELECTION_ID` and the reblock-schedule constants. |
| `engine/storage.ts` | `getJSON`/`setJSON` over the library's `userDefaultsSet/Get` - what `WalletContext`, `EngineProvider` and `HomeScreen.tsx`'s removed-scenery state all persist through. |
| `engine/engineLogic.ts` | The whole ticket engine's rules as pure functions (`arm`, `disarm`, `startTicket`, `endTicketEarly`, `startEmergency`, `startFocus`, `giveUpFocus`, `reconcile`) - **no native calls, no storage** - see "Where this is going" #3. `dayKeyFor()` is the 04:00-rollover day-key function. |
| `engine/deviceActivityBridge.ts` | The *only* file that calls the library's blocking/scheduling/shield APIs (`blockAll`, `unblockAll`, `scheduleReblock`, `cancelReblock`, `configureShield`, `isShieldActive`) - everything else goes through `EngineEffect`s. |
| `engine/EngineProvider.tsx` | `EngineProvider`/`useEngine()` - runs a pure result's effects through the bridge + wallet, persists state, runs `reconcile()` at startup/on `AppState` "active", exposes the Developer-section dev tools (`forceReconcile`, `resetDay`, `unblockEverything`, `setFastMode`) and `dismissSummary()`. |
| `engine/TodayCard.tsx` | The Village's status card above the tab bar - one state line + one action per `EngineStatus` - nothing else. Also the app's always-mounted "countdown hit zero → `forceReconcile()`" watcher (inherited from the deleted `TicketChip.tsx`) - so HomeScreen toggles its `visible` prop (edit mode, unfocused tab) instead of unmounting it. Sibling of the world's `GestureDetector`, wrapper `box-none` - only the card's own box takes touches. |
| `engine/StreakBadge.tsx` | Flame + `state.streak` next to `CurrencyHud`, same look, dimmed at 0, `pointerEvents="none"`. |
| `screentime/useAuthorization.ts` | Just `requestAuthorization`/`useAuthorizationStatus`/`isAvailable` - what's left after the old threshold-based `useScreenTime.ts` was deleted (see "Where this is going" #3). |
| `screentime/BrainrotAppPicker.tsx` | The native **sheet** app picker (`DeviceActivitySelectionSheetViewPersisted`, opened from a "Choose apps" button) - not the inline view, which was found to render blank and swallow every touch on-device. See "Where this is going" #3. |
| `screentime/ScreenTimeScreen.tsx` | The Screen time tab: setup flow (authorize → pick apps → Activate) when `!engine.state.armed`, else the dashboard (status, ticket pips, countdown, streak, "End ticket now", Disarm) plus the always-visible Developer section (fast mode, force reconcile, reset day, unblock-everything safety hatch, last-20 events, wallet ledger). |
| `items/itemCatalog.ts` | Every placeable item as data (size, footprint, layer, animation, `unlocked`). The shop and unlocking are meant to reuse this table unchanged. | Optional per-item `drawScale` (1 = the usual 2x entity scale; 0.5 = the map's own tile scale, used by the houses so they match the map's house), `scenes` (where it may be placed - DevInventory filters on it via `allowedInScene`), and `placement: "footprint"` (every tile under the footprint must be valid ground, not just the anchor).
| `items/houseItems.generated.ts` + `scripts/extract-houses.py` | **GENERATED** - 20 placeable houses (`src/assets/sprites/houses/`) cut from the Serene Village Houses tileset: the 6 complete red houses plus every blue/green loose roof composited onto the red house whose top has the *identical* silhouette (IoU 1.0 - no guessed pairings; exact duplicates would be dropped, none today). Footprint = building body down to the foundation's bottom, porch steps excluded. All `drawScale: 0.5`, `scenes: ["village"]`, `placement: "footprint"`. Re-run the script, don't hand-edit. Placeholder prices in `HOUSE_PRICES_BY_SHAPE` (economyConfig.ts), not wired - Shop is read-only. Decorative only: no door/portal. |
| `items/useWorldItems.ts` | Placed items: state, mutations, collision rects, `isValidPlacement` / `overlapsOtherItem` / `findFreeSpot`, baseline-priority `itemAt` hit-testing, `serialize`/`restore` (unwired). |
| `items/ItemLayer.tsx` | `ItemLayer` (the always-under / always-over passes), `ItemVisual` (one item, animated/static switch, used by the depth-sorted pass), `PlacedItemSprite` (with the behind/front toggle). |
| `items/DragHighlight.tsx` | Yellow/red glow + drop-shadow on the held item. |
| `items/DevInventory.tsx` | Throwaway test UI - **not the shop**. The catalog, world state and layer system are meant to survive into the real shop; this isn't. Only mounted in village edit mode (HomeScreen's `editing`); its "Done" leaves it, and leaving edit mode always resets `editMode` to `"none"`. |
| `items/EditVillageButton.tsx` | The pencil ("Edit village") under `SettingsButton` that enters edit mode. Hidden while editing. |
| `items/editMode.ts` | The `"none" | "move" | "delete"` type, shared by `DevInventory` and `useSceneGestures`. |

`src/engine/`, `src/stores/`, `src/hooks/` from an earlier plan **no longer exist** - don't
recreate empty scaffolding; add a file when there's code for it.

## Design decisions that must not be quietly reverted

Camera / zoom (see `useCamera.ts`'s header too):

- **Integer world scale *at rest*.** A fractional tile scale makes pixel art shimmer /
  shows tile seams. A pinch is allowed to be fractional *while the fingers are on it*
  (the whole view is moving, it's invisible); `settleZoom` eases onto a whole number on
  release. Do not "snap during the gesture" - that's the stepped feel that was rejected.
- **Entity scale is *locked* to the tile scale** (`entityScale = worldScale x
  ENTITY_SCALE_MULTIPLIER`, both shared values). The character and furniture never change
  proportion relative to the world. An earlier attempt decoupled them to soften the
  world-1->2 step; it broke proportions and was reverted - the continuous pinch is the
  answer instead.
- **A pinch stays centred on the fingers.** `zoomAbout` keeps the world point under the
  finger midpoint fixed; `settleZoom` eases the scale *and* both camera axes together so
  it stays fixed through the settle. `following` must be false during a pinch or the
  follow loop fights it and near a map edge the view flies off.
- **`following` is a one-way handoff.** A pan or pinch turns it off; nothing turns it
  back on for the scene's life (a scene remount resets it). `followPosition` teleports -
  any "resume" reads as the screen randomly snapping onto the character. If the game ever
  needs a "recentre on me" it must be an eased camera move, not this flag flipping back.
- **Camera translate and every entity's screen position snap to the *device* pixel grid**
  (`snapToDevicePixel`, `PixelRatio.get()`), not a whole RN point (3x too coarse -> choppy).

Theme (2026-10-12, `feat/theme`):

- **Semantic tokens only.** UI code asks for a role (`c.textSecondary`, `c.surfaceRaised`),
  never a color - no hex/rgba literal in any UI file outside `src/ui/theme/palettes.ts`.
  A new color need = a new semantic key in *both* palettes.
- **World art is not themed.** Tiles, sprites and Skia highlights (`DragHighlight`,
  `SceneryGroupVisual`, HomeScreen's `#15151d` canvas backdrop) keep their literals and
  look identical in both schemes.
- **Default is light** (warm cream sampled against the village tilesets); dark is the
  original look. Both palettes' body-text pairs are >= 4.5:1 (light textPrimary/bg 12.6,
  textSecondary/bg 5.1, white/accent 5.3; dark textSecondary/surfaceRaised 5.1).
- **Floating UI over the world** (HUD badges, settings/edit buttons, removal prompt, dev
  inventory) uses `floatingSurface(c)` - never assume the background is dark.
- **The Screen Time shield is not themed** - it's configured once natively
  (`deviceActivityBridge.ts`'s `configureShield`) and can't follow the app's theme.
- `app.json`'s `userInterfaceStyle` must stay `"automatic"` - `"light"` pins the whole app
  at the Info.plist level, so dark/system wouldn't reach native UI.

Rendering:

- **All game logic is in room pixels** (16 px = one tile). One `<Group transform>` applies
  the world scale + camera translate. The character and items draw **outside** that Group
  at `entityScale` (a clean multiple of the world scale, never a nested fractional one).
- **`sampling={PIXEL_ART}` (Nearest, no mipmap) on every image**, or the art blurs.
- **Sprite frames are drawn with `<Atlas>`** (Skia `<Image>` has no source rect).
- **Per-frame work never touches React.** Movement, animation, camera follow and the live
  pinch are Reanimated shared values driven by `useFrameCallback` / gesture callbacks,
  feeding `useRectBuffer` / `useRSXformBuffer` / `useDerivedValue`.
- **Y-sorting without re-renders.** Each depth entity renders in two passes (behind/front);
  the UI thread toggles `opacity`. Never re-sort the scene in React every frame.
- **Scenery is drawn as per-map-row *bands*, not per tile.** Every scenery tile on a row
  shares an exact baseline, so one band = one batched `<Atlas>` + one behind/front
  decision, with **zero occlusion error** (the grouping key *is* the sort key). This
  collapsed ~1500 single-tile nodes (each a draw call + per-frame worklets) down to ~80 -
  the re-imported map rendered **blank** before this, the pipeline couldn't take it.
- **`depthEntities` is three memos, not one.** `bandEntities` is stable per scene;
  `groupEntities` rebuilds on a removal or a selection change (rare); `itemEntities`
  rebuilds every frame of a furniture drag (`world.items` changes). Merging any of these
  rebuilds nodes that didn't need to change for the others' sake.
- **Collision/placement grids that can change at runtime must be `SharedValue`-backed, not
  a plain array.** A plain `Uint8Array` captured inside a `"worklet"` function gets cloned
  into the UI-thread runtime once; mutating its bytes on the JS thread afterwards - even
  from a freshly re-registered `useFrameCallback` - never reaches that clone. This is a
  real bug we hit: removing a tree correctly cleared the plain grid data (verified against
  the very same object, on the JS thread), yet the movement worklet kept treating the cell
  as solid. Fixed by making `TileCollision.grid` a `SharedValue<Uint8Array>` (`makeMutable`,
  since `VILLAGE` is built outside React) and pushing a **fresh copy** into `.value` on
  every change - not `.value[i] = x` (silent, no cross-thread sync) and not the
  mutated-in-place same-reference array (risks a same-reference no-op). See `bounds.ts`'s
  `TileCollision` comment and `villageLayout.ts`'s `removeVillageSceneryGroup`.

Data / scenes:

- **Data-driven catalogs.** Room styles are two numbers; items are a table; scenery bands
  and the NPC spawn are scene data. A shop, saving and unlocking are all supposed to reuse
  these unchanged.
- **A placed item is `{ instanceId, itemId, x, y }` and nothing else** - the world stays
  JSON-serialisable for saving.
- **`footprint` in the item catalog does three jobs**: collision box, y-sort baseline,
  placement anchor.
- **One `Scene` shape for every scene.** `SceneStage` picks which to mount from `SCENES`;
  nothing else branches on `sceneId`. A new scene means producing a `Scene`, not a
  parallel renderer. A scene opts into a feature by setting the optional field.
- **Placed items never overlap** (checked at placement via `findFreeSpot`, at drag-commit
  via `overlapsOtherItem`) - an overlap silently steals touch priority.
- **Village item placement is gated by `placementMask`**, not "any allowed layer has a
  tile" - `ground_grass` sits under fences and houses too.
- **Scenes remount on switch** (`SceneStage` keyed by `sceneId`) rather than teleporting a
  live character - the scene's `walkable`/`tileCollision`/`bounds` are plain values closed
  over at mount. Cost: per-scene item state is lost on a switch. That's the seam that
  moves when persistence lands (see "Where this is going" #1).

## Asset facts (measured, don't re-derive)

**Modern Interiors** (room, character) lives at `~/moderninteriors-win`. Its own reference
is `2_Characters/Character_Generator/Spritesheet_animations_GUIDE.png`.

**Character sheets** (`Premade_Character_XX.png`, 896x656): frames are **16 wide x 32
tall**, grid 56 x 20. Feet touch the bottom edge -> anchor bottom-centre. One row per
animation; four-directional rows hold four blocks in the order **right, up, left, down**.
Rows: 1 idle(6) · 2 walk(6) · 3 sleep · 4-5 sit · 6 phone · 7 book · 8 push cart · 9 pick
up · 10 gift · 11 lift · 12 throw · 13 hit · 14 punch · 15 stab · 16 grab gun · 17 gun
idle · 18 shoot · 19 hurt. **No run animation** - walk at higher fps. `03` is the player;
`20`/`04`/`18` are the three village NPCs (grey hair+glasses / red cap+teal top / pink
hair+dark outfit respectively - picked for visual contrast against each other and the
player, see `Character.tsx`'s `NPC_SHEET`/`NPC_SHEET_2`/`NPC_SHEET_3`).

**Room_Builder tilesets:** styles are 3x2 tile blocks. Floors repeat (`col % 3`, `row %
2`). Walls are a horizontal 3-slice, two tiles tall. See generated `docs/tile-styles-*.png`.

**Village map** (`~/SERENE_VILLAGE_REVAMPED/maps/map.tmx`, **outside the repo, not in
git** - path hardcoded as `SOURCE_TMX` in the importer). 120 x 80 tiles, 16px. Layers use
a `ground_* / deco_* / col_*` naming scheme (`ground_grass`, `ground_water_collision`,
`ground_beach`, `ground_paths`, `ground_bridges`, `ground_fences_collision`,
`deco_small_extras`, `col_house_collision`). Trees/rocks/bushes are **not** a layer - the
importer emits them as `VILLAGE_SCENERY` (~1600 pieces). A tile object tagged with a
custom `group` string property in Tiled (same value on every tile of one tree/rock) becomes
a removable `SceneryGroup` instead of joining a row band - see "Current state" and
`villageLayout.ts`. **A `group` name isn't trusted as globally unique** (confirmed reused
across unrelated pieces) - `villageLayout.ts` splits it by physical (8-connected) adjacency,
so this only has to hold within one physical object, not across the whole map. Separately:
some tiles that read as "part of a tree" visually are actually **baked into an ordinary
layer** (`ground_fences_collision`, `deco_small_extras` both had GID overlap with scenery)
or are a **leftover untagged object sitting on the same cell** as a tagged one (found for
real: a stray single-tile object with its own group name, at the same position as a tile
already in a different tree's group - one silently painted over the other). Both need a
Tiled-side fix (re-tag / delete the duplicate), not a code fix - flag it to Emil with exact
cell coordinates if noticed rather than guessing which one is "correct". **Known open
instances** (as of the 1597-piece import, commit `c1b1c64`) - check whether still present
before re-deriving: `tall_stone_04` still has a duplicate-position tile at cell `(68,40)`
(gid 2747 & 2796, same as the already-fixed ones at (66,40)/(67,40)); `forest_02` overlaps
`tall_stone_04`/`mid_stone_06` on 8 cells; three exact-duplicate *ungrouped* tiles sit near
the new forest at `(66,35)` (gid 4390 x2), `(69,34)` and `(70,34)` (gid 3591 x2 each) -
likely copy-paste leftovers.

**Bridges** (`ground_bridges`) are a plain draw layer, not a `*_collision` one - the
character walks on whatever's underneath unless something says otherwise. The map was
painted with `ground_water_collision` running unbroken under the river, bridges included, so
every bridge was unwalkable: 143 of 161 bridge cells had a water-collision tile directly
beneath them. **First fix attempt was a Tiled-side data edit** (clearing those 143 cells in
`ground_water_collision`, on the assumption a bridge tile fully covers its cell so nothing
would be lost visually) - **wrong**: at least one bridge tile doesn't fully cover its cell,
so the cleared water left a visible black gap instead. Reverted that edit (water data is
back to the original map). **Fixed properly in code instead**: `villageLayout.ts`'s
`BRIDGE_LAYER_NAME` override - after every layer's built, any cell with a `ground_bridges`
tile has its tile-layer collision forced off, regardless of what `ground_water_collision` (or
any other `*_collision` layer) says underneath. Every layer still draws exactly what's in the
map - nothing about `map.tmx` needs to change for a new bridge, this is the general rule now.
Deliberately doesn't touch scenery-driven blocking (`sceneryCollisionCount`) - a fence or rock
placed *on* a bridge still blocks it, same as it would anywhere else; two such cases exist on
the live map, left as-is on purpose (Emil's call, not re-litigate without asking again): a
`fence_01`-tagged railing (6 tiles, source cells (45,55)-(50,55)) sits across the spawn-side
bridge's own entrance - since it's `group`-tagged it's already a normal removable
`SceneryGroup` in-game (tap, pay, gone), so that bridge opens via the existing currency sink
rather than by default; and a solid 2x3 ungrouped scenery block (cells (45,68)-(46,70), a
rock/bush) still blocks a second, more
southern bridge outright - nobody's touched it, that bridge stays closed until someone
decides what should happen to that piece in Tiled.
`topLayerName` is currently `undefined`: the old `top_layer_collision` held almost every
tree, not the house roof - which is *why* items near trees always rendered behind. Give it
a real value once the house's overhanging roof rows are split into their own layer.
4 tilesets: Terrains (firstGid 1), Outside_Stuff (2305), Houses (4609), **Ground_Variants
(6913)** - the last is declared + wired in `useVillageImages` but nothing in the map
paints from it yet.

**Modern Exteriors** (outdoor tiles/props) lives at `~/modernexteriors-win`. Its
`*_Singles_16x16/` folders have every tile pre-cut as its own PNG - grep by name instead of
slicing the big sheet. Fountain sprites ship a 2x2 grid (dry/water x silver/gold), only
the water+silver frame is used static. A dirt/worn-path variant tileset built from this
pack lives at `~/SERENE_VILLAGE_REVAMPED/maps/ModernExteriors_Ground_Variants_16x16.png`.

## Mistakes we already made - do not repeat them

1. **Guessed the sprite grid was 32x32.** It is 16x32. Measure from the pixels (alpha
   bands, mirror symmetry) before writing code against a sheet.
2. **Named a data module `room.ts` next to a component `Room.tsx`.** macOS is
   case-insensitive; tsc fails on the casing collision.
3. **Debugged a missing sprite when Fast Refresh was the cause.** Adding/reordering hooks
   in a mounted component orphans the Reanimated mappers behind `useRectBuffer` /
   `useFrameCallback` - the entity draws nothing, no error, clean log. **Force a full
   reload before investigating a missing/frozen Skia sprite.**
4. **A collision fallback that could "succeed" while moving zero pixels.** Any movement
   loop needs a progress watchdog: if distance to target hasn't shrunk for a while, drop
   the target.
5. **Let the character spawn inside an obstacle** (trapped forever). Collision is skipped
   while already inside a footprint so it can walk out.
6. **Assumed an animation existed because a row looked like it.** Check the pack's guide.
7. **`useAnimatedReaction`'s first callback has `previousIndex === null`.** A portal check
   that fired on "index changed" fired spuriously on mount. Own an explicit `hasSettled`.
8. **Fractional camera positions left hairline tile seams.** Snap to the nearest *device*
   pixel, not RN point.
9. **Re-running the importer imports whatever is currently in the live `.tmx`.** If the
   user has unrelated in-progress Tiled edits, they come along. `git diff --stat` the
   regenerated file before committing; `git checkout --` and patch narrowly if it has
   changes you didn't intend.
10. **Item hit-testing compared against raw `width`/`height`.** Items render at
    `entityScale`, so only the top-left quadrant registered a tap. `itemAt` takes the
    multiplier and checks `width * multiplier`.
11. **New-item placement nudged by a fixed per-count step.** `findFreeSpot` searches
    outward for a genuinely free cell instead.
12. **Tried to soften the zoom's 1->2 step by decoupling entity scale from world scale.**
    It broke the character:world proportion (which must stay locked) and felt buggy.
    Reverted. The **continuous pinch that settles on release** is the right answer - you
    glide through the in-between scales, so there's no step to soften.
13. **The re-imported (bigger) village map rendered blank.** ~1500 scenery tiles each as
    its own Skia node with per-frame worklets overwhelmed the pipeline, silently. Fixed by
    banding scenery per map row (see Design decisions).
14. **`HomeScreen.tsx` grew to 900 lines** owning scene-mount + camera + gestures + render.
    Split into `useCamera` + `useSceneGestures`. New mechanics go in a hook, not this file.
15. **A plain `Uint8Array` mutated after being captured in a worklet silently stayed
    stale on the UI thread** - the collision grid cleared correctly in the JS-thread data
    (proven), yet the movement worklet kept blocking a removed tree's old footprint. Not
    obvious from the symptom - it looks exactly like "the removal code is buggy". See
    Design decisions' SharedValue rule; this is now fixed but the pattern (any grid/array a
    worklet reads that can change after first render) will recur if a plain array is used
    again.
16. **A `// TEMP` test that calls `setState` several times a second to sample a shared
    value throttles the very thing it's sampling.** `useFrameCallback`'s effect deps are
    `[callback, autostart]`, and the callback is a fresh closure every render - a state
    update mid-walk re-renders the component, which re-registers the frame callback,
    interrupting its own delta-time tracking. A test that repeatedly polls movement this
    way will show the character "stuck" even when nothing is actually wrong. Sample **once**
    after a fixed delay instead of on an interval, or the test result is not trustworthy.
17. **Every on-canvas component that owns a `useRectBuffer`/`useRSXformBuffer` (Character -
    drawn for both the player and every ambient NPC, see useWanderingNpcCharacters.ts -
    ItemVisual/PlacedItemSprite, SceneLayerAtlas) must be wrapped in `memo`, or movement
    turns janky the moment anything else re-renders `SceneStage`.** Root cause:
    `@shopify/react-native-skia`'s `useRectBuffer`/`useRSXformBuffer` call Reanimated's
    low-level `startMapper` straight in the hook body (not inside a `useEffect`) - so every
    *unmemoized* render of a component using them tears down and rebuilds a real
    UI-thread mapper, not just a cheap re-render. `moveItem` firing every frame of an item
    drag (`itemEntities` rebuilding - by design, see Design decisions below) re-renders
    `SceneStage`, and without `memo` that re-rendered *every* Character (player and NPCs
    alike)/item/tile-layer on screen too, each paying that teardown/rebuild for nothing - the actual
    cause of "placing/moving a few items makes the character janky to move, almost stuck,
    until the app is reopened." Every prop on these components is either a SharedValue
    (stable reference - all motion flows through `.value`, read inside their own worklets,
    never through a changed prop) or otherwise reference-stable (see each component's own
    comment) - `memo`'s default shallow comparison is exactly the right/safe tool, not a
    hack. Two supporting fixes had to come with it, or `memo` doesn't actually bite:
    `useVillageImages`/`useRoomImages` were returning a **new array literal every render**
    (the individual `SkImage`s were stable, the wrapping array wasn't) - wrapped in
    `useMemo`; HomeScreen.tsx's `belowLayers`/`aboveLayer` got the same treatment pre-
    emptively (currently a no-op since neither scene sets `topLayerName` yet, but would've
    silently defeated this the moment one does). This is also why the Reanimated
    "strict mode" logger note above fires at all - same hook, same root cause, two
    different symptoms (a log warning vs. real jank) from one upstream pattern.

## Rules we follow

- **Verify before writing code.** Analyse assets (Python + Pillow) and render a mock. Far
  cheaper than a device round-trip.
- **Verify after**, and say plainly what was *not* verified. tsc green is the floor;
  take a screenshot and look at it.
- **Touch tooling: `idb` is installed.** `idb ui tap/swipe --udid <udid> <x> <y>`. Its
  coordinates don't line up reliably with screenshot pixels - taps land off-target,
  especially on small buttons. For a *precise* target, seed state in code (a `// TEMP`
  effect calling `walkTo(x,y)`, driving `worldScale.value`, etc.) - exact, and what caught
  several of the mistakes above. Reach for real taps only for a final smoke test. Two
  failure modes that mimic "broken": after enough taps touch can stop reaching the app
  (`simctl shutdown`+`boot` fixes it); after a sim reboot Metro's log socket can stay
  disconnected (missing `console.log` isn't proof of a bug - screenshot to ground-truth).
- **`runOnJS(console.log)` throws and freezes the whole UI-thread runtime.** Wrap first:
  `const log = (...a) => console.log(...a); runOnJS(log)(...)`.
- **Temporary scaffolding is removed before reporting.** Mark it `// TEMP`, grep for it.
- **Don't invent art.** Compose from pack tiles; if a piece is missing, say so.
- **Keep the renderer style-agnostic.** New art variants are data, not code branches.
- **Code and comments in English; conversation with the user in Norwegian.**

## Before you change anything

- Read `AGENTS.md`: consult the exact Expo v57 docs before writing Expo code.
- Room style/size/walkable derive from `roomConfig.ts` - change the config, not the layout.
- Item `footprint` values are hand-measured tuning knobs; adjusting them only affects
  collision + sorting.
- The dev inventory is disposable. The item catalog, world state and layer system are not.
- Re-run `scripts/import-village-map.mjs` after Emil edits the village in Tiled; see
  mistake #9 first if it's for any other reason. If the map gains a tileset, wire its
  image into `useVillageImages` (see `Village.tsx`).
- Portals live in scene data (`Scene.portals`), not code. A new scene mainly means a
  `Scene` + a portal pointing back.

## Product knowledge (eskot_mind vault)
Strategy, user research, screen-time/gamification research and Emil's goals live in
Emil's second brain at `/Users/emilskotner/eskot_mind` (an LLM Wiki, schema in its CLAUDE.md).
Read access is pre-approved in `.claude/settings.local.json`.
- Before product/design decisions (not routine code changes): read
  `/Users/emilskotner/eskot_mind/wiki/index.md`, then `wiki/entities/Mindscape.md` and the
  relevant linked pages. Cite the pages you relied on.
- Never edit `/Users/emilskotner/eskot_mind/wiki/` from here. To feed something back (a
  decision, a learning, user feedback), write a dated note to
  `/Users/emilskotner/eskot_mind/raw/notes/YYYY-MM-DD Mindscape - <topic>.md` and tell Emil
  to ingest it from the vault.
