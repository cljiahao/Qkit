# Vendor Board Settings — Design

**Date:** 2026-07-09
**Status:** Approved, ready for plan.

## Summary

New `/dashboard/settings` page giving vendors control over four things that are
currently hardcoded or scattered:

1. **Aging thresholds** — minutes until an order card turns amber ("aging")
   and minutes until it turns red ("overdue"). Today fixed at `targetMin=10`
   (aging at 5, overdue at 10) inside `orderAgeTone()`.
2. **New-order sound** — pick from a small fixed set of built-in tones (or
   none). Today there's only an on/off toggle for one hardcoded chime.
3. **Desktop notifications for new orders** — opt-in system popup when a new
   order lands and the tab is backgrounded. Doesn't exist today for vendors
   (the existing `Notification` API usage in `order-alerts.ts` is customer-side,
   for "order ready").
4. Settings sync across devices (DB-backed, not localStorage) — same pattern as
   `tour_seen_at` (migration 0023).

Free tier. These are baseline usability/accessibility controls, not
capacity/analytics value — consistent with what's already gated (menu item
caps, stats range, auto-close hours) vs. not.

## Current state

- `src/lib/orders.ts:65` — `orderAgeTone(elapsedMs, targetMin = 10)`: aging at
  `targetMin/2`, overdue at `targetMin`. No way to set the two independently,
  no persistence, no UI.
- `src/components/order-card.tsx` — calls `orderAgeTone(elapsedMs)` with the
  default target; renders the amber/red full-card wash + age clock chip.
- `src/app/dashboard/realtime-order-board.tsx` — owns `soundOn` state,
  persisted to `localStorage["qkit:sound"]` (per-device). Plays
  `playReadyChime()` (one hardcoded WebAudio triad) on new-order insert via
  `use-realtime-orders`'s `onInsert` callback.
- `src/lib/order-alerts.ts` — WebAudio chime engine (`playReadyChime`,
  `unlockAudio`) + `Notification` API helpers (`isNotifySupported`,
  `requestNotifyPermission`, `fireReadyNotification`), currently wired only
  into the **customer** order-status page for "your order is ready".
- No settings page exists. `qkit.vendors` has no settings column.

## Data model

New column, migration `00XX_vendor_board_settings.sql`:

```sql
ALTER TABLE qkit.vendors
  ADD COLUMN IF NOT EXISTS board_settings JSONB NOT NULL DEFAULT
    '{"aging_min":5,"overdue_min":10,"sound_id":"chime","desktop_notify":false}'::jsonb;
```

No RLS policy change needed — a vendor can already update its own `vendors`
row (same as `tour_seen_at`).

TypeScript shape (`src/lib/types.ts`, mirrors the JSONB):

```ts
export interface BoardSettings {
  aging_min: number; // amber threshold, minutes
  overdue_min: number; // red threshold, minutes; must be > aging_min
  sound_id: "chime" | "bell" | "none";
  desktop_notify: boolean;
}
```

Validated with a Zod schema in `src/lib/schemas.ts`:
`z.object({ aging_min: z.number().min(1).max(120), overdue_min: z.number().min(1).max(240), sound_id: z.enum(["chime","bell","none"]), desktop_notify: z.boolean() }).refine(v => v.overdue_min > v.aging_min, ...)`.

## Components

### `orderAgeTone` signature change

`orderAgeTone(elapsedMs, agingMin, overdueMin): AgeTone` — takes both
thresholds directly instead of deriving aging as `targetMin/2`. Callers
(`order-card.tsx`) pass the vendor's `board_settings` values (loaded via a
context/prop from the dashboard layout, same way plan/profile data reaches
pages today) instead of relying on the default.

### Sound engine

`order-alerts.ts` gains a `SOUND_PRESETS` map keyed by `sound_id`:

- `chime` — today's existing triad (`CHIME_NOTES`, unchanged).
- `bell` — single lower tone, one note, longer decay.
- `none` — `playReadyChime`/new equivalent is a no-op.

`playSound(soundId)` replaces the direct `playReadyChime()` call in
`realtime-order-board.tsx`.

### Desktop notifications for new orders

Reuse `isNotifySupported`/`requestNotifyPermission`/gesture-unlock pattern.
New `fireNewOrderNotification(boothName, orderNumber)` alongside the existing
`fireReadyNotification`, fired from the same `onInsert` callback in
`realtime-order-board.tsx` that already triggers the chime + toast, gated on
`board_settings.desktop_notify` and only when the tab is backgrounded
(`document.hidden`), matching the existing tab-badge logic already there.

### Settings page

`src/app/dashboard/settings/page.tsx` (server component, loads
`board_settings` for the signed-in vendor) + `settings-form.tsx` (client,
React Hook Form + Zod resolver, mirrors the shape of `profile-form.tsx`):

- Two number inputs: "Turn amber after **_ min" / "Turn red after _** min".
- Radio group: sound preset (chime / bell / off), each with a "Preview" button
  that plays it immediately via the shared engine.
- Toggle: "Desktop notifications for new orders" — clicking on requests
  `Notification` permission (gesture-gated); if denied, toggle reverts and
  shows a toast explaining how to re-enable via browser settings.
- Server action `updateBoardSettings` (service-role not needed — vendor
  updates its own row under RLS, same pattern as `profile-form.tsx`'s own
  actions).

Nav link added to `dashboard-nav.tsx` alongside Profile/Plan.

## Testing

- `src/lib/orders.test.ts` — `orderAgeTone` with independent thresholds
  (below-aging, at-aging-boundary, at-overdue-boundary, above-overdue).
- `src/lib/order-alerts.test.ts` (or extend existing) — `playSound("none")`
  is a no-op; preset lookup falls back safely on an unknown id.
- `src/app/dashboard/settings/settings-form.dom.test.tsx` — validation
  (overdue must exceed aging), submit happy path, permission-denied revert.

## Out of scope

- Custom/uploaded sound files.
- Quiet hours / snooze / per-booth overrides.
- Mobile push (PWA) beyond what the existing Notification API already covers.
