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

**The critical, confirmed-reproducible fact**: this does **not** self-resolve by waiting.
It stays broken indefinitely - tested over many seconds - until the user touches **any**
button anywhere in the app's React Native UI (not necessarily anything related to the
world view itself - any `Pressable` press anywhere). The instant a touch is registered,
the lag is gone and stays gone until the next background/foreground cycle.

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

So: two different attempts at the Skia/GPU rendering layer failed, and one attempt at the
Reanimated animation-scheduling layer also failed. The one thing that reliably, instantly
fixes it is an actual touch/press event somewhere in the app - which strongly suggests the
real mechanism lives somewhere neither of those layers: possibly in UIKit's own touch
delivery/gesture-recognizer system (`RCTTouchHandler`, which is itself a
`UIGestureRecognizer` subclass under React Native's hood) and how iOS schedules/prioritizes
`CADisplayLink`-driven rendering relative to active touch tracking.

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
3. Alternatively: is switching the app's gesture handling from React Native's plain
   `PanResponder` to `react-native-gesture-handler`'s native `Gesture` API (which registers
   real `UIGestureRecognizer`s, unlike `PanResponder`) plausible as a fix, given the above?
4. Any other diagnostic I should run on-device (Xcode Instruments template, specific
   signpost/trace to capture) to actually see what's different about the frame timing
   before vs. after a touch, since I don't have Instruments access myself in this
   conversation?

A screen recording showing the lag, backgrounding/foregrounding, and the exact moment a
button press fixes it is attached/described separately - use it alongside this context.
