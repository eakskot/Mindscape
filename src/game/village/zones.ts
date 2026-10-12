import { ZONE_PRICES } from "../economy/economyConfig";
import {
  VILLAGE_COLUMNS,
  VILLAGE_ROWS,
  VILLAGE_SPAWN,
  VILLAGE_TILE,
  VILLAGE_ZONES,
  type VillageZoneDef,
} from "./villageMap.generated";

/**
 * The village's zones - the division of the map into named regions.
 *
 * INERT on this branch: nothing imports this file, so it isn't bundled and
 * has no runtime effect. The full zone gameplay (cloud layer, locked-zone
 * collision, restore prompt, persistence via ZonesContext) was reverted at
 * Emil's request (2026-10-12) and lives on the `archive/zones-clouds`
 * branch, which is what the references below point to.
 *
 * Bounds come from Tiled when map.tmx has a `zones` object layer (the
 * importer emits `VILLAGE_ZONES`), otherwise from `DEFAULT_ZONES` below.
 * Prices always come from economyConfig.ts's ZONE_PRICES when it has the id.
 *
 * Zones may overlap - a cell belongs to the zone with the lowest `order`
 * that contains it (so `home` keeps the long bridge even though
 * `lookout_isle`'s rectangle starts higher up). Cells in no zone at all are
 * always open.
 *
 * Plain data, no React/Reanimated - villageLayout.ts imports it to build
 * the collision grid.
 */

export type Zone = {
  id: string;
  name: string;
  price: number;
  order: number;
  /** Inclusive tile bounds of the zone's rectangle (before overlap priority). */
  minCol: number;
  minRow: number;
  maxCol: number;
  maxRow: number;
  /** Price 0 or contains the spawn - can never be locked, not even by "Re-lock all". */
  alwaysUnlocked: boolean;
  /**
   * The cells this zone actually owns after overlap priority, as tile
   * rectangles (row runs merged vertically). What collision, the haze and
   * hit-testing use - never the raw rectangle.
   */
  ownedRects: TileRect[];
  /** Centre of the owned area, in room pixels - the reveal animation's origin. */
  centerX: number;
  centerY: number;
  /** Owned tile count. */
  area: number;
};

export type TileRect = { minCol: number; minRow: number; maxCol: number; maxRow: number };

/** Used when map.tmx has no `zones` object layer. Tile coordinates, inclusive. */
const DEFAULT_ZONES: VillageZoneDef[] = [
  { id: "home", name: "Home", price: 0, order: 0, minCol: 38, minRow: 36, maxCol: 77, maxRow: 68 },
  { id: "lookout_isle", name: "Lookout Isle", price: 150, order: 1, minCol: 38, minRow: 60, maxCol: 60, maxRow: 79 },
  { id: "sandy_bay", name: "Sandy Bay", price: 350, order: 2, minCol: 0, minRow: 38, maxCol: 37, maxRow: 66 },
  { id: "north_meadow", name: "North Meadow", price: 600, order: 3, minCol: 0, minRow: 0, maxCol: 83, maxRow: 35 },
  { id: "east_road", name: "East Road", price: 1000, order: 4, minCol: 84, minRow: 0, maxCol: 119, maxRow: 79 },
];

const defs = [...(VILLAGE_ZONES ?? DEFAULT_ZONES)].sort((a, b) => a.order - b.order);

/**
 * Per-cell owner: 0 = no zone, otherwise index + 1 into `ZONES`. Built once.
 */
export const ZONE_OWNER_GRID = new Uint8Array(VILLAGE_COLUMNS * VILLAGE_ROWS);
defs.forEach((def, index) => {
  for (let row = Math.max(0, def.minRow); row <= Math.min(VILLAGE_ROWS - 1, def.maxRow); row++) {
    for (let col = Math.max(0, def.minCol); col <= Math.min(VILLAGE_COLUMNS - 1, def.maxCol); col++) {
      const cell = row * VILLAGE_COLUMNS + col;
      if (ZONE_OWNER_GRID[cell] === 0) ZONE_OWNER_GRID[cell] = index + 1;
    }
  }
});

/** Merges a zone's owned cells into rectangles: one run per row, then identical runs stacked. */
const ownedRectsFor = (owner: number): TileRect[] => {
  const rects: TileRect[] = [];
  let open: TileRect[] = [];
  for (let row = 0; row < VILLAGE_ROWS; row++) {
    const runs: TileRect[] = [];
    let start = -1;
    for (let col = 0; col <= VILLAGE_COLUMNS; col++) {
      const mine = col < VILLAGE_COLUMNS && ZONE_OWNER_GRID[row * VILLAGE_COLUMNS + col] === owner;
      if (mine && start < 0) start = col;
      if (!mine && start >= 0) {
        runs.push({ minCol: start, maxCol: col - 1, minRow: row, maxRow: row });
        start = -1;
      }
    }
    const next: TileRect[] = [];
    for (const run of runs) {
      const above = open.find((r) => r.minCol === run.minCol && r.maxCol === run.maxCol);
      if (above) {
        above.maxRow = row;
        next.push(above);
      } else {
        next.push(run);
      }
    }
    rects.push(...open.filter((r) => !next.includes(r)));
    open = next;
  }
  rects.push(...open);
  return rects;
};

const spawnCol = Math.floor(VILLAGE_SPAWN.x / VILLAGE_TILE);
const spawnRow = Math.floor((VILLAGE_SPAWN.y - 1) / VILLAGE_TILE);

export const ZONES: Zone[] = defs.map((def, index) => {
  const ownedRects = ownedRectsFor(index + 1);
  let area = 0;
  let sumX = 0;
  let sumY = 0;
  for (const r of ownedRects) {
    const a = (r.maxCol - r.minCol + 1) * (r.maxRow - r.minRow + 1);
    area += a;
    sumX += a * ((r.minCol + r.maxCol + 1) / 2) * VILLAGE_TILE;
    sumY += a * ((r.minRow + r.maxRow + 1) / 2) * VILLAGE_TILE;
  }
  const price = ZONE_PRICES[def.id] ?? def.price;
  const containsSpawn = ZONE_OWNER_GRID[spawnRow * VILLAGE_COLUMNS + spawnCol] === index + 1;
  return {
    id: def.id,
    name: def.name,
    price,
    order: def.order,
    minCol: def.minCol,
    minRow: def.minRow,
    maxCol: def.maxCol,
    maxRow: def.maxRow,
    alwaysUnlocked: price <= 0 || containsSpawn,
    ownedRects,
    centerX: area > 0 ? sumX / area : 0,
    centerY: area > 0 ? sumY / area : 0,
    area,
  };
});

/** The zone owning a room-pixel point, or null (outside every zone / off the map). */
export const zoneAtPoint = (roomX: number, roomY: number): Zone | null => {
  const col = Math.floor(roomX / VILLAGE_TILE);
  const row = Math.floor(roomY / VILLAGE_TILE);
  if (col < 0 || row < 0 || col >= VILLAGE_COLUMNS || row >= VILLAGE_ROWS) return null;
  const owner = ZONE_OWNER_GRID[row * VILLAGE_COLUMNS + col];
  return owner > 0 ? ZONES[owner - 1] : null;
};
