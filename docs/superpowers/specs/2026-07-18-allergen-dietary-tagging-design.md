# Allergen / Dietary Tagging — Design

**Date:** 2026-07-18
**Status:** Draft — pending founder review (written by a subagent from a
Manfred-driven ask; open questions below are NOT resolved, they need a
real decision before this becomes a plan)
**Depends on:** none (additive schema change)
**Related:** `2026-07-18-menu-choice-price-delta-design.md` (same
`optionChoiceSchema` touched by both — if both ship, sequence or land
together to avoid two separate migrations to the same JSONB shape)

## Problem

Confirmed in code: `optionChoiceSchema` (`src/lib/schemas.ts:31-34`) is
`{ id, label }` — no allergen/dietary field exists anywhere in the menu or
option-choice model, at any level. A customer choosing "Oat milk" has no
system-surfaced signal that this is the dairy-free choice, and a
lactose-intolerant customer has no way to filter or confirm before
ordering. This is a safety-adjacent gap, not cosmetic — a wrong drink made
for someone with a real allergy is a worse failure than the UX papercuts
this session has otherwise focused on.

## Open questions — genuinely unresolved, need a founder decision

1. **Structured taxonomy vs. free text vs. both.** A fixed checkbox list
   (contains: dairy / nuts / gluten / shellfish / egg / soy — pick a set)
   is filterable and scannable at a glance, but any vendor with something
   outside the list is stuck. Free text ("vendor notes: may contain
   traces of X") is flexible but not filterable/scannable and relies on
   the customer actually reading it. **Recommend: structured taxonomy as
   the primary field (small fixed list, extend later if a real gap
   shows up) plus an optional free-text note** — but the actual taxonomy
   list should come from you/Manfred, not be guessed here.
2. **Tag at item level, choice level, or both.** A base "Latte" item might
   be dairy-containing by default, but a "Oat milk" _choice_ within its
   milk option group flips that. Tagging only at the item level can't
   express this; tagging only at choice level can't express an item with
   no choices at all (e.g. a pre-made pastry). **Recommend: allow tags at
   both levels** — item-level tags are the base state, and if a customer
   picks a choice that's tagged as removing an allergen (e.g. oat milk
   removes "dairy"), the effective allergen set for that cart line is the
   item's tags minus what the choice explicitly clears. This needs the
   choice schema to express "clears X" not just "contains Y" — genuinely
   the trickiest modeling decision here, worth a second look before
   committing.
3. **Auto-inference — recommend against.** Nothing should auto-infer "oat
   milk implies dairy-free" from the label text — that's a false-safety
   trap (a vendor could name a choice "Oat milk" for flavor reasons while
   the syrup used elsewhere in the drink still contains dairy). All tags
   should be **vendor-declared, explicit, per choice/item** — the system
   should never guess at food safety.
4. **Display prominence.** Given the safety framing, recommend a visible
   badge/icon at both the item card and inside the choice picker
   (`ItemCustomizer`/`CustomizerBody`, `src/components/item-customizer.tsx`)
   — not buried behind a details-expand the way a "nutrition info" link
   might be. This is one case where the "advanced accordion, collapsed by
   default" pattern (agreed elsewhere this session for genuinely optional
   complexity) should NOT apply — allergen info is not optional
   complexity, it should be visible by default.
5. **Vendor-side visibility while making the drink.** Not fully traced in
   this pass — worth checking whether the order-prep view (`order-card.tsx`
   / wherever a vendor sees a live order's selected options) should also
   surface an allergen flag inline, so the person making the drink is
   reminded, not just the customer at order time. Didn't find an existing
   options-render path in `order-card.tsx` in this pass to build on
   directly — needs a look before implementation.

## Recommended shape (pending the decisions above)

```ts
// src/lib/schemas.ts
export const ALLERGEN_TAGS = [
  "dairy",
  "nuts",
  "gluten",
  "shellfish",
  "egg",
  "soy",
] as const; // placeholder list — confirm with Manfred, not guessed
export type AllergenTag = (typeof ALLERGEN_TAGS)[number];

export const optionChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  // Tags this choice ADDS relative to the item's base tags (e.g. an
  // "Almond syrup" add-on choice on an otherwise dairy-only item).
  allergens_add: z.array(z.enum(ALLERGEN_TAGS)).optional(),
  // Tags this choice REMOVES relative to the item's base tags (e.g. "Oat
  // milk" removing "dairy" from a latte's base tag set).
  allergens_remove: z.array(z.enum(ALLERGEN_TAGS)).optional(),
});

export const menuItemFormSchema = z.object({
  // ...existing fields...
  allergens: z.array(z.enum(ALLERGEN_TAGS)).optional(),
  dietary_note: z.string().max(200).optional(), // free-text, vendor-owned
});
```

Effective allergen set for a cart line = `item.allergens` minus the union
of all selected choices' `allergens_remove`, plus the union of all
selected choices' `allergens_add`. Computed client-side for display
(`item-customizer.tsx`) and should be re-derivable server-side the same
way price is (this codebase's established invariant — see
`place_order`'s price re-derivation) if allergen info ever needs to be
stamped onto the order record itself for the vendor-visibility question
above.

## Non-goals (v1)

- No customer-side dietary filter/search across the whole menu — this
  spec only covers per-item/per-choice display, not a "show me only
  nut-free items" browse mode. Could be a fast follow once tagging exists.
- No liability/legal copy ("we cannot guarantee zero cross-contamination")
  — a real business decision, not a schema question, flag separately.
