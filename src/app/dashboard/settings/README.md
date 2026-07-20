# settings

## Purpose

Lets a vendor tune how their live order board gets their attention and what
customers see while they wait: the amber/red aging thresholds, the
advance-undo window, the new-order sound, desktop notifications, whether
order numbers reset daily, and a fallback wait-time estimate. Settings are
stored on the vendor's own row and sync across devices.

## Contents

- `actions.ts` — `updateBoardSettings(input)` server action: validates
  `input` against `boardSettingsSchema`, confirms the caller is signed in,
  then updates `vendors.board_settings` (RLS `vendors_self_update` scopes the
  write to the caller's own row) and revalidates `/dashboard`.
- `page.tsx` — `SettingsPage` server component. Calls `requireEntitledVendor()`,
  renders the header/back-button chrome, and passes `vendor.board_settings` as
  `initial` into `SettingsForm`. `revalidate = 0` (always fresh).
- `settings-form.tsx` — `SettingsForm({ initial })` client component, the
  actual UI: four `Section` cards (from `ticket-section.tsx`) for "Board
  timing" (amber/red minute inputs plus the `undo_seconds` advance-undo
  window, 2-15s, validated live via `boardSettingsSchema`), "New-order sound"
  (a `ToggleGroup` of `SOUND_OPTIONS` — chime/bell/ding/horn/triple/off —
  that previews via `playSound` on pick and saves immediately), "Notifications"
  (a `Switch` that unlocks audio + requests `Notification` permission via
  `@/lib/order-alerts` before saving `desktop_notify`, reverting on denial),
  and "Order display" (a `Switch` for `daily_order_number_reset` — see
  `displayOrderNumber` in `@/lib/orders` for what it actually changes — plus a
  1-60min `default_prep_minutes` number input, blank = null = "just show
  queue position", used by the customer status page's wait estimate only
  when there isn't enough of today's history yet; see `estimateWaitSeconds`
  in `@/lib/stats`). An `Info` icon next to the undo-window label opens a
  `Tooltip` (heading line plus two short muted paragraphs, not one run-on
  sentence) spelling out what the setting actually does, since "Advance undo
  window" alone doesn't say what it's undoing or when it locks in. Each
  section calls `updateBoardSettings` independently through `useAsyncAction`
  (via a shared `currentSettings()` helper) and `router.refresh()`s on
  success; every call sends the full `BoardSettings` shape (it's one JSONB
  blob), so each section's handler carries every other section's current
  values along to avoid clobbering them.
- `settings-form.dom.test.tsx` — RTL/jsdom tests (rendered inside
  `TooltipProvider`, required by the undo-window info tooltip): rejects
  `overdue_min <= aging_min` and an out-of-range `undo_seconds` client-side
  without calling the action, saves valid thresholds and a changed undo
  window, previews+saves a sound pick, covers both notification-permission
  branches (granted saves and enables; denied reverts the switch and shows an
  error), and the order-display section (saves the daily-reset toggle, saves
  a configured fallback estimate, saves `null` when it's cleared, rejects an
  out-of-1-60-range value without calling the action) — all with
  `updateBoardSettings`/`sonner`/`order-alerts` mocked.

## Connectivity

`page.tsx` is the route entry (`/dashboard/settings`), reached from the
dashboard nav; it fetches the vendor row via `requireEntitledVendor` and hands
it to `SettingsForm`. `SettingsForm` calls `actions.ts#updateBoardSettings`,
which persists to Supabase and revalidates the `/dashboard` layout so the
order board (`src/app/dashboard`) and the customer status page
(`src/app/order/[boothId]/[orderNumber]`) pick up the new settings on next
render — `OrderCard` reads `agingMin`/`overdueMin`/`undoMs` (the last as
`undo_seconds * 1000`), the dashboard's realtime listener plays the chosen
sound / fires notifications, `daily_order_number_reset` feeds
`displayOrderNumber` on both the board and the status page, and
`default_prep_minutes` feeds `getWaitEstimate`'s fallback
(`src/app/order/[boothId]/[orderNumber]/status-actions.ts`).

## Parent

[dashboard](../README.md)
