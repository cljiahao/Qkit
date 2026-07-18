import type { MenuItem, SelectedOption } from "@/lib/types";

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

/**
 * Sum of `price_delta_cents` across the selected choices, informational only
 * (mirrors what place_order re-derives authoritatively from the same stored
 * menu). An option that doesn't match any known group/choice contributes 0
 * rather than throwing — the server is the one place that rejects unknown
 * options; client-side display should degrade quietly.
 */
export function sumOptionDeltas(
  item: Pick<MenuItem, "option_groups">,
  options: SelectedOption[] | undefined,
): number {
  if (!options || options.length === 0) return 0;
  const groups = item.option_groups ?? [];
  return options.reduce((sum, o) => {
    const choice = groups
      .find((g) => g.label === o.group)
      ?.choices.find((c) => c.label === o.choice);
    return sum + (choice?.price_delta_cents ?? 0);
  }, 0);
}
