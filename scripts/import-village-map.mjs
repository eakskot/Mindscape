#!/usr/bin/env node
/**
 * Imports a crop of the Serene Village Tiled map into the game.
 *
 * Reads the .tmx directly (regex-based - the map only uses inline tilesets
 * and plain CSV layer data, so a full XML parser is not needed), crops every
 * layer down to the configured window, copies the tileset images into the
 * app, and writes a generated data module the game imports at build time.
 * Tiled's per-tile flip/rotate bits are kept as-is in the exported GIDs -
 * villageLayout.ts decodes them into each Tile's rotate/flip at scene-build
 * time, not here, so this script stays a dumb crop-and-copy step. Per-tile
 * <animation> blocks (Tiled's own animated-tile feature, e.g. water waves)
 * are read here, though, since they live inside each <tileset>'s own XML -
 * not something a per-cell GID decode could ever recover.
 *
 * Re-run this after editing map.tmx in Tiled:
 *   node scripts/import-village-map.mjs
 *
 * Edit the constants below to change which part of the map is imported, or
 * where the character spawns.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_TMX = "/Users/emilskotner/SERENE_VILLAGE_REVAMPED/maps/map.tmx";
const SOURCE_DIR = dirname(SOURCE_TMX);

// Crop window, in the source map's tile coordinates. The camera follows the
// character now, so there is no need to crop down to a single screen's
// worth of tiles - this imports the whole map. (Set these to a sub-window
// instead if you ever want to import less than the full map.)
const CROP_ORIGIN_COL = 0;
const CROP_ORIGIN_ROW = 0;
const CROP_WIDTH = 120;
const CROP_HEIGHT = 80;

// Where the character spawns, in the source map's tile coordinates. Must
// fall inside the crop window above.
const SPAWN_COL = 56;
const SPAWN_ROW = 50;

const TILE = 16;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const ASSETS_TILES_DIR = join(REPO_ROOT, "src/assets/tiles");
const OUTPUT_FILE = join(
  REPO_ROOT,
  "src/game/village/villageMap.generated.ts",
);

const content = readFileSync(SOURCE_TMX, "utf8");

const mapMatch = content.match(/<map\b[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"/);
if (!mapMatch) {
  throw new Error(`Could not find <map width height> in ${SOURCE_TMX}`);
}
const mapWidth = Number(mapMatch[1]);
const mapHeight = Number(mapMatch[2]);

/**
 * Inline tilesets only - this map does not reference external .tsx files.
 * Captures each tileset's own inner XML too (group 7), so animated-tile
 * definitions - which live inside <tile id="X"><animation>...</animation>
 * blocks nested in the tileset, not per-cell - can be pulled from the right
 * tileset's own local id space.
 */
const tilesets = [];
const tilesetRe =
  /<tileset firstgid="(\d+)" name="([^"]+)"[^>]*\bcolumns="(\d+)"[^>]*>\s*<image source="([^"]+)" width="(\d+)" height="(\d+)"[^>]*\/?>([\s\S]*?)<\/tileset>/g;

/**
 * All animation frames within one <tileset>'s XML, keyed by the animated
 * tile's own local id. Every animation in this map so far uses a uniform
 * duration across all its frames, so that's what's stored (not a per-frame
 * duration array) - accurate today, and simpler for the game to consume;
 * revisit if a future animation actually needs uneven frame timing.
 */
const parseAnimations = (tilesetXml) => {
  const animations = {};
  const tileRe = /<tile id="(\d+)">\s*<animation>([\s\S]*?)<\/animation>/g;
  for (const tileMatch of tilesetXml.matchAll(tileRe)) {
    const localId = Number(tileMatch[1]);
    const frameRe = /<frame tileid="(\d+)" duration="(\d+)"\s*\/>/g;
    const frames = [];
    const durations = new Set();
    for (const frameMatch of tileMatch[2].matchAll(frameRe)) {
      frames.push(Number(frameMatch[1]));
      durations.add(frameMatch[2]);
    }
    if (frames.length === 0) {
      continue;
    }
    if (durations.size > 1) {
      throw new Error(
        `Tile ${localId}'s animation has mixed frame durations (${[...durations].join(", ")}ms) - the importer assumes one uniform duration per animation, update parseAnimations() to support this.`,
      );
    }
    animations[localId] = { frames, frameDurationMs: Number([...durations][0]) };
  }
  return animations;
};

for (const m of content.matchAll(tilesetRe)) {
  tilesets.push({
    firstGid: Number(m[1]),
    name: m[2],
    columns: Number(m[3]),
    imageFile: m[4],
    imageWidth: Number(m[5]),
    imageHeight: Number(m[6]),
    animations: parseAnimations(m[7]),
  });
}
if (tilesets.length === 0) {
  throw new Error("No inline <tileset> entries found - is this map using external .tsx tilesets?");
}
// Sort by firstGid so a GID→tileset lookup can walk the list once.
tilesets.sort((a, b) => a.firstGid - b.firstGid);

const layerRe =
  /<layer id="\d+" name="([^"]+)"[^>]*>\s*<data encoding="csv">\s*(.*?)\s*<\/data>/gs;
const layers = [];
for (const m of content.matchAll(layerRe)) {
  const name = m[1];
  const gids = m[2]
    .replace(/\n/g, "")
    .split(",")
    .filter((s) => s.trim() !== "")
    .map((s) => Number(s));
  if (gids.length !== mapWidth * mapHeight) {
    throw new Error(
      `Layer "${name}": expected ${mapWidth * mapHeight} cells, got ${gids.length}`,
    );
  }
  // The map's own authoring convention: a layer named "*_collision" both
  // draws and blocks movement (see villageLayout.ts). Decided here, once,
  // at the point that already knows this convention, rather than having
  // every consumer re-derive it by pattern-matching the layer's name.
  layers.push({ name, gids, collision: name.endsWith("_collision") });
}
if (layers.length === 0) {
  throw new Error("No <layer> entries found in the map.");
}

const cropLayer = (gids) => {
  const cropped = new Array(CROP_WIDTH * CROP_HEIGHT);
  for (let row = 0; row < CROP_HEIGHT; row++) {
    for (let col = 0; col < CROP_WIDTH; col++) {
      const sourceCol = CROP_ORIGIN_COL + col;
      const sourceRow = CROP_ORIGIN_ROW + row;
      // Kept as the raw GID, flip bits and all - see the file header.
      cropped[row * CROP_WIDTH + col] = gids[sourceRow * mapWidth + sourceCol];
    }
  }
  return cropped;
};

if (
  SPAWN_COL < CROP_ORIGIN_COL ||
  SPAWN_COL >= CROP_ORIGIN_COL + CROP_WIDTH ||
  SPAWN_ROW < CROP_ORIGIN_ROW ||
  SPAWN_ROW >= CROP_ORIGIN_ROW + CROP_HEIGHT
) {
  throw new Error("Spawn tile falls outside the crop window - fix the constants at the top of this script.");
}

const spawnLocalCol = SPAWN_COL - CROP_ORIGIN_COL;
const spawnLocalRow = SPAWN_ROW - CROP_ORIGIN_ROW;
// Feet position at the centre of the spawn tile, in local village room pixels.
const spawnX = spawnLocalCol * TILE + TILE / 2;
const spawnY = spawnLocalRow * TILE + TILE / 2;

mkdirSync(ASSETS_TILES_DIR, { recursive: true });
mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
for (const tileset of tilesets) {
  copyFileSync(
    join(SOURCE_DIR, tileset.imageFile),
    join(ASSETS_TILES_DIR, tileset.imageFile),
  );
}

const croppedLayers = layers.map((layer) => ({
  name: layer.name,
  collision: layer.collision,
  gids: cropLayer(layer.gids),
}));

const formatGidRow = (gids, row) =>
  gids.slice(row * CROP_WIDTH, row * CROP_WIDTH + CROP_WIDTH).join(",");

const layersTs = croppedLayers
  .map((layer) => {
    const rows = [];
    for (let row = 0; row < CROP_HEIGHT; row++) {
      rows.push(`      ${formatGidRow(layer.gids, row)},`);
    }
    return `  {\n    name: "${layer.name}",\n    collision: ${layer.collision},\n    gids: [\n${rows.join("\n")}\n    ],\n  },`;
  })
  .join("\n");

const animationsTs = (animations) => {
  const entries = Object.entries(animations);
  if (entries.length === 0) {
    return "{}";
  }
  const lines = entries.map(
    ([localId, a]) =>
      `      ${localId}: { frames: [${a.frames.join(",")}], frameDurationMs: ${a.frameDurationMs} },`,
  );
  return `{\n${lines.join("\n")}\n    }`;
};

const tilesetsTs = tilesets
  .map(
    (t) =>
      `  { name: "${t.name}", firstGid: ${t.firstGid}, columns: ${t.columns}, imageWidth: ${t.imageWidth}, imageHeight: ${t.imageHeight}, animations: ${animationsTs(t.animations)} },`,
  )
  .join("\n");

const output = `/**
 * GENERATED by scripts/import-village-map.mjs — re-run after editing
 * map.tmx in Tiled. Do not hand-edit.
 *
 * Source: ${SOURCE_TMX}
 * Crop: columns ${CROP_ORIGIN_COL}-${CROP_ORIGIN_COL + CROP_WIDTH - 1}, rows ${CROP_ORIGIN_ROW}-${CROP_ORIGIN_ROW + CROP_HEIGHT - 1} (${CROP_WIDTH}x${CROP_HEIGHT} tiles)
 * Spawn: source tile (${SPAWN_COL},${SPAWN_ROW})
 */

export const VILLAGE_TILE = ${TILE};
export const VILLAGE_COLUMNS = ${CROP_WIDTH};
export const VILLAGE_ROWS = ${CROP_HEIGHT};

export type VillageTileAnimation = {
  /** Local tile ids (within this tileset) to cycle through, in order. */
  frames: number[];
  /** How long each frame shows, in ms - uniform across all frames (see parseAnimations() in the importer). */
  frameDurationMs: number;
};

export type VillageTilesetInfo = {
  name: string;
  firstGid: number;
  columns: number;
  imageWidth: number;
  imageHeight: number;
  /** Keyed by the animated tile's own local id (within this tileset). */
  animations: Record<number, VillageTileAnimation>;
};

/** Sorted by firstGid ascending. */
export const VILLAGE_TILESETS: VillageTilesetInfo[] = [
${tilesetsTs}
];

export type VillageLayer = {
  name: string;
  /**
   * Whether this layer both draws and blocks movement - true for every
   * layer whose Tiled name ends in "_collision", decided here (the one
   * place that knows that authoring convention) rather than re-derived by
   * every consumer pattern-matching \`name\` itself.
   */
  collision: boolean;
  /**
   * Flat GID array, row-major, length VILLAGE_COLUMNS * VILLAGE_ROWS.
   * 0 = empty. Raw GIDs - Tiled's flip/rotate bits (top 3 bits) are still
   * set where used; villageLayout.ts decodes them per-cell.
   */
  gids: number[];
};

/** Bottom-to-top draw order, same as the layer order in Tiled. */
export const VILLAGE_LAYERS: VillageLayer[] = [
${layersTs}
];

/** Feet position at the centre of the spawn tile, in local village room pixels. */
export const VILLAGE_SPAWN = { x: ${spawnX}, y: ${spawnY} };
`;

writeFileSync(OUTPUT_FILE, output);

console.log(`Wrote ${OUTPUT_FILE}`);
console.log(`Copied ${tilesets.length} tileset image(s) to ${ASSETS_TILES_DIR}`);
console.log(`Crop: ${CROP_WIDTH}x${CROP_HEIGHT} tiles at source (${CROP_ORIGIN_COL},${CROP_ORIGIN_ROW})`);
console.log(`Spawn: local pixel (${spawnX},${spawnY})`);
