# Arrival Confirmation ("Scan-to-Start") — Design

**Date:** 2026-07-21
**Status:** Decided (2026-07-21) — ready for an implementation plan
**Depends on:** Phase 1 job board Track C (`docs/meta/2026-07-17-phase1-manfred-pilot-job-board.md`), deep-research on vendor arrival-signal patterns (2026-07-20)

## Problem

For a perishable-immediately item (ice cream is the concrete case), a vendor
should not start prepping until the customer is actually standing at the
counter. Today every order goes straight to `preparing` on placement
(`place_order`/`place_walkup_order` in the migration history) with no way to
hold prep until the customer arrives.

Research into how comparable small vendors and platforms solve this ruled
out geolocation (browser accuracy is a variable, probabilistic radius, far
coarser than the 5-20m range needed to place a customer at one specific
booth, especially outdoors on patchy event wifi) and found that even large
POS platforms (Toast, Square) don't offer a passive/automatic version of
this — the real-world pattern, used at Toast's own scale, is a manual
customer-initiated signal.

## Decisions

1. **Per-booth toggle, not per-item.** A booth sells either perishable-immediate
   items (ice cream) or not — one switch per booth is enough; a mixed-cart
   scenario (some items perishable, some not) is out of scope for v1.
2. **Free for every plan, not Pro-gated.** This is a food-safety/operations
   feature, not a growth feature — doesn't fit the pattern of gating things
   that cost qkit more to serve (extra booths, stock caps).
3. **Blocks prep start.** When the toggle is on, an order sits in a
   waiting state until the customer confirms arrival. That confirmation is
   the actual trigger for prep to begin — it's the whole point (don't scoop
   before the buyer is there to eat it).
4. **Reuse the dormant `pending` status**, not a new enum value. `OrderStatus`
   already has `pending` sitting unused in the Postgres enum (every order
   today inserts straight to `preparing`) — no `ALTER TYPE` migration
   needed, only application wiring. `OrderStatusBadge` (`src/components/
order-status-badge.tsx:6-10`) already has a styled `pending` entry ready
   to use, just needs a clearer label than "Pending".
5. **Big, blocking customer-page state**, not a small banner. When an order
   is `pending`, the status page's main view IS the arrival prompt — a
   large "I'm here" button in place of the progress bar/wait estimate,
   which only appears after tapping. Solves the discoverability problem a
   scrollable banner wouldn't.
6. **Vendor sees waiting orders on the board**, with a manual override.
   `pending` orders appear on the live board (not hidden), visually
   distinct via the existing status badge, with a "Start now" action for
   the vendor-called-ahead case (e.g. a regular the vendor recognizes, or a
   customer who called out from a few metres away instead of tapping).
7. **Walk-up orders always skip straight to `preparing`**, regardless of
   the booth's toggle — there's no "customer arrives later" concept for an
   order the vendor is entering in person at the counter.

## Architecture

### Schema

```sql
ALTER TABLE public.booths
  ADD COLUMN requires_arrival_confirm BOOLEAN NOT NULL DEFAULT false;
```

No RLS change — covered by the existing `booths_vendor_update`/public-read
policies the same as every other booth-config column (`is_active`,
`hours`).

### Order placement

`place_order` and `place_walkup_order` (SQL functions) branch on the
booth's `requires_arrival_confirm`:

- Walk-up path: always inserts at `status = 'preparing'` (Decision 7),
  unchanged from today.
- QR/customer path: inserts at `status = 'pending'` when the flag is on,
  `'preparing'` when off (today's default, unchanged).

### `confirmArrival` action (customer-triggered)

New action in `status-actions.ts`, mirroring `claimPayment`'s shape
(`payment-actions.ts:44-95`) since both are unauthenticated,
token-gated, customer-initiated state flips:

```ts
export async function confirmArrival(
  boothId: string,
  orderNumber: string,
  token: string,
): Promise<ActionResult> {
  const parsed = parseOrderRef(boothId, orderNumber, token);
  if (!parsed.ok) return { success: false, error: "Invalid order" };

  const supabase = await createServiceClient();
  const ip = clientIp(await headers());
  const allowed = await rateLimit(supabase, `arrival:${boothId}:${ip}`, 10, 60);
  if (!allowed)
    return { success: false, error: "Too many attempts — wait a moment." };

  const { data: rows, error } = await supabase
    .from("orders")
    .update({ status: "preparing" })
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .eq("status", "pending")
    .select("id");
  if (error) {
    console.error("confirmArrival failed", error.message);
    return { success: false, error: "Could not start your order. Try again." };
  }
  if (rows && rows.length > 0) return { success: true };

  // Re-read to distinguish a harmless double-tap (already preparing — the
  // vendor may have hit "Start now" first) from a genuine problem.
  const { data: cur } = await supabase
    .from("orders")
    .select("status")
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .maybeSingle();
  if (!cur) return { success: false, error: "Order not found" };
  if (cur.status !== "pending") return { success: true }; // already started
  return { success: false, error: "Could not start your order. Try again." };
}
```

Same rate-limit pattern as `claimPayment` — cheap protection against a
script enumerating small sequential order numbers.

### Vendor "Start now" override

Add one entry to the existing `ADVANCE` map (`src/lib/orders.ts:25-30`):

```ts
export const ADVANCE: Partial<
  Record<OrderStatus, { next: OrderStatus; label: string }>
> = {
  pending: { next: "preparing", label: "Start now" },
  preparing: { next: "ready", label: "Mark Ready" },
  ready: { next: "completed", label: "Mark Picked Up" },
};
```

This is the whole change needed on the vendor side — the board's existing
`advanceOrder` action, its optimistic-concurrency guard
(`.eq("status", order.status)`), and `order-card.tsx`'s existing button
wiring all already work generically off this map. No new vendor-side code
path.

### Vendor board display

`OrderStatusBadge`'s `pending` label (`order-status-badge.tsx:6-10`)
changes from "Pending" to "Waiting for pickup" — the only UI change needed
on the board itself, since `pending` orders already render as normal cards
in the existing flat sorted list (`STATUS_RANK` already ranks
`pending`/`confirmed` after `preparing`/`ready`, unchanged — active
in-progress work stays visually first, waiting orders are still fully
visible below it, just not competing for top position).

### Customer status page

`OrderStatusPoller` (`order-status-poller.tsx`) branches on
`status === "pending"`:

- Renders a large "I'm here, start my order" button in place of the
  progress bar and wait-estimate block. Copy explains why: something like
  "We start making it fresh once you're at the counter."
- Tapping calls `confirmArrival`; on success, the poller's next tick picks
  up `status = "preparing"` and falls through to today's existing
  progress-bar view unchanged.
- No wait estimate is shown while `pending` — there's nothing to estimate
  yet (`getWaitEstimate`'s `ordersAhead` count already includes
  `pending` in `ACTIVE_STATUSES`, so the number stays accurate once prep
  starts).

Both the button and the fallback progress view need to render legibly at
phone width (customer, mobile) and at tablet width (vendor board view of
the same status data, if a vendor ever opens a customer's link to check on
it) — no new breakpoint needed, follows the page's existing responsive
patterns.

### Booth settings

`boothFormSchema`/`booth-form.tsx` gets a new `requires_arrival_confirm`
boolean field — a plain toggle (no `ProLock`, per Decision 2), likely
placed near the "Hours & availability" section since it's a similar
operational-timing concern. Label something like "Hold prep until the
customer arrives. For items made fresh per order." Available on both the
mobile and tablet booth-form layouts qkit already supports.

## Non-goals (v1)

- Per-menu-item granularity (Decision 1) — a booth is one or the other.
- Any timeout/auto-cancel on a `pending` order that never gets confirmed —
  separate concern from PR-E1's ready-order auto-clear; not addressed here.
- Geolocation or any passive/automatic detection — ruled out by research,
  not revisited for v1.
- Vendor-side QR rescan as an alternative confirm path — the "Start now"
  board button already covers the vendor-override case; a rescan flow adds
  camera/scanner UI for no behavior this doesn't already give the vendor.
