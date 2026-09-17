# Arrival Confirmation — QR-scan Method (design)

**Date:** 2026-09-18
**Status:** Draft — awaiting review
**Extends:** `docs/superpowers/specs/2026-07-21-arrival-confirmation-design.md`
("Decided", shipped in migration `0064_booth_arrival_confirmation.sql`).
That spec's Decisions 1-4, 7 and the schema/`confirmArrival`/`ADVANCE`
architecture are unchanged and not repeated here — only the parts this
extends are covered below.
**Source:** Manfred's original F1 backlog item
(`docs/meta/2026-07-17-manfred-feature-backlog.md`) plus an in-chat
brainstorm (2026-09-18) once the second-AAR backlog closed out and F1 came
back into scope.

## Problem

The 2026-07-21 spec shipped exactly one confirmation mechanism: the
customer taps "I'm here, start my order" on their own status page. That
tap is a single, unconfirmed button press with no cost to a false
positive other than software state — but the real-world cost isn't
software. For a melt-sensitive item (ice cream, the concrete case this
whole feature exists for), a vendor who sees the order flip to
`preparing` scoops immediately; if the tap was a pocket-press or an
early tap from across the venue, the product is wasted before anyone
notices, regardless of whether the _status_ gets reverted afterward.

Two changes address this:

1. A second confirmation method — the customer scans a QR code posted at
   the booth counter, which requires physical presence at that specific
   location in a way a phone tap doesn't.
2. A lightweight confirm step added to the tap path itself, since it
   stays available (below) and currently has zero friction.

## Relationship to the original spec's rejected idea

The 2026-07-21 spec's non-goals explicitly rule out "vendor-side QR
rescan as an alternative confirm path," reasoning that the board's
existing "Start now" override already covers the vendor case and a
rescan flow adds scanner UI for no new behavior. **This is a different
mechanism, not a reversal**: that non-goal was about _staff_ operating a
scanner (the vendor-side override already does this job). What this spec
adds is a _customer_-operated scan of a static, booth-posted poster —
closer in spirit to the existing self-checkout pickup kiosk
(`docs/superpowers/specs/2026-09-13-payment-first-checkout-and-self-checkout-pickup-design.md`)
than to a vendor rescan.

## Decisions

1. **Per-booth method choice, not global.** `requires_arrival_confirm`
   (the on/off toggle) is unchanged. A new field,
   `arrival_confirm_method`, only meaningful when the toggle is on,
   picks `tap` or `qr_scan`. A vendor selling something non-perishable
   loses nothing from tap's lower friction (Manfred himself wants more
   human interaction, not less — `manfred_design_partner.md`); a
   melt-sensitive vendor gets the stricter option.
2. **Defaults to `qr_scan` when hold-prep is first turned on.** The
   toggle's whole reason to exist is melt-sensitive items (see the
   `booths.requires_arrival_confirm` column comment in
   `0064_booth_arrival_confirmation.sql`), which is exactly the case
   `qr_scan` protects better. The vendor can still switch to `tap`
   afterward — this is a smart default, not a forced value.
3. **Only one method is shown to the customer at a time, never both.**
   Showing both defeats the point: a customer could always take the
   lower-friction tap path regardless of which one the vendor picked
   for safety.
4. **The tap path gets a confirm step regardless of the method split.**
   A single `Button` with no confirmation, unchanged since 2026-07-21,
   now sits behind an `AlertDialog` ("Are you at the counter? Starting
   now can't be undone once we start making it.") — same component
   family already used for `close-booth-control.tsx`'s consequential
   action. Not a 3-second hold like booth-close (that guards a
   business-closing action; this is one order) — a single extra tap is
   enough friction to stop a pocket-press without adding real delay for
   a customer who is actually there.
5. **The QR-scan path needs no second confirm modal.** Scanning a
   physical poster at a specific location and then tapping "confirm" on
   the page it opens already requires two deliberate, location-bound
   actions — meaningfully more friction than the accidental case this
   guards against. Adding a third step (another modal) would be
   friction for no safety gain.
6. **No new server action for the confirm itself.** `confirmArrival`
   (`status-actions.ts`) already takes exactly `(boothId, orderNumber,
token)` and is method-agnostic at the database level — the write
   itself doesn't care whether the caller arrived via a tap or a scan.
   The QR-scan route is a new **client entry point** that supplies those
   same three params from a different source (below), not a new write
   path.
7. **QR generation reuses `react-qr-code`, the package this repo already
   uses for the booth's own ordering QR poster**
   (`booth-qr-poster.tsx:5`), not `@merqo/ui`'s `qrSvg`. `qrSvg` was
   promoted to the shared package during the component-promotion pass
   but qkit itself was never migrated to use it (PR #153's adoption list
   doesn't include it) — pulling it in now would be unrelated scope
   creep, not reuse of something this repo already depends on.
8. **No manual order-number fallback for the QR-scan route.** Every
   other public customer action in this codebase requires the per-order
   `access_token` alongside the order number specifically to prevent
   order-number enumeration (`confirmArrival`'s own rate-limit comment:
   "small sequential order numbers are easy to enumerate"). A "just type
   your order number" fallback would reopen that exact gap. Instead: if
   `recent-orders` localStorage has no match for this booth (different
   device, cleared cache, private browsing), the customer has no
   self-service path — but the vendor's own board already has a
   fallback for this: the original spec's Decision 6 "Start now"
   override, built for exactly this "customer called out / vendor
   recognizes them" case. No new fallback needed; the existing one
   already covers it.

## Data model changes

```sql
ALTER TABLE qkit.booths
  ADD COLUMN arrival_confirm_method TEXT NOT NULL DEFAULT 'qr_scan'
    CHECK (arrival_confirm_method IN ('tap', 'qr_scan'));
```

A plain `TEXT` + `CHECK` (not a Postgres `ENUM`) to match the
lightweight "kind marker" pattern already used elsewhere for a small
closed set of values (e.g. `booths.payment`'s `{kind}` marker per
`AGENTS.md`'s payments section), rather than the heavier `CREATE TYPE ...
AS ENUM` machinery `order_status` uses — this field is a UI/routing
switch, not a state machine.

No RLS change — same public-read / vendor-write policies every other
booth-config column already has.

No change to `place_order`/`place_walkup_order` — `arrival_confirm_method`
is only consulted when _confirming_ an already-`pending` order, not at
insert time. The existing `requires_arrival_confirm` branch in
`place_order` is untouched.

## Customer flow

**Tap method (existing booths, or a vendor who switched to it):**
unchanged from the 2026-07-21 spec, except the button now opens an
`AlertDialog` before calling `confirmArrival` instead of calling it
directly on click.

**QR-scan method (new):**

1. Vendor prints/displays a QR poster at the booth. The poster encodes a
   URL to a new route, `/order/[boothId]/arrive` — booth-scoped, no
   order number or token in the URL, same public/unattended pattern as
   `/order/[boothId]/pickup` (`pickup/page.tsx`).
2. `OrderStatusPoller`, when `status === "pending"` and the booth's
   `arrival_confirm_method === "qr_scan"`, shows "Scan the QR code at
   the counter to start your order" instead of a tap button — no
   self-service action available from this page.
3. Customer scans the poster with their own phone camera, lands on
   `/order/[boothId]/arrive`.
4. That page reads `getRecentOrdersForBooth(boothId)`
   (`src/lib/recent-orders.ts`, already written on every order placement
   at `order-form.tsx:305`) client-side.
   - One match: show that order's number and a single "Confirm — start
     my order" button. Tapping calls the existing `confirmArrival`
     using the stashed `{boothId, orderNumber, token}`.
   - Multiple matches (rare — same device, same booth, multiple orders
     still active): show a short list, same pattern `RecentOrders`
     already renders on `/o/[code]`, pick one.
   - No match: show "We couldn't find your order on this device — ask
     the vendor to start it for you," pointing at the vendor's own
     "Start now" board fallback (Decision 8). No text-entry fallback.

## Vendor flow

`booth-form.tsx` gets a method picker (radio or select: "Tap on their
phone" / "Scan a QR code at the counter"), shown only when "Hold prep
until the customer arrives" is checked, placed directly below that
toggle. Defaults to `qr_scan` for a booth turning the toggle on for the
first time (Decision 2); an existing booth that already has the toggle
on gets backfilled to `qr_scan` too, since every such booth predates
this field and none has opted into the (not-yet-existing) `tap`-only
distinction — migration sets the column default, no data migration
needed beyond the `DEFAULT`.

A vendor who picks `qr_scan` needs the poster: reuse
`booth-qr-poster.tsx`'s existing download/print flow, pointed at the new
`/arrive` URL instead of the ordering URL — likely a second poster
variant on the same QR page rather than a wholly new page, since the
print/download UI is identical.

## New/changed files (implementation-plan-level, not exhaustive)

- `supabase/migrations/0093_arrival_confirm_method.sql` — the `ALTER
TABLE` above (0092 is the current latest at spec time; confirm this
  number hasn't moved before implementing).
- `src/lib/types.ts`, `src/lib/schemas.ts` — add
  `arrival_confirm_method` alongside `requires_arrival_confirm`.
- `src/app/dashboard/booths/booth-form.tsx` — method picker.
- `src/app/order/[boothId]/[orderNumber]/order-status-poller.tsx` — branch
  on method; wrap tap button in `AlertDialog`.
- `src/app/order/[boothId]/[orderNumber]/page.tsx` — pass
  `arrival_confirm_method` down alongside `requires_arrival_confirm`.
- `src/app/order/[boothId]/arrive/page.tsx` (new) + a client component
  reading `recent-orders` and calling `confirmArrival`.
- `src/app/dashboard/booths/[boothId]/qr/booth-qr-poster.tsx` — second
  poster variant for the `/arrive` URL.
- No changes to `status-actions.ts`, `src/lib/orders.ts`'s `ADVANCE` map,
  or any SQL function beyond the one `ALTER TABLE` — Decision 6.

## Testing

- Unit: `arrival_confirm_method` parses/defaults correctly in
  `schemas.ts`.
- Component: `order-status-poller.dom.test.tsx` — tap path now requires
  the `AlertDialog` confirm before `confirmArrival` fires; QR-scan-method
  booths render the "scan the QR" message with no actionable button.
- Component: new `arrive` route — no-match / one-match / multi-match
  states off a mocked `recent-orders` read.
- No new server-action tests needed for `confirmArrival` itself (Decision
  6 — unchanged).

## Non-goals (this round)

- Per-item (vs per-booth) method choice — same rationale as the original
  spec's Decision 1.
- A manual/typed fallback on the `arrive` route — Decision 8.
- Any change to the vendor board's own "Start now" override — it already
  does the job needed here.
- Analytics on which method vendors pick / accidental-tap rate — no
  telemetry infrastructure to hang this off today.
