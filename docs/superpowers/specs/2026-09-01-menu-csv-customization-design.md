# CSV import: per-item customization (option groups/choices)

**Date:** 2026-09-01
**Status:** built, on `menu-manager` (PR #127)
**Depends on:** `2026-09-01-menu-manager-design.md` (the CSV import/export it
extends) — read that first for `menu-csv.ts`'s existing shape and the
menu-manager page it powers.

## Problem

The menu-manager CSV covers `name,description,price,cost,available` (the
item's own `cost_cents` was added as a prerequisite fix alongside this
doc — it's an always-visible field next to Price, not an Advanced one, so
it belonged in the plain item row regardless of this project) — but
`option_groups` (Size/Spice/Add-ons style customization) is still UI-only,
explicitly out of scope in the original design. Real vendor ask: bring
customization into the same bulk-import flow, so a vendor with several
similar booths (or a big menu with lots of variants) doesn't have to
rebuild every group/choice by hand in the per-item UI.

## Scope decision

**Group name, single/multi type, choice label, and choice price only.**
Choice-level cost delta and allergens stay UI-only — both live behind
"Advanced" in the per-choice editor specifically because most vendors don't
need them, and the earlier allergen-tagging research already established
that cramming safety-adjacent, rarely-used fields into a bulk-editable
surface trades accuracy for convenience the wrong way. This is a narrower
cut than the item-level fields: the item's own `cost` is always-visible
(not Advanced), which is exactly why it's in scope for the CSV while the
choice's own cost delta and allergens — genuinely Advanced, at the
choice level — aren't. A vendor who needs per-choice cost/allergens sets
them in the guided UI after import, same as today.

## Format

**Multi-row per item** (continuation rows), not a two-file import or a
mini-syntax packed into one cell — see the three approaches compared in
chat before this doc; multi-row won on backward compatibility (today's
plain 5-column export/template still parses unchanged, new columns just
sit empty) and because it's the closest match to how real bulk-menu CSVs
(Deliveroo's own bulk-update, per the earlier competitive research) already
represent modifiers.

```csv
name,description,price,cost,available,group_name,group_type,choice_label,choice_price
Kopi,Local coffee,1.40,0.50,true,,,,
,,,,,Style,one,O (black),
,,,,,Style,one,C (evaporated milk),0.20
,,,,,Style,one,Normal (condensed milk),0.20
Teh,Local tea,1.40,0.50,true,,,,
```

- A row with `name` filled is an **item row** — parsed exactly as today
  (`name,description,price,cost,available`), plus the trailing columns
  ignored for this row.
- A row with `name` blank and `group_name` filled is a **choice row** —
  belongs to the item row immediately above it (and every prior consecutive
  blank-`name` row back to that item row). A run of consecutive choice rows
  sharing the same `group_name` is one group, in file order; a `group_name`
  change starts a new group on the same item.
- `group_type` is `one` or `any`, matching the exact string values
  `option-groups-editor.tsx`'s own `ToggleGroup` already uses
  (`group.multiple ? "any" : "one"`) — no new vocabulary to document.
- `choice_price` parses the same as the item's own `price`: dollars,
  optional, blank means no delta. Unlike the item price, a choice's
  `price_delta_cents` is schema-bounded `.nonnegative()` — a negative
  `choice_price` is a per-row error, not silently clamped.
- A choice row with a blank `group_name` (but non-blank `choice_label`), or
  vice versa, is a per-row error — both are required together.
- A choice row appearing before any item row (nothing to attach to) is a
  per-row error.

## Merge behavior on import

- An item with **no choice rows** in the imported file keeps its existing
  `option_groups` untouched — matches the existing item-level import's own
  behavior of never touching fields the CSV doesn't carry (`image_url` and
  `stock` are preserved today the same way).
- An item with **one or more choice rows** has its `option_groups`
  **replaced entirely** by what the file describes for it. No partial
  merge — nested group/choice structures don't merge sensibly cell-by-cell,
  and a full replace matches the mental model of "this file is what the
  menu looks like now," same as Export CSV round-tripping is meant to work.
- New groups/choices get fresh `crypto.randomUUID()` ids, same as manual
  "Add group"/"Add choice" in the UI.
- The imported groups/choices still pass through the existing
  `sanitizeOptionGroups` at save time (`menu-manager.tsx`'s `onSave`,
  unchanged) — a blank-label choice or a label-less group dropped there
  exactly as a manually-typed one would be.

## Preview

The existing import preview (`menu-manager.tsx`) shows one line per row
today. Choice rows need their own line, indented or otherwise visually
subordinate to their item row, so a vendor can see the group/choice
structure before committing — not just a flat list that hides which rows
belong together.

## Export

`menuItemsToCsv` gains matching continuation rows for any item that has
`option_groups` — an item with none exports exactly as it does today (a
single row, no trailing customization columns populated), so a booth with
no customization at all has a byte-identical export to before this change.

## Non-goals

- Choice-level cost delta and allergens (see Scope decision above).
- `menuCsvTemplate()`'s example rows: stay the current 2 plain items, no
  example group/choice rows — the feature is additive, not something every
  new vendor needs to see modeled on day one.
- Any further change to the item-level columns beyond the `cost` column
  already shipped as this project's prerequisite — `image_url` and `stock`
  stay UI-only, unaffected by this doc.

## Open question for implementation-time verification

Whether the choice-row preview format should show price deltas
(`+$0.20`) — a small UI-polish call, not a design blocker; can decide when
building the preview rather than here.
