@AGENTS.md

# Mindscape

A React Native + Expo (SDK 57) + Skia pixel-art app meant to counteract doom-scrolling: a
character lives in a room you decorate. Art is LimeZu "Modern Interiors" (16x16 variant).

This file is the project's long-term memory. Read it before changing anything.

## Current state & next steps

Two scenes exist and connect: an outdoor **village** (imported from a Tiled map the user
maintains outside this repo) and the original indoor **room**, joined by a working door
portal both ways. Items can be placed via a throwaway dev inventory. That's the whole game
loop today - **there is no persistence** (everything resets on app restart), **no
currency/shop** (placing items is free, unlimited), and **no door art** on the room's exit
wall (it works, nothing is drawn there).

If picking up this project cold, in priority order:
1. **Persistence** is the single most valuable next step - it's also a prerequisite for
   almost everything else (a shop, unlocking, and eventually Family Controls integration
   all need a durable store). Nothing is wired up yet; `useWorldItems`'s `serialize`/
   `restore` exist and the shape is final, just not connected to any storage.
2. **Currency/shop**, once persistence exists. Design it as a module that can accept
   "accrual" from any source (a timer, a daily check-in, or later a Screen-Time event) -
   don't hardcode it to one mechanism.
3. **Family Controls / Screen Time** (tying rewards to real reduced phone use - the actual
   point of this app) was researched but not started. Key facts, so this doesn't need
   re-researching: the community package `react-native-device-activity` wraps Apple's
   `FamilyControls`/`DeviceActivity`/`ManagedSettings`. It needs (a) Apple's approval of a
   "Family Controls (Distribution)" entitlement - apply for this early if serious, it's an
   external bottleneck with its own timeline, unrelated to code; (b) native iOS app
   extensions, meaning this project moves off the current plain `expo start --dev-client`
   workflow onto a proper `prebuild`/EAS Build setup; (c) Apple does **not** expose raw
   per-app usage minutes to third parties for privacy reasons - only threshold-crossing
   events and an Apple-rendered report view - so the reward loop has to be designed around
   *events*, not a live counter; (d) iOS only, no Android equivalent; (e) since iOS 16.4-ish
   a user can self-authorize (not just a parent for a child), which matters here since the
   user is monitoring themselves.

## Stack

Expo SDK 57 · React Native 0.86 · `@shopify/react-native-skia` 2.6 · Reanimated 4.5 +
react-native-worklets · TypeScript strict. No gesture-handler, no state library, no test runner.

## Running it

The app needs a native dev build (Skia + dev-client), which is already installed on the
iOS simulator. Normal loop:

```bash
npx expo start --dev-client                 # Metro (may already be running on 8081)
xcrun simctl openurl booted "exp+mindscape://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
xcrun simctl io booted screenshot /tmp/shot.png
```

Only run `npx expo run:ios` when native code or dependencies change. `npx tsc --noEmit`
must be green before you call anything done.

## Architecture

Everything lives under `src/game/`. `App.tsx` is a wrapper; `HomeScreen.tsx` holds which
scene is active and owns the canvas, the viewport transform and the touch handling for
whichever one is mounted.

| File | Responsibility |
|---|---|
| `scene.ts` | The `Scene`/`Tile`/`Portal` shape both the room and the village produce - read this first |
| `roomConfig.ts` | The single place the room is described: columns, rows, floorStyle, wallStyle |
| `tilesets.ts` | Style number → coordinates in a Room_Builder tileset |
| `roomLayout.ts` | Builds a `Scene` from the config. Knows room shape, not style |
| `village/villageMap.generated.ts` | **GENERATED** by `scripts/import-village-map.mjs` - never hand-edit |
| `village/villageLayout.ts` | Builds a `Scene` from the generated village data - decodes Tiled flip/rotate/animation bits here |
| `Room.tsx` / `Village.tsx` | Load each scene's own tileset images, hand off to `SceneLayers` |
| `SceneLayers.tsx` | The one tile-layer renderer both scenes share - no per-scene branching |
| `atlas.ts` | Shared `<Atlas>` plumbing: rotation, once-per-tileset mirrored image for `flip` tiles, clock-driven buffer for `animationFrames` tiles |
| `entitySprite.ts` | Shared camera+entity-scale screen-position math (`toScreenPoint`, `snapToDevicePixel`) used by the character and every item |
| `portals.ts` | Watches the character's position against the active scene's portals; fires a scene switch on a deliberate crossing |
| `characterSheet.ts` | Sprite-sheet geometry + animation clips |
| `Character.tsx` | Draws one 16x32 frame |
| `useCharacter.ts` | Movement, collision and frame timing on the UI thread |
| `items/itemCatalog.ts` | Every placeable item, as data |
| `items/useWorldItems.ts` | Placed items, mutations, collision rects |
| `items/ItemLayer.tsx` | Layer passes and y-sorting |
| `items/DevInventory.tsx` | Throwaway test UI, not the shop |

`src/engine/`, `src/stores`, `src/hooks` etc. exist but are **empty** scaffolding. Don't spread
code across two conventions without deciding to migrate first.

## Design decisions that must not be quietly reverted

- **All game logic is in room pixels** (16 px = one tile). One `<Group transform>` in HomeScreen
  applies an integer scale and centres the scene. Nothing else deals with screen units.
- **Integer scale only.** Fractional scaling makes pixel art uneven.
- **`sampling={PIXEL_ART}` (Nearest / no mipmap) on every image**, or the art turns blurry.
- **Sprite frames are drawn with `<Atlas>`**, because Skia's `<Image>` has no source rect.
- **Per-frame work never touches React.** Movement and animation are Reanimated shared values
  driven by `useFrameCallback`, feeding `useRectBuffer` / `useRSXformBuffer`.
- **Y-sorting without re-renders:** each `object` item renders in two passes (behind/front) and
  the UI thread toggles which copy is visible via `opacity`. Never re-sort the scene in React
  every frame.
- **Data-driven catalogs.** Room styles are two numbers; items are a table. A shop, saving,
  unlocking and an outdoor scene are all supposed to reuse these tables unchanged. A placed item
  is `{ instanceId, itemId, x, y }` and nothing else, so the world stays JSON-serialisable.
- **`footprint` in the item catalog does three jobs at once:** collision box, y-sort baseline, and
  placement anchor. That is why a floor lamp only blocks its base.
- **One `Scene` shape for every scene.** `HomeScreen.tsx` picks which to mount from a single
  `SCENES` lookup table; nothing else branches on `sceneId`. A new scene (a garden, a second
  room) means producing a `Scene`, not writing a parallel renderer.
- **The character and every placed item draw at their own `entityScale`**, outside the tile
  layer's scaled `<Group>` (see `entitySprite.ts`). This is deliberately decoupled from the
  world's own zoom (`worldScale`) so the camera can show more of a scene without shrinking
  everything drawn in it.
- **Both the camera and every entity's screen position snap to the device-pixel grid**
  (`entitySprite.ts`'s `snapToDevicePixel`, using `PixelRatio.get()` - not a whole RN point,
  which is several real pixels and snapping to it reads as choppy). Both must snap to the
  *same* grid or the tile layer and the character visibly fight each other's motion.
- **Tiled's per-cell flip/rotate bits and per-tile `<animation>` blocks are decoded once**,
  at scene-build time (`villageLayout.ts`), into the `Tile` shape (`rotate`/`flip`/
  `animationFrames`). The renderer (`atlas.ts`/`SceneLayers.tsx`) only ever special-cases on
  those two booleans - up to 4 batched `<Atlas>` calls per (layer, tileset), never one draw
  call per tile.

## Asset facts (measured, don't re-derive)

The pack lives at `~/moderninteriors-win`. Its own reference is
`2_Characters/Character_Generator/Spritesheet_animations_GUIDE.png`.

**Character sheets** (`Premade_Character_XX.png`, 896x656): frames are **16 wide x 32 tall**,
grid of 56 x 20. Feet touch the bottom edge → anchor bottom-centre. One row per animation;
four-directional rows hold four blocks in the order **right, up, left, down**.
Rows: 1 idle(6) · 2 walk(6) · 3 sleep(6, front only) · 4-5 sit(6, right/left only) · 6 phone(12) ·
7 book(12) · 8 push cart · 9 pick up · 10 gift · 11 lift · 12 throw · 13 hit · 14 punch · 15 stab ·
16 grab gun · 17 gun idle · 18 shoot · 19 hurt. **There is no run animation** — use walk at higher fps.

**Room_Builder tilesets:** styles are 3x2 tile blocks. Floors are repeating patterns (tile with
`col % 3`, `row % 2`). Walls are a horizontal 3-slice, two tiles tall (col 0 end cap, 1 seamless
middle, 2 end cap). Style numbering runs down the leftmost column first; see the generated
`docs/tile-styles-floors.png` and `docs/tile-styles-walls.png`.

## Mistakes we already made — do not repeat them

1. **Guessed the sprite grid was 32x32.** It is 16x32. Measure sprite geometry from the pixels
   (alpha bands, mirror symmetry) before writing code against it. The same check proved the
   direction order is right/up/left/down, which is not the order you would assume.
2. **Named a data module `room.ts` next to a component `Room.tsx`.** macOS is case-insensitive;
   tsc fails with a casing collision. Never let a module and a component differ only in case.
3. **Debugged a missing sprite for a long time when Fast Refresh was the cause.** Adding or
   reordering hooks in a mounted component orphans the Reanimated mappers behind
   `useRectBuffer` / `useFrameCallback`, so the sprite rect stays `(0,0,0,0)` and the entity
   silently draws nothing — no error, no red screen, clean device log, while static Skia nodes
   keep working. **Force a full reload before investigating a missing or frozen Skia sprite.**
4. **Wrote a collision fallback that could "succeed" while moving zero pixels.** The axis-slide
   branch tested proposed-x against current-y; when the blocked axis was the only one left, the
   step was ~0, the test passed, and the character ran in place against furniture forever while
   the "give up" branch stayed unreachable. Any movement loop needs a **progress watchdog**:
   if the distance to the target has not shrunk for a while, drop the target and go idle.
5. **Let the character spawn inside an obstacle.** It was trapped permanently, because every
   direction was blocked. Collision is now skipped while the character is already inside a
   footprint, so it can walk out.
6. **Assumed an animation existed because a row looked like it** (thought row 17 was running).
   The pack ships a labelled guide image; check it instead of interpreting sprites.
7. **`useAnimatedReaction`'s first callback after mount has `previousIndex === null`,** which
   trivially differs from any real value. A portal-trigger check that fired on "index changed since
   last time" fired spuriously on the very first evaluation whenever a scene's arrival spawn point
   sat inside a trigger and the gating flag (`controlled`) turned true before that first evaluation
   ran - looking exactly like the character crossing the boundary, when it had never moved. Fixed
   by owning an explicit `hasSettled` shared value instead of depending on that Reanimated
   internal's behaviour (real, but never a documented contract). See `src/game/portals.ts`.
8. **A moving camera needs to snap to whole pixels, and snapping to a whole *point* is not
   enough.** Fractional camera/entity positions (continuous movement) left hairline gaps between
   adjacent tiles for one frame at a time - the canvas's own background colour showing through as
   a flickering seam, worst on large flat areas like grass. The fix (round the camera translate and
   every entity's screen position to the same grid) initially used `Math.round` on RN points, which
   made motion visibly choppy - a point is several real device pixels (`PixelRatio.get()`, 3 on a
   typical iPhone), so that was 3x coarser than the screen can actually show. Round to the nearest
   *device* pixel (`Math.round(v * density) / density`), not the nearest point.
9. **Re-running `scripts/import-village-map.mjs` always imports whatever is currently in the live
   `.tmx` file** - there is no way to import "just this one thing" from it. If the user has
   unrelated in-progress edits in Tiled when you re-run it for an unrelated reason (e.g. testing an
   importer change), the regenerated `villageMap.generated.ts` silently carries those edits too.
   Always check `git diff --stat` on the regenerated file before committing; if it contains changes
   you didn't intend, `git checkout --` it back and patch narrowly instead (e.g. with a small script
   that edits just the new field), rather than importing the user's in-progress work without asking.

## Rules we follow

- **Verify before writing code.** Analyse the assets (Python + Pillow is the tool used here) and
  render a mock of the result. It is far cheaper than a device round-trip.
- **Verify after writing code**, and say plainly what was *not* verified. `tsc` green is the floor,
  not the ceiling; take a screenshot and look at it.
- **Touch tooling: `idb` is installed** (`idb_companion` + the `idb` CLI, via `brew tap facebook/fb
  && brew install idb-companion` + `pip3 install fb-idb`). Start the companion once per simulator
  boot (`idb_companion --udid <udid> &`), then `idb ui tap --udid <udid> <x> <y>`. In practice its
  coordinate space did not line up reliably with either the simulator's points (`idb describe`'s
  `width_points`/`height_points`) or its raw screenshot pixels in this project - taps landed
  noticeably off-target even after accounting for both, and pinning down the actual mapping wasn't
  worth the time. For anything needing a *precise* room-pixel target (e.g. hitting a small trigger
  zone), prefer seeding state in code (call `walkTo(x, y)` etc. directly from a `// TEMP` effect)
  over calculating tap coordinates - it is exact and it is what actually caught mistake #7 below.
  Reach for a real `idb ui tap` only when a genuine touch round-trip (not just a resulting
  position) is what's being verified, and confirm the target visually before trusting the result.
- **`runOnJS(console.log)` throws and freezes the whole UI-thread runtime.** Worklets rejects
  passing `console.log` straight to `runOnJS` ("locally defined function passed to scheduleOnRN") -
  the exception silently halts every worklet on that thread, including unrelated `useFrameCallback`
  loops, which looks exactly like a frozen/stuck character. Wrap it first:
  `const log = (...a) => console.log(...a); runOnJS(log)(...)`.
- **Temporary scaffolding is removed before reporting.** Mark it `// TEMP` and grep for it.
- **Don't invent art.** Compose from pack tiles; if a piece is missing, say so.
- **Keep the renderer style-agnostic.** New art variants should be data, not code branches.
- Code and comments in English; conversation with the user in Norwegian.

## Before you change anything

- Read `AGENTS.md`: the exact Expo v57 docs must be consulted before writing Expo code.
- Room style, size and walkable area all derive from `roomConfig.ts` — change the config, not the
  layout code. Changing `columns`/`rows` also changes the on-screen scale.
- Item `footprint` values are hand-measured estimates. Adjusting them only affects collision and
  sorting; that is the intended tuning knob.
- The dev inventory is disposable. The item catalog, the world state and the layer system are not —
  they are meant to survive into the real shop.
- The village's source Tiled project (`map.tmx` + its tileset images) lives at
  `~/SERENE_VILLAGE_REVAMPED/maps/`, **outside this repo and not in git** — the path is hardcoded
  as `SOURCE_TMX` at the top of `scripts/import-village-map.mjs`. Re-run that script after Emil
  edits the map in Tiled; see mistake #9 above before doing this for any *other* reason.
- Portals live in scene data, not code: `Scene.portals` (a trigger `Bounds` + which scene/spawn it
  leads to). Adding a second room or a garden mainly means giving its `Scene` a portal that points
  back the way it came — `HomeScreen.tsx` doesn't need to change.

## For my self (Emil)

Resume this session with `claude --resume` (pick from the list — the ID changes every session,
not worth hardcoding here). If Claude Code seems unaware of recent context, tell it to read this
file — it is kept current on purpose, exactly for that.

