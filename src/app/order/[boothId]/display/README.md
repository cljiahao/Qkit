# display

## Purpose

Public, unauthenticated TV/second-screen queue display for one booth —
meant to run on a screen near the booth, not a customer's own phone. Answers
Manfred's second-event AAR pain point (item B, `docs/meta/2026-09-10-manfred-
second-aar-feature-backlog.md`): the "uncle" segment won't self-monitor a
phone, so the vendor marking an order "ready" on their own board needs to
show up somewhere a customer glancing at a shared screen will actually
notice.

## Contents

- `actions.ts` — `getBoothQueueDisplay(boothId)`: service-client read of one
  booth's active (non-terminal) orders, shaped down to
  `{ orderNumber, displayNumber, status }` — no customer name/phone/payment/
  items, the least a screen visible to anyone near the booth needs. No
  per-viewer secret to check (unlike the token-gated
  `../[orderNumber]/status-actions.ts`): this screen is meant to be readable
  by anyone near the booth, so `booth_id` alone is the read key — the same
  trade `getWaitEstimate` already makes internally, just reached here with
  no token-gated entry point in front of it. Computes the daily-reset
  display number the same way `../[orderNumber]/page.tsx`'s
  `resolveHeadingNumber` does (one extra query for the booth's first order
  of the SGT day, only when `board_settings.daily_order_number_reset` is
  on), and sorts with the same priority-bump-then-oldest-first rule as
  `sortActiveOrders` (`@/lib/orders`), reimplemented locally against this
  query's narrower row shape rather than imported. Returns `null` (not `[]`)
  on a real read failure, so the poller can tell "booth has no active
  orders" apart from "the read broke" and keep showing the last good state
  either way.
- `actions.test.ts` — unit tests (mocked Supabase chains) for the booth-
  not-found/booth-read-error/orders-read-error null returns, the
  priority-bump sort, and the daily-reset display-number computation.
- `page.tsx` — `BoothQueueDisplayPage` (route entry, `revalidate=0`):
  validates `boothId` as a UUID (`notFound()` otherwise, same as
  `../page.tsx`), confirms the booth exists (service client — anon can't
  read `booths` directly, see `../README.md`), then renders `QueueDisplay`
  seeded with `getBoothQueueDisplay`'s initial snapshot (`[]` on a read
  failure, so a transient DB hiccup at page-load never breaks the screen
  outright — the client poller gets its own chance to recover).
- `page.dom.test.tsx` — RTL test rendering `BoothQueueDisplayPage` directly
  (same pattern as `../[orderNumber]/page.dom.test.tsx`), `QueueDisplay`
  stubbed out (own dedicated test file): the notFound branches for an
  invalid boothId and a missing booth, and that a real booth's name/id/
  initial orders reach `QueueDisplay` as props.
- `queue-display.tsx` — `QueueDisplay({ boothId, boothName, initialOrders })`
  client component: polls `getBoothQueueDisplay` every 5s (`usePolling`,
  same 5s cadence as `../[orderNumber]/order-status-poller.tsx` — no
  realtime here either, same rationale). Diffs each poll against the
  previous status snapshot (seeded from `initialOrders` on mount, so
  orders already `ready` before the page loaded never falsely flash); any
  order that just transitioned into `ready` gets a few seconds of
  `queue-flash` animation (`globals.css`) layered on top of the "Ready for
  pickup" section's own static (always-visible, reduced-motion-safe)
  emphasis. Sound is opt-in and separate from the visual flash on purpose:
  `playReadyChime` (`@/lib/order-alerts`) uses the Web Audio API, which
  browsers keep suspended until a user gesture unlocks it — a TV tab
  nobody touches would never unlock it, so a chime call before that gesture
  would silently never play. An "Enable sound" button (shown until tapped)
  calls the shared `unlockAudio()` export once, meant to be tapped by the
  vendor when they set the screen up; if it's never tapped, the display
  still works fully via the visual flash alone.
- `queue-display.dom.test.tsx` — RTL tests for the Preparing/Ready grouping,
  each group's own empty state, that a poll updates the rendered orders,
  that only a genuine ready-transition (not an order already ready on
  mount) gets the flash class, the silent-by-default chime behavior, the
  "Enable sound" button's own click effect, and that a transient poll
  failure (`getBoothQueueDisplay` returning `null`) keeps showing the last
  good state instead of clearing the screen.

## Connectivity

Linked to from `src/app/dashboard/booths/booth-list.tsx`'s "Open TV
display" button (`/order/{boothId}/display`, opened in a new tab) — not
reachable from anything in the customer order flow, and carries no token.
`queue-display.tsx` polls `actions.ts`'s `getBoothQueueDisplay`, the same
service-client-bypasses-RLS pattern `../[orderNumber]/status-actions.ts`
uses, just without a per-order secret gating it.

## Parent

[[boothId]](../README.md)
