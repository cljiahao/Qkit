# settings

## Purpose

Lets a vendor tune how their live order board gets their attention and what
customers see while they wait: the amber/red aging thresholds, how long
staff have to undo a tap, how long an uncollected ready order sits before
auto-clearing, the new-order sound, desktop notifications, whether order
numbers reset daily, whether a wait-time estimate shows at all, and a
backup prep-time estimate. Settings are stored on the vendor's own row and
sync across devices.

## Contents

- `actions.ts` — `updateBoardSettings(input)` server action: validates
  `input` against `boardSettingsSchema`, confirms the caller is signed in,
  then updates `vendors.board_settings` (RLS `vendors_self_update` scopes the
  write to the caller's own row) and revalidates `/dashboard`.
- `page.tsx` — `SettingsPage` server component. Calls `requireEntitledVendor()`,
  renders the header/back-button chrome, and passes `vendor.board_settings` as
  `initial` into `SettingsForm`. Also fetches the vendor's booth ids and its
  last 20 `completed` orders across all of them (same window size as
  `getWaitEstimate`'s `RECENT_ORDER_LIMIT` in
  `src/app/order/[boothId]/[orderNumber]/status-actions.ts`, but combined
  across every booth rather than one — a vendor-wide approximation matching
  `default_prep_minutes`'s own vendor-wide granularity), reduces that through
  `currentPrepEstimate` (`@/lib/stats`), and passes the result as
  `prepEstimate`. `revalidate = 0` (always fresh).
- `settings-form.tsx` — `SettingsForm({ initial, prepEstimate })` client
  component, the actual UI: four `Section` cards (from `ticket-section.tsx`)
  split across two independent flex-column stacks side by side on `md`+ —
  "Board timing" + "Notifications" in the left stack, "New-order sound" +
  "Customer order screen" in the right, each column just `flex flex-col
gap-5` on its own two sections. Deliberately not a single `md:grid
md:grid-cols-2` over all four: a CSS grid's row tracks size to the tallest
  cell in that row, so once "Board timing" (4 inputs) outgrew "New-order
  sound" (1 button row), row 2 started late in _both_ columns — a visible gap
  over "Customer order screen" that had nothing to do with its own content.
  Nor CSS multi-column `columns` (the layout before that), which packs
  tightly but lets a card's visual position drift from its actual reading
  order. Every field/switch across all four cards follows the same
  short-label-plus-(i) shape: a one- or two-word `Label`/caption next to an
  `InfoTooltip` (`@merqo/ui` — the shared (i)-trigger component every
  one-sentence-explanation spot in the app uses, also used by `Section`'s
  own header `tooltip` prop) carrying the one-sentence explanation, so no
  card leans on a long inline paragraph to explain a single control. "Board timing" holds "Turn amber
  after"/"Turn red after" (the aging/overdue minute thresholds), "Undo
  window" (`undo_seconds`, 2-15s, validated live via `boardSettingsSchema`),
  and "Auto-clear after" (`ready_auto_clear_min`, 1-60min, blank/empty =
  `null` = the auto-clear sweep is off for that vendor entirely — see
  `sweepReadyOrders` in `src/app/dashboard/order-actions.ts`); "New-order
  sound" is a `ToggleGroup` of `SOUND_OPTIONS` —
  chime/bell/ding/horn/triple/off — that previews via `playSound` on pick and
  saves immediately; "Notifications" is a `Switch` (its extra iOS/Android
  detail lives behind the `Section`'s own `tooltip` prop, next to the card
  title, rather than in the always-visible `description`) that unlocks audio
  - requests `Notification` permission via `@/lib/order-alerts` before saving
    `desktop_notify`, reverting on denial. `desktop_notify` (the account
    setting, synced across devices) and the browser's own permission are
    tracked separately (`permission` state, updated only by this component's
    own request calls, never re-read live) — when the switch is already on but
    this browser hasn't granted it (e.g. after syncing from another device),
    clicking the switch would just turn it off, so a standalone "Enable in
    this browser" button re-requests permission without touching the account
    setting. "Customer order screen" has three controls: a `Switch` labeled
    "Simple daily order number" for `daily_order_number_reset` (see
    `displayOrderNumber` in `@/lib/orders` — zero-padded to 3 digits, e.g.
    "#003"); a `Switch` labeled "Show wait-time estimate" for
    `show_wait_estimate` (default `true` — off means the status page always
    shows only the queue-position label, "N orders ahead of you", never a
    minute guess, regardless of how much real order history exists — see
    `getWaitEstimate` in `status-actions.ts`); and a 1-60min "Backup prep
    time" `default_prep_minutes` number input, blank = null = "just show queue
    position" — used by the customer status page's wait estimate only when
    there isn't enough of today's history yet (`estimateWaitSeconds` in
    `@/lib/stats`). The backup-prep-time input is `disabled` and its block
    dimmed (`opacity-50`) whenever `show_wait_estimate` is off, since it
    would have no effect on what the customer sees in that state. Directly
    under that input (when the estimate is on), `prepEstimate` renders
    either the live number this vendor's own recent orders would currently
    produce ("Live right now: ~N min per order…", meaning the backup isn't
    in use) or, below the sample-size threshold, a disclaimer naming
    whichever fallback a customer would actually see right now — "their
    queue position" if `default_prep_minutes` is blank, "this backup
    number" once one's set — so the field doesn't read as inert when
    there's nothing to back up yet. Each section calls `updateBoardSettings`
    independently through `useAsyncAction`
    (via a shared `currentSettings()` helper) and `router.refresh()`s on
    success; every call sends the full `BoardSettings` shape (it's one JSONB
    blob), so each section's handler carries every other section's current
    values along to avoid clobbering them.
- `settings-form.dom.test.tsx` — RTL/jsdom tests (rendered inside
  `TooltipProvider`, required by the per-field info tooltips, with a
  `prepEstimate` prop supplied on every render): rejects `overdue_min <=
aging_min` and an out-of-range `undo_seconds` client-side without calling
  the action, saves valid thresholds, a changed undo window, and a changed
  `ready_auto_clear_min` value, previews+saves a sound pick, covers both
  notification-permission branches (granted saves and enables; denied
  reverts the switch and shows an error) plus the already-on-but-not-granted
  "Enable in this browser" path (re-requests permission without calling
  `updateBoardSettings`), and the customer-order-screen section (saves the
  daily-reset toggle, saves the show-wait-estimate toggle and confirms the
  backup-prep-time input disables while it's off, saves a configured backup
  prep time, saves `null` when it's cleared, rejects an out-of-1-60-range
  value without calling the action, and the three `prepEstimate` states:
  not-enough-history naming the
  queue-position fallback, naming the backup number once one's set, and the
  live-estimate line once enough history exists) — all with
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
`displayOrderNumber` on both the board and the status page,
`default_prep_minutes` feeds `getWaitEstimate`'s fallback and
`show_wait_estimate` gates whether it returns a number at all
(`src/app/order/[boothId]/[orderNumber]/status-actions.ts`), and
`ready_auto_clear_min` gates the board's 30s `sweepReadyOrders` poll
(`realtime-order-board.tsx` in `src/app/dashboard`) — `null` (the field left
blank here) disables the sweep entirely for that vendor.

## Parent

[dashboard](../README.md)
