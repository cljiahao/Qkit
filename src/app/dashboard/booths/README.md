# booths

## Purpose

Vendor booth list, the shared create/edit form and its building-block editors, and the server actions that persist a booth under plan entitlements.

## Contents

- `[boothId]/` — edit-booth page for one booth id, plus its printable QR sub-route.
- `actions.test.ts` — vitest suite (mocked Supabase chains) covering `saveBooth`'s entitlement enforcement: menu-item cap rejection, option-group cap rejection, silent stripping of `hours`/`stock` on a free-plan save, the active-booth cap (reject activating a 2nd booth) and its `neq` exclusion when re-saving the same booth.
- `actions.ts` — server actions: `deleteBooth(boothId)` hard-deletes a booth (cascades to its orders per migration 0009), RLS-scoped so a non-owner deletes zero rows, and reclaims its Storage images via `removeBoothImages`; `regenerateShortCode(boothId)` calls the `regenerate_short_code` RPC to rotate the booth's QR token and revalidates the QR page; `saveBooth(input)` validates with `boothFormSchema`, re-checks entitlement server-side (menu-item cap, option-groups-per-item cap, strips `hours`/per-item `stock` for plans without `autoCloseHours`/`stockCaps`), enforces the free-tier single-active-booth cap via a count query, then inserts or updates the `booths` row and reclaims orphaned images (`orphanedImagePaths`) on update.
- `booth-form.tsx` — `BoothForm({ vendorId, entitlement, initial? })` client component: the single create/edit form driving `name`, `image_url`, `is_active`, `hours`, `menu_items`, `payment` state, composing `MenuEditor`, `WorkingHoursEditor`, `PaymentSection`, and an `ImageUploader` banner inside `Section` blocks; validates with `boothFormSchema` on submit (sanitizing half-filled option groups first), calls `saveBooth`/`deleteBooth`, and includes a "Danger zone" delete confirmation (`AlertDialog`) when editing.
- `booth-list.tsx` — `BoothList({ booths })`: renders each booth as a `Ticket` card (banner image, name, Active/Paused/Off status pill, item count) with Edit / QR (`/dashboard/booths/{id}/qr`) / copy-order-link (`/o/{shortCode}`) actions.
- `menu-editor.tsx` — `MenuEditor({ vendorId, items, onChange, entitlement })`: per-item editor (name, description, `ImageUploader` thumb, price/cost in dollars via `centsToDollarString`/`parseDollarsToCents`, `available` checkbox, an optional sold-out `stock` cap gated by `entitlement.stockCaps` behind a `ProLock`, and a collapsible `OptionGroupsEditor` section); enforces `canAddMenuItem` against the plan's `maxMenuItems`, showing a `ProLock` once at cap.
- `new/` — create-booth page (renders `BoothForm` with no `initial`).
- `option-groups-editor.tsx` — `OptionGroupsEditor({ groups, onChange, entitlement })`: generic (not coffee-specific) editor for an item's customization groups — add/remove group, label, single/multi (`ToggleGroup` "Pick one"/"Pick any"), and per-group choices; enforces `canHaveOptionGroups` against `entitlement.maxOptionGroupsPerItem`.
- `page.tsx` — `BoothsPage()` (server, `revalidate = 0`): lists the vendor's booths (`servableBoothIds`/`isBoothPaused` mark which are paused by the plan's active-booth cap), shows an upgrade CTA when `canAddBooth` is false, and renders `BoothList`.
- `payment-section.dom.test.tsx` — RTL/jsdom tests for `PaymentSection`: PayNow field emits `{kind:"paynow", payee_name, uen}` or `{kind:"paynow", payee_name, mobile}` depending on whether the typed value starts with `+`; selecting "No online payment" emits `null`; the "pointer" (payment link/QR image) option defaults to the link field and clears the other field when the sub-mode toggles.
- `payment-section.tsx` — `PaymentSection({ vendorId, value, onChange })`: a `RadioGroup` of three payment kinds — `none` (no online payment), `paynow` (payee name + a single UEN-or-mobile field, generates a QR with amount pre-filled — a leading `+` routes the value to `mobile` instead of `uen`, clearing the other on every keystroke), `pointer` (a payment link OR an uploaded QR image, mutually exclusive via a `link`/`qr` `ToggleGroup`); treats a reserved `"stripe"` kind as `"none"` in the editor.
- `working-hours-editor.tsx` — `WorkingHoursEditor({ value, onChange, entitlement })`: daily (single open/close) or weekly (per-weekday `DayWindow`) schedule editor, gated entirely behind `entitlement.autoCloseHours` (shows a `ProLock` card instead when the plan lacks it); converts between modes via `dailyFromWeek`/`weekFromDaily` from `@/lib/hours-editor`.

## Connectivity

`page.tsx` lists booths (`booth-list.tsx`), which links to `new/` and `[boothId]/`, both of which render the shared `booth-form.tsx` (create vs. edit) built from `menu-editor.tsx` (itself embedding `option-groups-editor.tsx`), `working-hours-editor.tsx`, and `payment-section.tsx`. `booth-form.tsx` and the `new`/`[boothId]` pages call `saveBooth`/`deleteBooth`/`regenerateShortCode` in `actions.ts`, which enforce the same `@/lib/plan` entitlement caps the editors gate in the UI.

## Parent

[dashboard](../README.md)
