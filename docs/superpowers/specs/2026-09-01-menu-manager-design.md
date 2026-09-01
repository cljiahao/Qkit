# Menu Manager — dedicated page, CSV import/export, drag reorder

**Status:** design approved, implementation pending. **Date:** 2026-09-01.

## Problem

Vendor feedback ahead of the first live event (qkit.merqo.io): menu setup is
one-item-at-a-time inside the booth-edit form, and there's no way to reorder
items short of delete-and-re-add. Friction is real even though it's a
one-time-per-booth task.

Considered and rejected: an AI photo/text importer (Claude vision extracting
items from a photo or pasted text) — explicitly declined by the vendor-facing
decision-maker, no AI in this flow. Considered and rejected: scraping/pulling
from GrabFood — no public per-vendor menu-export API exists; would mean
scraping a competitor's merchant portal, real ToS/legal exposure for no
reason when a same-shape CSV mechanism already covers the need.

Competitive research (Grab, foodpanda, Deliveroo, DoorDash, Toast — see prior
chat turn for the full breakdown, not duplicated here) converges on two
patterns everywhere it exists: a **separate menu-management surface** distinct
from store/profile settings, and **CSV as the non-AI bulk mechanism**
(download current catalogue → edit in a spreadsheet → re-upload). Reorder is
uniformly a **drag handle**, never typed sort numbers.

## Approach

Three pieces, same scope as approved in chat:

1. **New route**, `src/app/dashboard/booths/[boothId]/menu/page.tsx` — pulls
   `MenuEditor` out of `booth-form.tsx` into its own page with its own Save.
   `booth-form.tsx` keeps the booth's core fields (name, description, hours,
   payment, printing) and gains a "Manage menu →" link into the new route
   instead of embedding `MenuEditor` inline.
2. **CSV export/import** — "Export CSV" downloads the current `menu_items` as
   `name,description,price,available` (dollars, not cents, for spreadsheet
   readability); "Import CSV" re-parses that same shape into a preview list
   (new items appended, existing items matched by exact name and updated)
   before the vendor commits it into the in-memory item array. Nothing
   persists until the vendor hits the page's own Save — same
   validate-then-`saveBooth` path as manual edits today.
3. **Drag reorder** — a grip-handle per item row (via `@dnd-kit/core` +
   `@dnd-kit/sortable`, new pinned dependency) reorders the in-memory
   `MenuItemFormInput[]` array. No schema change: `booths.menu_items` is
   already a JSONB array, so array order _is_ display order — reorder writes
   back through the same Save as any other edit.

Out of scope (YAGNI, unrelated to the vendor's ask): CSV coverage of
`option_groups`, `allergens`, `stock`, or `category` — those stay
editable only in the existing per-item UI. `menu_categories` (the
section/category list itself) has no vendor-facing editor at all today; not
built here either, pre-existing gap.

## Components

- `src/app/dashboard/booths/[boothId]/menu/page.tsx` — new page: loads the
  booth (same query `booth-form.tsx`'s page already does), renders
  `MenuEditor` + the new export/import controls + a Save button wired to a
  **new** `saveMenuItems(boothId, menu_items)` action (`actions.ts`) — not
  `saveBooth`, whose `boothFormSchema` requires the full booth shape (name,
  image_url, is_active, ...) and would reject a menu-items-only payload.
  `saveMenuItems` validates `z.array(menuItemFormSchema)`, reuses
  `validateMenuCaps` for plan-limit checks and the stock-cap stripping
  `saveBooth` already does, then does `.update({ menu_items })` scoped by
  `boothId` (RLS `booths_vendor_all`, same as `saveBooth`'s update) — a
  partial Supabase `.update()` touches only the given column, no other booth
  field is read or written. Reuses `orphanedImagePaths`/`removeBoothImages`
  for per-item photo cleanup, same as `saveBooth`'s existing image-orphan
  logic (fetch the previous `menu_items` before the update, diff after).
- `src/lib/menu-csv.ts` — new pure module, `menuItemsToCsv(items)` /
  `csvToMenuItems(text)`. Hand-rolled RFC4180-shaped encode/decode (quoted
  fields, embedded commas/quotes handled) rather than a new dependency — the
  shape is 4 fixed columns, not worth a library.
- `src/app/dashboard/booths/menu-editor.tsx` — gains drag-and-drop reordering
  (grip handle + `@dnd-kit` `SortableContext`) around the existing per-item
  card list; item add/edit/remove logic unchanged.
- `src/app/dashboard/booths/booth-form.tsx` — `MenuEditor` + its props
  removed; replaced with a link to the new route once the booth has an id
  (unsaved new booths keep today's behavior — menu setup only after the
  booth's first save, unchanged from today).

## Data flow

CSV import never writes to the DB directly — it only produces
`MenuItemFormInput[]` rows in the same client-side state `MenuEditor` already
manages, through the same add/update functions. The only persistence path is
the new `saveMenuItems` action, validated by the same `menuItemFormSchema`
`saveBooth` already uses — CSV-imported rows get no special trust, a
malformed row (unparseable price, empty name) is rejected at Save exactly
like a manually-typed bad row would be, surfaced the same way.

## Error handling

- Malformed CSV (wrong column count, unparseable price) → per-row inline
  error in the import preview, vendor fixes or drops that row before
  committing — no partial silent success.
- Import never overwrites an item mid-typing without confirmation — the
  preview step is the confirmation.
- Drag reorder is pure client state; a failed Save leaves the on-screen order
  as the vendor left it (existing `saveBooth` failure UX, unchanged).

## Testing

- `src/lib/menu-csv.test.ts` — round-trip encode/decode, embedded
  comma/quote handling, malformed-row rejection.
- `menu-editor.dom.test.tsx` — extend for drag-handle presence and reorder
  callback (dnd-kit's own drag simulation is awkward under jsdom; test the
  reorder _callback_ the same way existing tests already exercise
  add/remove, not actual pointer-drag simulation).
- New `[boothId]/menu/page.dom.test.tsx` — page renders, export downloads
  expected CSV shape, import preview surfaces both valid and invalid rows.
- `booth-form.dom.test.tsx` — updated for the removed inline `MenuEditor` /
  new "Manage menu" link.

## Rollout

Built on a branch, PR opened but **held unmerged** — vendor (this session's
user) reviews on the PR's Vercel Preview URL before any decision to merge.

## Parent

[specs](README.md)
