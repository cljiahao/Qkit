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
  orders already `ready` before the page loaded never falsely flash).
  Forces the app's own `.dark` theme on this page regardless of the
  viewing device's OS setting — a genuine digital-signage board reads
  better on a dark ground with bright accents than a light one, and the
  choice follows from the use scene (a TV/kiosk screen at a market or
  event, day or night), not the visitor's own preference. A `ready` order
  is styled after this app's own existing "ticket-stamp" reveal for the
  customer's own status page
  (`../[orderNumber]/order-status-poller.tsx`'s `status === "ready"`
  block: `border-status-ready`/`text-status-ready`, `fade-rise`) rather
  than an invented QSR-generic look — a steady Ready tile is a
  `status-ready`-tinted, thick-bordered card; the moment one transitions
  it flips to a solid `bg-status-ready` fill, tilts `-rotate-3` like a
  freshly stamped ticket, reuses the same `fade-rise` reveal keyframe
  (`globals.css`) the order-status page's own stamp already uses, and
  carries a static "Just called" caption inside the tile (in normal
  document flow, not absolutely positioned — an earlier version's
  floating badge got clipped by the tile grid's own overflow guard) so a
  `prefers-reduced-motion` viewer still gets a clear non-animated cue.
  Preparing tiles stay a quiet, uncolored card — the Ready/Preparing
  contrast is the entire point, so only Ready carries color. A
  currently-flashing order also sorts to the front of the Ready grid
  (ahead of the cap-visibility logic below), landing in the same
  first/most-noticeable slot a physical "now serving" board gives the
  latest number. Sound is opt-in and separate from the visual cue on
  purpose: `playReadyChime` (`@/lib/order-alerts`) uses the Web Audio
  API, which browsers keep suspended until a user gesture unlocks it — a
  TV tab nobody touches would never unlock it, so a chime call before
  that gesture would silently never play. An "Enable sound" button
  (shown until tapped) calls the shared `unlockAudio()` export once,
  meant to be tapped by the vendor when they set the screen up; if it's
  never tapped, the display still works fully via the visual cue alone.
  Preparing and Ready for pickup render side by side (`grid-cols-2` from
  `sm:` up, stacked below it, a dashed vertical rule between them
  echoing the perforation motif used elsewhere in this app) rather than
  stacked full-width, so a long Preparing list can't push Ready off the
  bottom. The whole page is `h-screen overflow-hidden` — a TV screen has
  no scroll — so each column also caps how many tiles it ever renders
  (`MAX_VISIBLE_PREPARING`/`MAX_VISIBLE_READY`, fixed numbers tuned for a
  landscape screen rather than measured against the real viewport) and
  shows a "+N more" line for whatever's hidden past the cap, dropping the
  newest orders first (the ones a customer's been waiting on longest stay
  visible). A currently-flashing order is never one of the hidden ones,
  even past the cap — that cue is the entire point of this screen, so it
  always gets a guaranteed slot ahead of older, already-settled ready
  orders competing for the same limited space.
- `queue-display.dom.test.tsx` — RTL tests for the Preparing/Ready
  grouping, each group's own empty state, that a poll updates the
  rendered orders, that only a genuine ready-transition (not an order
  already ready on mount) gets the `fade-rise` stamp class and static
  "Just called" caption, the silent-by-default chime behavior, the
  "Enable sound" button's own click effect, a transient poll failure
  (`getBoothQueueDisplay` returning `null`) keeping the last good state
  instead of clearing the screen, each column's own render cap plus its
  "+N more" line, and that a currently-flashing order still renders even
  when the ready count is already past the cap.

## Connectivity

Linked to from `src/app/dashboard/booths/booth-list.tsx`'s "Open TV
display" button (`/order/{boothId}/display`, opened in a new tab) — not
reachable from anything in the customer order flow, and carries no token.
`queue-display.tsx` polls `actions.ts`'s `getBoothQueueDisplay`, the same
service-client-bypasses-RLS pattern `../[orderNumber]/status-actions.ts`
uses, just without a per-order secret gating it.

## Parent

[[boothId]](../README.md)
