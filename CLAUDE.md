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
- **A second character**: an ambient **wandering villager** (`WanderingNpc`) in the
  village - never tapped, never triggers portals, keeps to a small patch near its spawn.
  Driven by `Scene.wanderingNpc` data (the room has none, so it mounts nothing there).
- **Camera** (`useCamera`): follows the character; a pan or pinch is a **one-way handoff**
  (following stops for the scene's life). Seam-snapped to the device-pixel grid.
- **Pinch-to-zoom**: the world/tile scale is a shared value a pinch drives *continuously*
  (fractional in between) and eases onto a **whole number on release** (pixel art shimmers
  at a fractional scale). Stays centred on the fingers. Character/furniture scale locked to
  the tile scale (`entityScale = worldScale x 2`) so proportions never shift.
- **Decorate**: a throwaway **dev inventory** with a Move/Delete edit mode. Dragging
  validates against ground layers and against every other item (never overlap), shows a
  yellow/red highlight, freezes the characters + camera meanwhile.
- **Scenery** (trees/rocks/bushes): free-standing, Y-sorted against the character and
  placed items - so you walk *behind* a tree top and *in front* of its trunk. Batched into
  per-map-row bands for performance (see Design decisions).
- **Removable scenery + a currency HUD**: village scenery Tiled tags with a `group`
  property (a multi-tile tree, say `tree_04`) becomes a `SceneryGroup` - tap it to select
  (a highlight + a floating "remove for N" button), confirm to spend currency and remove it
  for the session (collision/placement clear too). A top-right badge (`useWallet` +
  `CurrencyHud`) shows the balance, starting at 100. See `village/villageLayout.ts`'s
  `removeVillageSceneryGroup` and HomeScreen.tsx's `tryRemoveScenery`.

Not in: **no persistence** (everything resets on restart and on a scene switch, the wallet
and removed-scenery set included), **no shop** (currency's only sink today is removing
scenery), **no Screen Time integration**, **no navigation** (`App.tsx` mounts `HomeScreen`
directly), no door art on the room's exit wall.

## Where this is going (read before any big structural change)

The reward loop is: **reduced phone use -> currency -> unlock/buy decor**. Everything
below is a prerequisite, roughly in order. Design new code so it doesn't have to be
un-picked when these land.

1. **Persistence.** The single most valuable next step and a prerequisite for the rest.
   `useWorldItems` already has `serialize`/`restore` and the placed-item shape (`{itemId,
   x, y}`) is final - just not wired to storage. **The seam that has to move:** per-scene
   item state currently lives *inside* `SceneStage`, which remounts on every scene switch,
   so switching village<->room drops placements. It needs to live *above* `SceneStage` -
   a store (plain module + `useSyncExternalStore`, or a context) keyed by `sceneId`,
   loaded once at startup, saved on change. Pick the storage tech first (`expo-sqlite`,
   `react-native-mmkv`, or `@react-native-async-storage/async-storage` - MMKV is the
   fastest and simplest for a key-value blob; SQLite if the data model grows).
2. **Currency / wallet.** `useWallet()` (`game/economy/`) already exists with `balance`,
   `accrue(amount, source)`, `spend(amount)` - source-agnostic on purpose, so a daily
   check-in, a timer, and later a Screen-Time threshold event can all just call `accrue`
   without this hook changing. Its first (only) spender today is removing scenery
   (`HomeScreen.tsx`'s `tryRemoveScenery`, a flat cost per group). **Not persisted** - that
   still needs #1 above; once it lands, `useWallet` is the thing to wire to storage. The
   eventual shop reads `balance` and calls `spend` the same way; unlocking is
   `itemCatalog`'s job (it already models "unlocked" - see `unlockedItems()`).
3. **Screen Time / Family Controls.** Ties rewards to real reduced phone use - the actual
   point. Facts so this doesn't need re-researching:
   - The community package `react-native-device-activity` wraps Apple's
     `FamilyControls` / `DeviceActivity` / `ManagedSettings`.
   - Needs (a) Apple's approval of a **"Family Controls (Distribution)" entitlement** -
     apply early, it's an external bottleneck on its own timeline; (b) **native iOS app
     extensions**, which means adding **config plugins** and running `expo prebuild`
     (the repo is already set up for Continuous Native Generation - `/ios` and `/android`
     are gitignored, regenerated by prebuild - so this is a config-plugin + `prebuild`
     change, not a rewrite, but it does move the dev loop onto a native build). EAS Build
     for distribution.
   - Apple does **not** expose raw per-app usage minutes to third parties - only
     threshold-crossing **events** and an Apple-rendered report view. So the reward loop
     must be designed around *events* (crossed 30 min under budget -> `accrue(...)`), not
     a live counter.
   - iOS only, no Android equivalent. Since iOS 16.4-ish a user can self-authorize (not
     just a parent for a child), which is the case here (monitoring yourself).
4. **Navigation.** A shop screen, a Screen-Time settings/permission screen and the world
   view can't all be `HomeScreen`. When a second screen is real, add a navigator
   (`expo-router` fits the Expo setup; `@react-navigation/native` is the alternative) -
   `HomeScreen` becomes one route.

## Stack

Versions are in `package.json` (Expo SDK 57, RN 0.86, Reanimated 4, Skia 2.6). Deliberately
**no gesture-handler** (PanResponder everywhere), **no state library**, **no navigator**,
**no test runner** - don't add one without deciding to migrate. `/ios` and `/android` are
generated by `expo prebuild` and gitignored.

## Running it

Needs a native dev build (Skia + dev-client), already installed on the iOS simulator.

```bash
npx expo start --dev-client                 # Metro (leave it in its own terminal)
xcrun simctl openurl booted "exp+mindscape://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
xcrun simctl io booted screenshot /tmp/shot.png
```

Run `npx expo run:ios` only when native code or dependencies change. `npx tsc --noEmit`
must be green before anything is "done" - there is **no ESLint config and no test runner**,
so tsc + a screenshot is the whole safety net.

## Architecture

`App.tsx` is a thin wrapper. `src/screens/HomeScreen/` holds the world view;
`src/game/` holds everything reusable.

### The world view (`src/screens/HomeScreen/`)

| File | Responsibility |
|---|---|
| `HomeScreen.tsx` | `HomeScreen` owns which scene is active (a `SCENES` lookup, remounted on portal), the wallet, and which scenery has been removed - all above `SceneStage` so a scene switch doesn't reset them. `SceneStage` mounts the scene's hooks, composes `depthEntities` (bands + `SceneryGroup`s + items), and renders the Canvas + the removal prompt. ~440 lines - **keep it composition-only**; new mechanics go in a hook. |
| `useSceneGestures.ts` | The one `PanResponder` for the view - multiplexes pinch / item-drag / camera-pan / tap-to-walk, built once, reads state through refs + `useCamera`'s live values. Owns the drag-highlight state. |

### Engine (`src/game/`)

| File | Responsibility |
|---|---|
| `scene.ts` | The `Scene` / `Tile` / `Portal` / `SceneSceneryBand` / `SceneryGroup` shapes both scenes produce - **read this first**. Optional fields (`sceneryBands`, `sceneryGroups`, `wanderingNpc`, `tileCollision`, `placementMask`, `topLayerName`) let a scene opt in to a feature; a scene without one costs nothing. |
| `useCamera.ts` | The camera as a unit: `worldScale` + split `cameraX/cameraY` shared values, `transform`, `entityProps`, the follow frame-loop, and stable methods (`toRoomPoint`, `panBy`, `zoomAbout`, `settleZoom`). Its header lists the rules that must not be reverted. Owns `ENTITY_SCALE_MULTIPLIER` and `MIN/MAX_WORLD_SCALE`. |
| `useCharacter.ts` | Movement, collision, animation on the UI thread. `frozen` holds it still (edit mode); `wanderArea` pens the idle wander to a box (NPCs). Returns `walkTo` and `controlled` (true only for a tap, so portals ignore idle wandering). |
| `WanderingNpc.tsx` | An ambient character: a `useCharacter` whose `walkTo` is never called, no portal watcher, a different sheet. A component (not a bare hook call) so its `useFrameCallback` stays out of `SceneStage`. |
| `Character.tsx` | Draws one 16x32 frame via `<Atlas>`. `sheet` prop picks the skin (`PLAYER_SHEET` / `NPC_SHEET`). |
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
| `economy/useWallet.ts` | `useWallet()`: `balance`, `accrue(amount, source)`, `spend(amount)` - source-agnostic, not yet persisted. See "Where this is going" #2. |
| `economy/CurrencyHud.tsx` | The top-right balance badge - presentational only, `HomeScreen.tsx` owns the wallet and passes the number down. |
| `items/itemCatalog.ts` | Every placeable item as data (size, footprint, layer, animation, `unlocked`). The shop and unlocking are meant to reuse this table unchanged. |
| `items/useWorldItems.ts` | Placed items: state, mutations, collision rects, `isValidPlacement` / `overlapsOtherItem` / `findFreeSpot`, baseline-priority `itemAt` hit-testing, `serialize`/`restore` (unwired). |
| `items/ItemLayer.tsx` | `ItemLayer` (the always-under / always-over passes), `ItemVisual` (one item, animated/static switch, used by the depth-sorted pass), `PlacedItemSprite` (with the behind/front toggle). |
| `items/DragHighlight.tsx` | Yellow/red glow + drop-shadow on the held item. |
| `items/DevInventory.tsx` | Throwaway test UI - **not the shop**. The catalog, world state and layer system are meant to survive into the real shop; this isn't. |
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
idle · 18 shoot · 19 hurt. **No run animation** - walk at higher fps. `03` is the player,
`20` is the NPC (grey hair, glasses).

**Room_Builder tilesets:** styles are 3x2 tile blocks. Floors repeat (`col % 3`, `row %
2`). Walls are a horizontal 3-slice, two tiles tall. See generated `docs/tile-styles-*.png`.

**Village map** (`~/SERENE_VILLAGE_REVAMPED/maps/map.tmx`, **outside the repo, not in
git** - path hardcoded as `SOURCE_TMX` in the importer). 120 x 80 tiles, 16px. Layers use
a `ground_* / deco_* / col_*` naming scheme (`ground_grass`, `ground_water_collision`,
`ground_beach`, `ground_paths`, `ground_bridges`, `ground_fences_collision`,
`deco_small_extras`, `col_house_collision`). Trees/rocks/bushes are **not** a layer - the
importer emits them as `VILLAGE_SCENERY` (~1500 pieces). A tile object tagged with a
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
cell coordinates if noticed rather than guessing which one is "correct".
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

## For my self (Emil)

Resume with `claude --resume`. If Claude Code seems unaware of recent context, tell it to
read this file - it is kept current on purpose.
