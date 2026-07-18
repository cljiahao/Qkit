# Menu Customization Choice Price Delta — Design

**Date:** 2026-07-18
**Status:** Decided (2026-07-18) — ready for an implementation plan
**Depends on:** none structurally, but touches the same `place_order` function
hardened in `2026-07-01-order-path-hardening-design.md` — must preserve that
spec's core invariant (price is computed server-side from the stored menu,
never trusted from the client).

## Decisions on the open questions

1. **`cost_delta_cents` is optional, not required.** Confirmed 2026-07-18 —
   requiring it would force every vendor adding a priced choice to also
   know their own precise incremental cost, real data-entry friction for
   a field the base item's own `cost_cents` doesn't require either.
   Margin stats stay approximate for cost-affecting choices; acceptable v1
   gap, matches the existing optionality pattern rather than introducing
   an inconsistent stricter rule for choices specifically.
2. **Cross-item choice pricing needs no new mechanism** — confirmed
   already possible today (each item owns its own copy of its option
   groups), not a design decision, just a fact worth recording so it isn't
   re-litigated.
3. **Relying on choice order for the free default — accepted as
   recommended**, not separately re-discussed. Revisit only if this
   actually causes a real vendor pricing mistake in practice.

## Problem

Confirmed by reading the full option/pricing path
(`src/lib/schemas.ts`, `option-groups-editor.tsx`, `item-customizer.tsx`,
`order-form.tsx`, `supabase/migrations/0055_place_order_free_price.sql`):
customization choices carry **zero price information anywhere in the
system**. `optionChoiceSchema` is `{ id, label }` only. The customer-facing
customizer (`item-customizer.tsx`) builds `SelectedOption[]` as `{group,
choice}` label pairs with no price impact. The cart (`order-form.tsx:180`)
sets each line's `price_cents` straight from the base menu item, ignoring
selections entirely. `place_order`'s authoritative total
(`v_total := v_total + COALESCE(v_price, 0) * v_qty`) never looks at
`options` for pricing — the existing options loop only validates that a
submitted `{group, choice}` pair exists on the menu item, it doesn't price
it.

A vendor cannot charge extra for any customization — an oat milk swap, an
extra shot, a size upgrade — today. Raised via Manfred: a $1 oat-milk
upcharge is standard in his segment and currently has no way to exist in
qkit except as a workaround outside the system (e.g. a separate "Oat milk
add-on" fake menu item, which breaks quantity/cart semantics).

## Goal

Let a vendor set an optional price delta (and optional cost delta, for
margin-stat accuracy) on any individual customization choice. Selecting
that choice adds its delta to the order line's price — multi-select groups
sum every selected choice's delta; single-select groups apply the one
selected choice's delta. Server-side (`place_order`) remains the sole
authority on the final charged amount, exactly as it is for base item
price today — the client-side total shown during customization is always
informational, never trusted.

## Decisions

1. **Delta lives per-choice, not per-group, not as a cross-item price
   matrix.** Matches the existing granularity (`optionChoiceSchema` already
   scopes each choice to one item's one group) and the real need (Manfred's
   example is "this specific choice costs extra," not "this whole group
   costs extra" — a flat per-group surcharge couldn't express "oat milk
   +$1, almond milk +$1.50" as two different upgrade prices in the same
   group). A full item×choice price matrix was considered and rejected as
   solving a need not yet confirmed (see Open Question 2 — it turns out
   unnecessary anyway, since each item already owns its own copy of its
   option groups).
2. **Additive only for v1 — no negative deltas / discounts via
   customization.** Keeps the mental model simple (a choice either costs
   nothing or costs more) and avoids a customer being able to select their
   way to a negative or zero-price order through a combination of
   discount-choices, which would need its own floor-at-zero handling.
   Revisit only if a real vendor need for a "discount choice" shows up —
   none has so far.
3. **`cost_delta_cents` optional, mirrors `cost_cents`'s existing
   optionality on the base item** — see Open Question 1 for the tradeoff
   this accepts.

## Architecture

### Component 1 — Schema (`src/lib/schemas.ts`)

```ts
export const optionChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  // Additive only (v1) — a selected choice adds cost, never reduces it.
  // Bounded by MAX_MONEY_CENTS same as every other money field, so a
  // forged delta can't overflow total_cents once summed across a cart.
  price_delta_cents: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_MONEY_CENTS)
    .optional(),
  // Vendor's extra unit cost for this choice — optional, mirrors the base
  // item's own cost_cents optionality. Never sent to customers.
  cost_delta_cents: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_MONEY_CENTS)
    .optional(),
});
```

No change needed to `optionGroupSchema`, `menuItemFormSchema`, or
`menuItemSchema` — they already nest `optionChoiceSchema` via
`option_groups`, so the new fields flow through automatically. No change
needed to `placeOrderSchema`/`orderItemSchema`/`selectedOptionSchema` — the
client still only ever submits `{group, choice}` labels, exactly as today;
price is never client-submitted for options, same invariant as the base
item price.

### Component 2 — Vendor editor (`option-groups-editor.tsx`)

Add a price input (and, behind the recommended progressive-disclosure
pattern from the same discussion this spec came out of — see the parallel
allergy-tagging and multi-cart-config specs — an "Advanced" collapsed
section for `cost_delta_cents` specifically, since price matters to every
vendor but cost-tracking is already opt-in behavior) next to each choice's
label input. Defaults to unset (no delta), so existing menus are unaffected
until a vendor opts in per choice.

### Component 3 — Customer customizer (`item-customizer.tsx`)

`CustomizerBody` currently builds `SelectedOption[]` with no price
awareness. Add a derived running total: sum `price_delta_cents` across all
currently-selected choices (respecting single- vs multi-select, same
`selected` state already tracked), display it as "+$X.XX" next to the base
price and/or folded into a live total shown above the "Add to order"
button. This is **informational only** — purely a UI computation, not
plumbed into what gets submitted (the submission already only sends
`{group, choice}` labels).

### Component 4 — Cart (`order-form.tsx`)

Line 180's `price_cents: item.price_cents` needs to become
`item.price_cents + sum(selected choice deltas)` so the vendor-facing cart
total (still informational, not authoritative) reflects the real price
before checkout. Same treatment for the per-line display math at lines 343
and 435 (`formatPrice(item.price_cents * item.quantity)` needs the delta
folded in before the multiply).

### Component 5 — `place_order` (authoritative, `supabase/migrations/`)

This is the component that actually enforces the price — everything above
is UX. The existing options-validation loop
(`0055_place_order_free_price.sql:104-119`) already walks
`menu_item->'option_groups'` to confirm each submitted `{group, choice}`
pair exists, via:

```sql
SELECT 1 FROM jsonb_array_elements(...) AS g, jsonb_array_elements(g->'choices') AS c
WHERE g->>'label' = opt->>'group' AND c->>'label' = opt->>'choice'
```

Extend this from an `EXISTS` check to also **select the matched choice's
`price_delta_cents`** and accumulate it into `v_total`, multiplied by the
line's `v_qty` (matching how the base price is already multiplied by
quantity at line 123). New migration, `CREATE OR REPLACE FUNCTION
qkit.place_order(...)` verbatim from `0055` with this one addition — same
pattern the last few `place_order` migrations have followed (recreate
whole function, comment explains the one changed thing).

Pseudocode for the changed section (exact SQL to be finalized in the
implementation plan, not this spec):

```
FOR opt IN ... LOOP
  -- existing EXISTS validation stays, PLUS:
  SELECT (c->>'price_delta_cents')::int INTO v_delta
  FROM jsonb_array_elements(...) g, jsonb_array_elements(g->'choices') c
  WHERE g->>'label' = opt->>'group' AND c->>'label' = opt->>'choice';
  v_total := v_total + COALESCE(v_delta, 0) * v_qty;
END LOOP;
```

No RLS/grant changes — this is inside the existing `SECURITY DEFINER`
function, same trust boundary as today.

## Data flow

- **Vendor sets a delta** on a choice in the menu editor → saved as part of
  the existing `booths.menu_items` JSONB, no new column/table.
- **Customer selects choices** → customizer shows a live informational
  total (Component 3) → cart shows the same (Component 4) → submission
  still sends only `{group, choice}` labels, unchanged wire shape.
- **`place_order`** re-validates every option against the stored menu (as
  it already does) and now also re-sums the real price from that same
  stored menu, never trusting anything the client displayed.

## Error handling

No new error paths — an unknown `{group, choice}` pair already raises
`ORDER_INVALID: unknown option` (unchanged); a missing/unset
`price_delta_cents` degrades to `COALESCE(..., 0)`, same pattern already
used for the base item's own `price_cents`/`cost_cents`.

## Testing

- **Unit (`src/lib`):** a pure helper (extract one if the delta-summing
  logic gets non-trivial) for "sum selected choice deltas given a
  selection state" — same treatment as other pure logic in this codebase
  (mutation-tested).
- **DOM (`item-customizer.dom.test.tsx`, `order-form.dom.test.tsx`):**
  selecting a priced choice updates the displayed running total; switching
  a single-select choice replaces rather than adds to the total; multi-select
  sums correctly.
- **pgTAP:** `place_order` charges the correct total when priced options
  are selected; a forged/inflated client-side `price_cents` on the
  submitted line is still ignored (existing invariant, add a case that
  also tries to forge a fake `price_delta_cents` value in `options` and
  confirms the RPC still only trusts the stored menu's delta, not anything
  from the request).

## Migration / rollout

Pre-launch, no vendors on paid plans depending on current pricing math —
clean cutover, no backfill needed (existing choices simply have no delta,
same as no price change). Single migration for `place_order`; schema
change is TypeScript-only (optional fields, no DB column change since
`menu_items` is JSONB).

## Out of scope (v1)

- Per-item×choice price matrix (Decision 1 — not needed, each item already
  owns its own option-group copy).
- Discount/negative-delta choices (Decision 2).
- An explicit "this is the free default" UI marker (Open Question 3) —
  relies on existing choice-order convention.
- Any change to `place_order`'s stock-checking logic — deltas affect price
  only, not `order_item_quantities()`/stock accounting.
