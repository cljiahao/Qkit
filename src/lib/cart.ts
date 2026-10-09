import type { MenuItem, SelectedOption } from "@/lib/types";

/** Encode label boundaries without assuming labels exclude control characters. */
export function cartKey(
  menuItemId: string,
  options?: SelectedOption[],
): string {
  const parts = [...(options ?? [])]
    .sort((a, b) => {
      if (a.group !== b.group) return a.group < b.group ? -1 : 1;
      if (a.choice === b.choice) return 0;
      return a.choice < b.choice ? -1 : 1;
    })
    .map((option) => [option.group, option.choice]);
  return JSON.stringify([menuItemId, parts]);
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
