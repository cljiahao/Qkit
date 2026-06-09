# Drink Customization (seed-only, bottom-sheet)

Date: 2026-06-09
Status: Approved

## Goal

Let a customer customize a drink before adding it to the cart — single-choice
option groups (Style, Temperature, Sugar) chosen in a mobile bottom sheet. The
Kopitiam Cart collapses from 7 flat items to 3 base drinks (Kopi, Teh, Milo)
plus options. Options are free (never change price). Vendor-facing option editing
is **out of scope** for this round — groups are defined in the seed only.

## Non-goals

- No vendor option-group editor UI (seed-only this round).
- No price deltas — options change *what is made*, not the price.
- No multi-choice add-ons, no free-text notes (single-choice groups only).
- Centered modal — we use a bottom `Sheet` (already installed, better on phone).

## A. Data model (`src/lib/types.ts`)

```ts
export type OptionChoice = { id: string; label: string };
export type OptionGroup = { id: string; label: string; choices: OptionChoice[] };

// MenuItem gains:
//   option_groups?: OptionGroup[];

// Selected options carried on cart/order items (LABELS, not ids — a placed
// order must stay self-describing even if the menu later changes):
export type SelectedOption = { group: string; choice: string };

// CartItem and OrderItem each gain:
//   options?: SelectedOption[];
```

Single-choice semantics: each group requires exactly one selection; the customer
sheet preselects the first choice as default, so a valid selection always exists.

## B. Schemas (`src/lib/schemas.ts`)

- `optionChoiceSchema`, `optionGroupSchema` (read-side, tolerant) for parsing
  `menu_items[].option_groups` JSONB.
- `menuItemSchema` gains `option_groups: z.array(optionGroupSchema).optional()`.
- `selectedOptionSchema = z.object({ group: z.string().min(1).max(100), choice: z.string().min(1).max(100) })`.
- `placeOrderSchema` item gains `options: z.array(selectedOptionSchema).max(20).optional()`.
- `orderItemSchema` (read) gains the same `options` (tolerant).
- Total stays `price_cents * quantity` — options never affect it.

## C. Cart keying (`src/lib/cart.ts` — new, unit-tested)

Today the cart `Map` keys by `item.id`, so one drink = one line. With options,
the same base drink with different choices must be **separate lines**, while an
identical combo merges and increments quantity. The key uses the ASCII unit
separator (`String.fromCharCode(31)`), which cannot appear in user-facing labels,
so two distinct combos can never collide even when a label contains spaces.
Choices are sorted by group so selection order does not matter; no options means
the key is just the id (back-compat).

```ts
const US = String.fromCharCode(31);

export function cartKey(menuItemId, options) {
  if (!options || options.length === 0) return menuItemId;
  const parts = [...options]
    .sort((a, b) => a.group.localeCompare(b.group))
    .map((o) => o.group + US + o.choice);
  return [menuItemId, ...parts].join(US);
}
```

(Real implementation is typed: `cartKey(menuItemId: string, options?: SelectedOption[]): string`.)

## D. Customer flow

- `order-form.tsx`: when an item has a non-empty `option_groups`, tapping its
  card/"Add" opens the customizer Sheet instead of adding directly. Items without
  groups keep the current one-tap add (Test Stall and any plain booth unchanged).
- `src/components/item-customizer.tsx` (new): a bottom `Sheet` showing the drink
  name and each group as a row of segmented single-select buttons (default =
  first choice). "Add to order" builds the `SelectedOption[]` and calls back into
  the form's add logic with the chosen options; closes the sheet.
- Quantity controls (+/-) stay on the cart lines as today; the sheet just adds
  one configured line (merging by `cartKey` if the same combo already exists).
- The cart/line display name stays the base name; options render as a sub-line.

## E. Display (3 surfaces)

Render selected options as a muted sub-line under each item line:

- **Cart summary** (`order-form.tsx`): under each cart line.
- **Dashboard order card** (`src/components/order-card.tsx`): under each item so
  the vendor knows what to make.
- **Receipt** (`src/app/order/[boothId]/[orderNumber]/page.tsx`): under each line.

Format: option choices joined with ` · `, e.g. `Iced · Kosong · Less sugar`.
Rendered only when the item has options.

## F. Seed rewrite (`supabase/seed/coffee-cart.sql`)

Replace the 7 flat items with 3 base drinks, flat prices, each carrying
`option_groups`. `image_url` per item: `/seed/kopi.svg`, `/seed/teh.svg`,
`/seed/milo.svg`. Booth banner unchanged (`/seed/kopitiam-chart.svg`).

| Drink | Style group             | Temperature | Sugar                | Price |
| ----- | ----------------------- | ----------- | -------------------- | ----- |
| Kopi  | O / C / Normal / Kosong | Hot / Iced  | Normal / Less / None | $1.40 |
| Teh   | O / C / Normal / Kosong | Hot / Iced  | Normal / Less / None | $1.40 |
| Milo  | (no style group)        | Hot / Iced  | Normal / Less / None | $2.00 |

Re-runnable via `ON CONFLICT (id) DO UPDATE` (same booth id as before).

## G. Art fix

The "iced" look came from sugar-cube squares that only existed on the `-o/-c`
variant cups. The 3 base cups already avoid them. Additionally strip the milk
band from `kopi.svg`, `teh.svg`, `milo.svg` so each cup is **style-agnostic**
(just the base liquid), since style is now an option. Delete the 4 unused SVGs:
`kopi-o.svg`, `kopi-c.svg`, `teh-o.svg`, `teh-c.svg`. Keep `kopitiam-chart.svg`.

## H. Testing

- `src/lib/cart.test.ts`: `cartKey` — no options = id; same combo (any order) =
  same key; different combo = different key.
- `src/lib/schemas.test.ts`: `option_groups` parses on `menuItemSchema`; a
  `placeOrder` item with `options` validates; a malformed option is rejected.
- Manual: customize a Kopi (Iced/Kosong/Less) → cart shows a distinct line with
  the sub-line; a second Kopi with different options is a separate line; options
  appear on the dashboard card and receipt after placing.

## Files touched

- `src/lib/types.ts` — OptionChoice/OptionGroup/SelectedOption; `option_groups`
  on MenuItem; `options` on CartItem + OrderItem.
- `src/lib/schemas.ts` — option + selected-option schemas; wire into
  menuItemSchema, orderItemSchema, placeOrderSchema.
- `src/lib/cart.ts` — **new** `cartKey`.
- `src/lib/cart.test.ts` — **new**.
- `src/lib/schemas.test.ts` — option cases.
- `src/components/item-customizer.tsx` — **new** bottom-sheet customizer.
- `src/app/order/[boothId]/order-form.tsx` — open sheet for items with groups;
  key cart by `cartKey`; render option sub-lines.
- `src/components/order-card.tsx` — option sub-lines.
- `src/app/order/[boothId]/[orderNumber]/page.tsx` — option sub-lines.
- `supabase/seed/coffee-cart.sql` — 3 base drinks with option_groups.
- `public/seed/kopi.svg`, `teh.svg`, `milo.svg` — strip milk band; delete
  `kopi-o.svg`, `kopi-c.svg`, `teh-o.svg`, `teh-c.svg`.
