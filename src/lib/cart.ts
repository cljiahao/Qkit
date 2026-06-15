import type { SelectedOption } from "@/lib/types";

// US = ASCII unit separator (0x1F); cannot appear in user-facing labels, so two
// different combos can never collide even when a label contains spaces.
const US = String.fromCharCode(31);

/**
 * Stable cart key: base id plus each selected choice, sorted by group so
 * selection order doesn't matter. No options => the bare id (back-compat with
 * plain, non-customizable items).
 */
export function cartKey(
  menuItemId: string,
  options?: SelectedOption[],
): string {
  if (!options || options.length === 0) return menuItemId;
  const parts = [...options]
    // Sort by group, then choice: multi-select emits several rows per group, so
    // the secondary key keeps identical selections keying identically.
    .sort(
      (a, b) =>
        a.group.localeCompare(b.group) || a.choice.localeCompare(b.choice),
    )
    .map((o) => `${o.group}${US}${o.choice}`);
  return [menuItemId, ...parts].join(US);
}

/** Sum of line totals (price × quantity) in cents. Unpriced items count as 0. */
export function cartTotal(
  items: { price_cents?: number | null; quantity: number }[],
): number {
  return items.reduce((sum, i) => sum + (i.price_cents ?? 0) * i.quantity, 0);
}
