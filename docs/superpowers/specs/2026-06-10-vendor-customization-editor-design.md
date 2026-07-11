# Vendor customization editor + multi-select options — design

Date: 2026-06-10

## Problem

Round 3 added per-item drink customization (`option_groups`) but **seed-only** —
there was no vendor UI to create option groups. Vendors using the add/edit-booth
menu editor cannot build customizations. The feature must be **generic** (not
coffee-specific) so any booth — drinks, food, snacks — can define its own options
(Size, Spice, Doneness, Flavour, Add-ons, …).

Additionally, food booths need **multi-select** groups (e.g. "Add-ons: +egg
+cheese"), which the current single-choice-only model does not support.

## Scope

In:

- Generic option-group editor inside `menu-editor.tsx` (collapsible per item).
- Multi-select support (`single` radio | `multi` checkbox) end-to-end.
- Save-time sanitize of half-filled groups.
- `cartKey` stable-sort fix for multi-select.

Out:

- Per-choice price deltas (still all-free, unchanged from round 3).
- Min/max selection constraints on multi groups (0..n, no enforcement).
- Reordering groups/choices via drag (add/remove only).

## Data model (`src/lib/types.ts`)

```ts
export type OptionChoice = { id: string; label: string };
export type OptionGroup = {
  id: string;
  label: string;
  multiple?: boolean; // NEW: false/undefined = single (radio), true = multi (checkbox)
  choices: OptionChoice[];
};
export type SelectedOption = { group: string; choice: string };
```

`SelectedOption` is unchanged. A multi-select group emits **multiple**
`SelectedOption` entries sharing the same `group` label. Cart/receipt/dashboard
already consume an arbitrary list of `{group, choice}`, so they need no change.

## Schema (`src/lib/schemas.ts`)

`optionGroupSchema` gains `multiple: z.boolean().optional()`. It already flows
through `menuItemSchema` and `menuItemFormSchema`, so form-save and read paths
inherit it. `selectedOptionSchema` and `placeOrderSchema` (options array, max 20)
are unchanged — they already allow several entries per group.

## Customer sheet (`src/components/item-customizer.tsx`)

State changes from one choice id per group to **an array of choice ids** per group:
`Record<groupId, string[]>`.

- **single** group (`!multiple`): segmented radio. Default = first choice id
  (`[g.choices[0].id]`). Selecting replaces the array with one id.
- **multi** group (`multiple`): toggle chips / checkboxes. Default = `[]` (none).
  Tapping a choice toggles its id in/out of the array.

Confirm flattens every selected id across all groups to
`{ group: g.label, choice: choice.label }[]`, preserving group order then
choice order. A single group always yields exactly one entry; a multi group
yields 0..n.

Keyed-remount default-init pattern (no `useEffect`) is retained.

## Editor UI (`src/app/dashboard/booths/menu-editor.tsx`)

Per menu item, a collapsible **Customization** section (collapsed by default;
header shows group count). Expanded:

- List of **option groups**. Each group row:
  - label `Input` (e.g. "Size").
  - **single / multi** toggle (segmented, two buttons).
  - list of **choices**, each a label `Input` + remove button.
  - "+ choice" button.
  - remove-group button.
- "+ option group" button.

New group id and choice id via `crypto.randomUUID()` (mirrors `addItem`). New
items start with `option_groups: []` (or undefined → treated as empty). Fully
generic — no coffee defaults.

The editor reads/writes `item.option_groups` through the existing
`update(index, patch)` path.

## Save sanitize (booth form submit, `booth-form.tsx`)

Before calling `saveBooth`, sanitize each item's `option_groups`:

- trim group labels and choice labels;
- drop choices with empty label;
- drop groups with empty label OR zero remaining choices;
- if an item ends with zero groups, set `option_groups` to `undefined`.

This prevents `optionGroupSchema` (`choices.min(1)`) from rejecting a
partially-filled group and blocking the whole booth save.

## Bug fix (`src/lib/cart.ts`)

`cartKey` currently sorts options by `group.localeCompare` only. With multi-select
(same group, multiple choices) the secondary order is unstable, so the same
selection set could produce different keys → cart lines wrongly split. Fix: sort
by `group`, then by `choice`. Add a test covering two same-group choices in
swapped input order producing one stable key.

## Testing

- `cart.test.ts`: add a multi-select stability case (same group, two choices,
  swapped order → identical key; different choice sets → different keys).
- `schemas.test.ts`: `optionGroupSchema` accepts `multiple: true` and omitted;
  sanitize helper drops blank/empty groups (if extracted as a pure function).
- Manual: build a multi group in the editor, save booth, order on customer page,
  confirm multi picks render on cart line + receipt + dashboard card.

## Files touched

- `src/lib/types.ts` — `multiple?` on `OptionGroup`.
- `src/lib/schemas.ts` — `multiple` on `optionGroupSchema`; sanitize helper.
- `src/lib/cart.ts` — stable secondary sort.
- `src/lib/cart.test.ts` — multi-select key test.
- `src/components/item-customizer.tsx` — array-per-group state, single/multi render.
- `src/app/dashboard/booths/menu-editor.tsx` — option-group editor UI.
- `src/app/dashboard/booths/booth-form.tsx` — sanitize on submit.
- `src/lib/schemas.test.ts` — schema + sanitize tests.

## Untouched (already generic)

`placeOrder` action, order-form cart Map, `formatOptions`, `order-card`, receipt
page — all consume the `{group, choice}[]` list as-is.
