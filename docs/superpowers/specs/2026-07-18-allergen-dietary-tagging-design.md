# Allergen / Dietary Tagging — Design

**Date:** 2026-07-18
**Status:** Decided (2026-07-18), one item still genuinely open — see below
**Depends on:** none (additive schema change)
**Related:** `2026-07-18-menu-choice-price-delta-design.md` (same
`optionChoiceSchema` touched by both — sequence or land together to avoid
two separate migrations to the same JSONB shape)

## Model simplified after founder review (2026-07-18)

The add/remove model below (Open Question 2, `allergens_add`/
`allergens_remove`) turned out to be more machinery than needed. Simpler,
equivalent model: **tag an allergen only at the level where it actually
varies.** A truly fixed ingredient (e.g. a pastry that's always dairy)
gets tagged on the item. Anything that depends on which choice is picked
(milk type is the clear case) gets tagged **only on the choices**, never
on the item — a "Latte" item itself carries no dairy tag; "Regular Milk"
carries `allergens: ["dairy"]`, "Oat Milk" carries `allergens: []`. The
effective set for a cart line is then just the **union** of the item's
tags and whichever choices are selected — no subtraction, no "remove"
concept needed at all. This covers every case the add/remove model did
(a choice can still effectively "clear" an allergen, simply by not being
tagged with it), with one array field per choice instead of two.

## Problem

Confirmed in code: `optionChoiceSchema` (`src/lib/schemas.ts:31-34`) is
`{ id, label }` — no allergen/dietary field exists anywhere in the menu or
option-choice model, at any level. A customer choosing "Oat milk" has no
system-surfaced signal that this is the dairy-free choice, and a
lactose-intolerant customer has no way to filter or confirm before
ordering. This is a safety-adjacent gap, not cosmetic — a wrong drink made
for someone with a real allergy is a worse failure than the UX papercuts
this session has otherwise focused on.

## Decisions

1. **Structured taxonomy vs. free text — still genuinely open, needs your
   actual list, not a guessed one.** Recommend structured taxonomy as the
   primary field (filterable/scannable) plus an optional free-text note
   for anything outside it — but the taxonomy itself (dairy/nuts/gluten/
   etc., and whether caffeine-sensitivity or similar non-allergen dietary
   flags belong in the same list) should come from you or Manfred. **This
   is the one item still blocking an implementation plan.**
2. **Tag placement — resolved, see the simplified model above.** Item
   level for fixed ingredients, choice level for anything that varies,
   union for the effective set. No remaining open question here.
3. **No auto-inference — decided.** Nothing infers "oat milk implies
   dairy-free" from a label. All tags vendor-declared and explicit — the
   system never guesses at food safety.
4. **Display prominence — decided.** Visible badge/icon at both the item
   card and inside the choice picker, always shown, never behind the
   advanced-accordion pattern used elsewhere for optional complexity —
   allergen info isn't optional complexity.
5. **Vendor-side visibility while making the drink — needs implementation-
   time investigation, not a founder decision.** Whether `order-card.tsx`
   should surface an allergen flag inline for the person making the
   drink wasn't fully traced against the current code — check during
   implementation, not blocking the spec.

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
  // Only tag a choice with an allergen that actually varies by choice
  // (e.g. "Regular Milk" -> ["dairy"], "Oat Milk" -> []). Never tag an
  // item AND rely on a choice to "clear" it — see the model note above.
  allergens: z.array(z.enum(ALLERGEN_TAGS)).optional(),
});

export const menuItemFormSchema = z.object({
  // ...existing fields...
  // Only fixed/inherent allergens that no customization changes.
  allergens: z.array(z.enum(ALLERGEN_TAGS)).optional(),
  dietary_note: z.string().max(200).optional(), // free-text, vendor-owned
});
```

Effective allergen set for a cart line = the **union** of `item.allergens`
and the `allergens` of every currently-selected choice — no subtraction.
Computed client-side for display (`item-customizer.tsx`) and should be
re-derivable server-side the same way price is (this codebase's
established invariant — see `place_order`'s price re-derivation) if
allergen info ever needs to be stamped onto the order record itself for
the vendor-visibility question above.

## Non-goals (v1)

- No customer-side dietary filter/search across the whole menu — this
  spec only covers per-item/per-choice display, not a "show me only
  nut-free items" browse mode. Could be a fast follow once tagging exists.
- No liability/legal copy ("we cannot guarantee zero cross-contamination")
  — a real business decision, not a schema question, flag separately.
