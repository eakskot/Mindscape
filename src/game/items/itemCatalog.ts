/**
 * The item catalog: every placeable thing in the game, as data.
 *
 * Nothing here knows about rendering, the room, or the shop. Unlocking, saving,
 * animating and outdoor scenes all build on this same table - a shop just filters
 * on `unlocked`, and a save file only stores `itemId` plus a position.
 *
 * `footprint` is the piece of floor the item stands on, in image coordinates.
 * It does three jobs: collision box, the baseline used to sort the item against
 * the character, and the point the item is placed by. It is deliberately smaller
 * than the image for tall items - a floor lamp only occupies its base, the rest
 * of the sprite is height, which the character should be able to stand behind.
 */

export type ItemId =
  | "basketball"
  | "bed_green"
  | "bed_purple"
  | "dinosaur_skeleton"
  | "fountain_small"
  | "fountain_statue"
  | "fountain_tiered"
  | "fruit_citrus"
  | "guitar_red"
  | "lamp"
  | "piano_gold"
  | "plant_fern"
  | "plant_fern_bloomed"
  | "plant_long"
  | "plant_medium"
  | "plant_palm_big"
  | "plant_stand"
  | "plant_topiary"
  | "table_medium";

/**
 * Draw order. `object` is the interesting one: it is sorted against the
 * character so you can stand in front of or behind it.
 *   floorDecal - rugs, floor paths. Always under the character.
 *   object     - furniture. Sorted by baseline.
 *   overhead   - hanging lamps, ceiling things. Always over the character.
 */
export type LayerName = "floorDecal" | "object" | "overhead";

export type Rect = { x: number; y: number; width: number; height: number };

export type ItemDefinition = {
  id: ItemId;
  label: string;
  /** Metro asset reference for the sprite. */
  source: number;
  /** Sprite size in room pixels (16 px = one tile). */
  width: number;
  height: number;
  footprint: Rect;
  layer: LayerName;
  /** Whether the character is blocked by the footprint. */
  solid: boolean;
  /** The shop will flip this. Everything is unlocked while developing. */
  unlocked: boolean;
  /**
   * Horizontal sprite strip, for items that animate (fireplaces, TVs, fountains).
   * Frame size is `width` x `height`; the strip is `frames` frames wide.
   * No catalog item uses this yet.
   */
  animation?: { frames: number; fps: number };
};

/**
 * Footprints were measured from the sprites' opaque bounds; tweak them freely,
 * they only affect collision and sorting.
 */
export const ITEM_CATALOG: Record<ItemId, ItemDefinition> = {
  basketball: {
    id: "basketball",
    label: "Basketball",
    source: require("../../assets/sprites/furniture/basketball.png"),
    width: 16,
    height: 16,
    footprint: { x: 2, y: 6, width: 12, height: 7 },
    layer: "object",
    solid: false,
    unlocked: true,
  },
  bed_green: {
    id: "bed_green",
    label: "Bed (green)",
    source: require("../../assets/sprites/furniture/bed_green.png"),
    width: 16,
    height: 48,
    footprint: { x: 0, y: 6, width: 16, height: 32 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  bed_purple: {
    id: "bed_purple",
    label: "Bed (purple)",
    source: require("../../assets/sprites/furniture/bed_purple.png"),
    width: 16,
    height: 48,
    footprint: { x: 0, y: 6, width: 16, height: 32 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  dinosaur_skeleton: {
    id: "dinosaur_skeleton",
    label: "Dinosaur skeleton",
    source: require("../../assets/sprites/furniture/dinosaur._skeletonpng.png"),
    width: 48,
    height: 48,
    footprint: { x: 0, y: 24, width: 45, height: 15 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  // The three fountains below come from LimeZu's "Modern Exteriors" pack
  // (~/modernexteriors-win), a separate pack from the room's "Modern
  // Interiors" one - see AGENTS.md's own asset-facts section for that one.
  // Each source sprite ships as 4 frames, but they are not a walk-cycle:
  // frames 1/2 are dry and 3/4 have water, while 1/3 are a silver-stone
  // variant and 2/4 gold - two independent two-way toggles, not a sequence.
  // Animating through all 4 in order would flicker between stone colours
  // every loop, so only the silver, water-filled frame (_3) was kept as a
  // static sprite.
  fountain_small: {
    id: "fountain_small",
    label: "Fountain (small)",
    source: require("../../assets/sprites/outdoor/fountain_small.png"),
    width: 32,
    height: 48,
    footprint: { x: 6, y: 38, width: 20, height: 10 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  fountain_statue: {
    id: "fountain_statue",
    label: "Statue fountain",
    source: require("../../assets/sprites/outdoor/fountain_statue.png"),
    width: 48,
    height: 96,
    footprint: { x: 1, y: 82, width: 47, height: 14 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  fountain_tiered: {
    id: "fountain_tiered",
    label: "Fountain (tiered)",
    source: require("../../assets/sprites/outdoor/fountain_tiered.png"),
    width: 64,
    height: 80,
    footprint: { x: 5, y: 66, width: 56, height: 14 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  fruit_citrus: {
    id: "fruit_citrus",
    label: "Fruit bowl",
    source: require("../../assets/sprites/furniture/fruit_citrus.png"),
    width: 16,
    height: 32,
    footprint: { x: 1, y: 18, width: 14, height: 7 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  guitar_red: {
    id: "guitar_red",
    label: "Guitar",
    source: require("../../assets/sprites/furniture/guitar_red.png"),
    width: 16,
    height: 48,
    footprint: { x: 2, y: 36, width: 12, height: 7 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  lamp: {
    id: "lamp",
    label: "Floor lamp",
    source: require("../../assets/sprites/furniture/lamp.png"),
    width: 16,
    height: 48,
    footprint: { x: 2, y: 34, width: 12, height: 7 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  piano_gold: {
    id: "piano_gold",
    label: "Grand piano",
    source: require("../../assets/sprites/furniture/piano_gold.png"),
    width: 32,
    height: 48,
    footprint: { x: 1, y: 30, width: 27, height: 18 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  // The four items below also come from "Modern Exteriors" - see
  // fountain_small's comment above.
  plant_fern: {
    id: "plant_fern",
    label: "Potted fern",
    source: require("../../assets/sprites/outdoor/plant_fern.png"),
    width: 32,
    height: 32,
    footprint: { x: 9, y: 24, width: 16, height: 8 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  plant_fern_bloomed: {
    id: "plant_fern_bloomed",
    label: "Potted fern (flowering)",
    source: require("../../assets/sprites/outdoor/plant_fern_bloomed.png"),
    width: 32,
    height: 32,
    footprint: { x: 9, y: 24, width: 16, height: 8 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  plant_long: {
    id: "plant_long",
    label: "Tall plant",
    source: require("../../assets/sprites/furniture/plant_long.png"),
    width: 16,
    height: 48,
    footprint: { x: 3, y: 34, width: 10, height: 7 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  plant_medium: {
    id: "plant_medium",
    label: "Plant",
    source: require("../../assets/sprites/furniture/plant_medium.png"),
    width: 16,
    height: 32,
    footprint: { x: 3, y: 18, width: 10, height: 7 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  plant_palm_big: {
    id: "plant_palm_big",
    label: "Palm",
    source: require("../../assets/sprites/furniture/plant_palm_big.png"),
    width: 32,
    height: 32,
    footprint: { x: 10, y: 24, width: 12, height: 7 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  plant_stand: {
    id: "plant_stand",
    label: "Plant stand",
    source: require("../../assets/sprites/outdoor/plant_stand.png"),
    width: 16,
    height: 64,
    footprint: { x: 1, y: 54, width: 13, height: 10 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  plant_topiary: {
    id: "plant_topiary",
    label: "Topiary",
    source: require("../../assets/sprites/outdoor/plant_topiary.png"),
    width: 16,
    height: 32,
    footprint: { x: 3, y: 24, width: 10, height: 8 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
  table_medium: {
    id: "table_medium",
    label: "Table",
    source: require("../../assets/sprites/furniture/table_medium.png"),
    width: 32,
    height: 32,
    footprint: { x: 4, y: 14, width: 25, height: 12 },
    layer: "object",
    solid: true,
    unlocked: true,
  },
};

export const ALL_ITEMS: ItemDefinition[] = Object.values(ITEM_CATALOG);

/** What the shop (and the dev inventory) is allowed to show. */
export const unlockedItems = () => ALL_ITEMS.filter((item) => item.unlocked);
