# settings

## Purpose

Lets a vendor tune how their live order board gets their attention: the
amber/red aging thresholds, the new-order sound, and desktop notifications.
Settings are stored on the vendor's own row and sync across devices.

## Contents

- `actions.ts` — `updateBoardSettings(input)` server action: validates
  `input` against `boardSettingsSchema`, confirms the caller is signed in,
  then updates `vendors.board_settings` (RLS `vendors_self_update` scopes the
  write to the caller's own row) and revalidates `/dashboard`.
- `page.tsx` — `SettingsPage` server component. Calls `requireEntitledVendor()`,
  renders the header/back-button chrome, and passes `vendor.board_settings` as
  `initial` into `SettingsForm`. `revalidate = 0` (always fresh).
- `settings-form.tsx` — `SettingsForm({ initial })` client component, the
  actual UI: three `Section` cards (from `ticket-section.tsx`) for "Attention
  thresholds" (amber/red minute inputs, validated live via
  `boardSettingsSchema`), "New-order sound" (a `ToggleGroup` of `SOUND_OPTIONS`
  — chime/bell/ding/horn/triple/off — that previews via `playSound` on pick
  and saves immediately), and "Notifications" (a `Switch` that unlocks audio +
  requests `Notification` permission via `@/lib/order-alerts` before saving
  `desktop_notify`, reverting on denial). Each section calls
  `updateBoardSettings` independently through `useAsyncAction` and
  `router.refresh()`s on success.
- `settings-form.dom.test.tsx` — RTL/jsdom tests: rejects `overdue_min <=
aging_min` client-side without calling the action, saves valid thresholds,
  previews+saves a sound pick, and covers both notification-permission
  branches (granted → saves and enables; denied → reverts the switch and
  shows an error), all with `updateBoardSettings`/`sonner`/`order-alerts`
  mocked.

## Connectivity

`page.tsx` is the route entry (`/dashboard/settings`), reached from the
dashboard nav; it fetches the vendor row via `requireEntitledVendor` and hands
it to `SettingsForm`. `SettingsForm` calls `actions.ts#updateBoardSettings`,
which persists to Supabase and revalidates the `/dashboard` layout so the
order board (`src/app/dashboard`) picks up the new thresholds/sound/notify
settings on next render — `OrderCard` reads `agingMin`/`overdueMin` and the
dashboard's realtime listener plays the chosen sound / fires notifications.

## Parent

[dashboard](../README.md)
