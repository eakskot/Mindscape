# Context for diagnosing a React Native + Skia rendering lag

I'm building a React Native (Expo SDK 57) app called Mindscape. It has a 2D pixel-art game
world rendered with `@shopify/react-native-skia` (v2.6.2) inside one `<Canvas>`, driven by
`react-native-reanimated` v4 (worklets on the UI thread). A character walks around a tile
map; the camera supports pinch-to-zoom and pan via React Native's plain `PanResponder` API
(NOT `react-native-gesture-handler`'s native Gesture API, even though that package happens
to be installed as an unused transitive dependency of something else).

## The bug

On a **physical iPhone** (not reproduced on Simulator, not tested): after the app is
**backgrounded** (user presses the Home button, swipes to another app, or the phone locks)
and then **returns to the foreground**, the world view becomes visibly laggy/stuttery -
panning and especially pinch-to-zoom feel like dropped frames, not smooth 60fps.

**The critical, confirmed-reproducible facts:**
- This does **not** self-resolve by waiting. It stays broken indefinitely with no input.
- Touching the **game world itself** - the `PanResponder`-driven pan/pinch-zoom gestures -
  does **NOT** fix it. (Updated finding - earlier I'd assumed "any touch" fixes it; this
  turned out to be wrong in an important way, see below.)
- Pressing an ordinary **UI button** elsewhere in the app (a plain `Pressable`, e.g. a
  small toolbar button unrelated to the world view) **does** reliably fix it, instantly,
  every time.
- A bare, completely unrelated React `useState` update on `AppState` "active" - zero game
  state/camera/Canvas/animation value involvement, isolated specifically to rule this in or
  out - does **NOT** fix it either (tested on-device with logging to confirm the update
  actually committed).

So it's not "any touch," and it's not "any React re-render." It's specifically something a
`Pressable` press does that neither a `PanResponder`-tracked touch on the world nor a plain
state commit does.

## What's already been ruled out (all confirmed on a real device, not guessed)

1. **Not a React re-render cascade.** Every on-canvas Skia component (the character, items,
   tile layers) is already wrapped in `React.memo` with provably stable props across
   unrelated re-renders (fixed a real jank bug from this class of issue previously).
2. **Not Fast Refresh / dev-reload related.** Reproduces on a release-adjacent dev-client
   build with a genuine background/foreground cycle, not a Metro refresh.
3. **Not fixed by `canvasRef.redraw()`** - Skia's lightweight "repaint now" API
   (`SkiaViewApi.requestRedraw` under the hood). Tried, confirmed zero effect on-device.
4. **Not fixed by fully remounting the `<Canvas>` component** (changing its React `key` on
   every foreground transition, forcing Skia to tear down and rebuild its entire native
   view/rendering surface from scratch). Tried, confirmed the lag was still there
   afterward - and it also introduced a visible flash/reset of other state, which was
   reverted.
5. **Not fixed by cold-restarting Reanimated's own animation loop.** Found that
   `react-native-reanimated` runs ONE shared `requestAnimationFrame`-driven loop internally
   for every `useFrameCallback` registered anywhere in the app (confirmed by reading
   `node_modules/react-native-reanimated/src/frameCallback/FrameCallbackRegistryUI.ts` -
   the loop only resumes scheduling itself when the count of *active* callbacks transitions
   from zero back to one). Exposed every `useFrameCallback`'s `setActive` and, on every
   `AppState` "active" event, called `setActive(false)` on all of them, waited 50ms, then
   `setActive(true)` on all of them - forcing a genuine cold-restart of that shared loop.
   Tried, confirmed zero effect on-device.
6. **Not fixed by a bare React re-render either.** An isolated test: on `AppState`
   "active", bump a `useState` counter that nothing else reads - zero game state, camera,
   Canvas key, or animation value touched, just a plain commit, confirmed via a
   `console.log` inside its own effect (the log did fire). Confirmed on-device: the lag was
   still there. Rules out "any React commit is sufficient" as cleanly as the world-touch
   finding rules out "any touch is sufficient."

So: two different attempts at the Skia/GPU rendering layer failed, one attempt at the
Reanimated animation-scheduling layer failed, and a bare React re-render on its own also
failed. Combined with the world-touch-doesn't-fix-it / UI-button-does split above, the real
mechanism seems to be something specific to how a `Pressable` press is handled that neither
a `PanResponder`-tracked touch on the world, a Reanimated-layer kick, nor a plain React
commit replicates - possibly in UIKit's own touch delivery/gesture-recognizer system
(`RCTTouchHandler`, itself a `UIGestureRecognizer` subclass under React Native's hood,
though how a `Pressable`'s touch handling differs from a raw `PanResponder`'s at that layer
isn't something I've been able to pin down from JS/TS source alone) and how iOS schedules/
prioritizes `CADisplayLink`-driven rendering relative to active touch tracking.

## What I want help figuring out

1. What native-level iOS mechanism plausibly explains "rendering is degraded/throttled
   after a background→foreground transition, specifically until a real touch event is
   processed by UIKit, and never self-resolves by just waiting"? Candidates I haven't been
   able to confirm or rule out from JS/TS-level code alone: `CADisplayLink` preferred frame
   rate / QoS tied to active gesture-recognizer tracking; some RunLoop-mode interaction
   (`NSDefaultRunLoopMode` vs `UITrackingRunLoopMode`); Metal/GPU command queue priority
   tied to touch input; something specific to how Expo's dev-client or `react-native-skia`'s
   native view registers with the display link.
2. Is there anything triggerable **from JS/TypeScript** (no native module changes, or a
   small native module if genuinely necessary) that can replicate whatever effect a real
   touch has, so this can be done programmatically on `AppState` "active" instead of
   requiring the user to tap something?
3. Most pointed question given the world-touch-vs-button split above: what's actually
   different, at the native level, between how a `Pressable` press is delivered/handled on
   iOS vs. how a touch tracked by a raw `PanResponder` (attached to a plain `View` covering
   the Skia Canvas) is? Is `Pressable` doing something a `PanResponder`-tracked view
   doesn't (e.g. a different `UIGestureRecognizer` setup, `pointerEvents` handling,
   accessibility/focus system interaction)? Is switching the world view's own gesture
   handling from `PanResponder` to `react-native-gesture-handler`'s native `Gesture` API
   (already an unused transitive dependency) plausible as a fix, given this?
4. Any other diagnostic I should run on-device (Xcode Instruments template, specific
   signpost/trace to capture) to actually see what's different about the frame timing
   before vs. after a touch, since I don't have Instruments access myself in this
   conversation?

A screen recording showing the lag, backgrounding/foregrounding, and the exact moment a
button press fixes it is attached/described separately - use it alongside this context.
