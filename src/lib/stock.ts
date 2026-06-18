/**
 * Sold-out / stock-cap helpers. The authoritative remaining counts are computed
 * in Postgres (booth_remaining_stock); this module parses that result and runs
 * the pure cart-vs-remaining checks shared by the order page and placeOrder.
 *
 * A map only contains items that carry a cap — an absent key means unlimited.
 */
export type Remaining = Record<string, number>;

/** Coerce the booth_remaining_stock JSONB result into a typed Remaining map. */
export function parseRemaining(data: unknown): Remaining {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: Remaining = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.max(0, v);
  }
  return out;
}

/** Remaining for an item: the cap value, or null when the item is uncapped. */
export function remainingFor(
  remaining: Remaining,
  menuItemId: string,
): number | null {
  return Object.prototype.hasOwnProperty.call(remaining, menuItemId)
    ? remaining[menuItemId]
    : null;
}

/** True when a capped item has nothing left. Uncapped items are never sold out. */
export function isSoldOut(remaining: Remaining, menuItemId: string): boolean {
  const left = remainingFor(remaining, menuItemId);
  return left !== null && left <= 0;
}

/**
 * Cart lines whose ordered quantity exceeds the item's remaining stock. Lines
 * for uncapped items are never flagged. Quantity is aggregated across multiple
 * lines of the same item (option variants share one stock pool).
 */
export function overStockLines(
  items: { menuItemId: string; quantity: number }[],
  remaining: Remaining,
): string[] {
  const wanted = new Map<string, number>();
  for (const it of items) {
    wanted.set(it.menuItemId, (wanted.get(it.menuItemId) ?? 0) + it.quantity);
  }
  const over: string[] = [];
  for (const [id, qty] of wanted) {
    const cap = remainingFor(remaining, id);
    if (cap !== null && qty > cap) over.push(id);
  }
  return over;
}

/** True if any cart line exceeds remaining stock. */
export function hasOverStock(
  items: { menuItemId: string; quantity: number }[],
  remaining: Remaining,
): boolean {
  return overStockLines(items, remaining).length > 0;
}
