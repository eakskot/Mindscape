import { ITEM_CATALOG, type ItemId } from "../items/itemCatalog";
import { SHOP_PRICES } from "./economyConfig";

export type NextGoal =
  | { kind: "canAfford"; itemId: ItemId; label: string; price: number }
  | { kind: "saving"; itemId: ItemId; label: string; price: number };

/**
 * The one shop item worth nudging the user toward, for TodayCard's goal
 * line. Pure - balance and ownership in, a goal (or null) out.
 *
 * - Something unowned is affordable -> the *most expensive* affordable one
 *   ("You can afford <name>" - the most exciting thing in reach).
 * - Otherwise -> the cheapest unowned item ("Next goal: <name> · n/price").
 * - No priced, unowned items at all -> null (the line hides).
 *
 * Purchasing isn't wired yet (Shop is read-only), so callers pass no
 * `owned` set today and every item counts as unowned.
 */
export function nextGoal(balance: number, owned: ReadonlySet<ItemId> = new Set()): NextGoal | null {
  const candidates = (Object.keys(SHOP_PRICES) as ItemId[])
    .filter((id) => !owned.has(id) && ITEM_CATALOG[id])
    .map((id) => ({ itemId: id, label: ITEM_CATALOG[id].label, price: SHOP_PRICES[id] }))
    .sort((a, b) => a.price - b.price);
  if (candidates.length === 0) return null;

  const affordable = candidates.filter((c) => c.price <= balance);
  if (affordable.length > 0) {
    return { kind: "canAfford", ...affordable[affordable.length - 1] };
  }
  return { kind: "saving", ...candidates[0] };
}
