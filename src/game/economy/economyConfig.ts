/**
 * Every coin amount in the game. Unit: a typical good day (engine armed,
 * all 3 tickets left unused, clean, mid streak) nets roughly 50 coins -
 * tune new rewards against that, not in isolation.
 */
export const ECONOMY = {
  STARTING_BALANCE: 100,

  /** Paid per unused ticket at day settlement. */
  UNUSED_TICKET_BONUS: 10,
  /** Paid once per day if the engine was armed the whole day and the emergency valve wasn't used. */
  CLEAN_DAY_BONUS: 10,

  /** Daily streak bonus is `STREAK_DAILY_BONUS_PER_DAY * min(streak, STREAK_DAILY_BONUS_CAP_DAYS)`. */
  STREAK_DAILY_BONUS_PER_DAY: 2,
  STREAK_DAILY_BONUS_CAP_DAYS: 10,
  /** One-off bonuses paid the day the streak *reaches* this many consecutive clean days. */
  STREAK_MILESTONES: { 3: 25, 7: 75, 14: 150, 30: 400 } as Record<number, number>,

  /** `floor(minutes * FOCUS_COIN_PER_MIN)`, capped at FOCUS_MAX_REWARDED_MIN minutes/day. */
  FOCUS_COIN_PER_MIN: 0.5,
  FOCUS_MAX_REWARDED_MIN: 60,

  /** One-time, paid once each, ever. */
  FIRST_ARM_BONUS: 50,
  FIRST_FOCUS_BONUS: 20,

  SCENERY_REMOVAL_COST: 25,
} as const;

export const SHOP_PRICES = {
  basketball: 25,
  fruit_citrus: 25,
  plant_stand: 30,
  plant_fern: 35,
  plant_medium: 40,
  lamp: 50,
  plant_long: 100,
  plant_topiary: 110,
  table_medium: 120,
  guitar_red: 150,
  bed_green: 150,
  fountain_small: 175,
  plant_palm_big: 250,
  plant_fern_bloomed: 250,
  bed_purple: 300,
  fountain_statue: 400,
  piano_gold: 600,
  fountain_tiered: 800,
  dinosaur_skeleton: 1000,
} as const;

/**
 * What restoring each village zone costs, keyed by zone id (see
 * village/zones.ts - currently inert, the gameplay is on the
 * `archive/zones-clouds` branch). Wins over a `price` property set in Tiled, so prices
 * are tuned here, not in the map. 0 = the zone starts unlocked.
 */
export const ZONE_PRICES: Record<string, number> = {
  home: 0,
  lookout_isle: 150,
  sandy_bay: 350,
  north_meadow: 600,
  east_road: 1000,
};
