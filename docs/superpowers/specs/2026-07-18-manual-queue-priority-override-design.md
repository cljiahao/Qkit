# Manual Queue Priority Override — Design

**Date:** 2026-07-18
**Status:** DRAFT — pending founder review, not yet approved
**Depends on:** Track B (walk-up order entry / unified board), Phase 1 job board (`docs/meta/2026-07-17-phase1-manfred-pilot-job-board.md`)

## Open questions (resolve before this becomes an implementation plan)

1. Does a bump apply once (order jumps to the front, then ages normally from
   its new position) or does it pin the order permanently above all new
   arrivals until served? This spec recommends **once** (see Decisions) but
   it's a real product call, not an engineering one.
2. Should there be any limit on how many times/how often an order can be
   bumped (abuse/mistake guard), or is a single vendor-facing booth low
   enough stakes that no limit is needed?
3. Is a visible "bumped" marker on the card enough transparency, or does
   Manfred want an audit trail (who bumped, when) — current recommendation
   is no audit trail for v1 (single-vendor-account booths have no
   multi-staff identity to attribute it to yet, see qkit's separately
   identified multi-staff-access gap).

## Problem

`sortActiveOrders` (`src/lib/orders.ts:141-147`) sorts strictly by status
rank then `created_at` ascending — pure FIFO, no escape hatch. This is
deliberate (fairness, no channel bias between QR and walk-up orders) but
real situations need a human override: an elderly or non-digital customer
who walked up to the booth in person, or any other in-the-moment judgment
call the vendor wants to make. Today there is no way to do this without
breaking the fairness guarantee for everyone else by, e.g., editing
`created_at` directly (which would also corrupt the ticket-aging display,
since that's computed from the same field).

## Goal

Let a vendor explicitly bump a specific order to the front of its status
lane, as a **visible, deliberate action** — not silent/automatic bias.
Every other order's position is unaffected. The change must sync live to
every open vendor session, the same way every other board mutation
already does.

## Decisions (proposed)

1. **New nullable column `orders.priority_bumped_at` (timestamptz).** Null
   = normal FIFO. Set = this order sorts before every non-bumped order in
   the same status lane, ranked among other bumped orders by
   `priority_bumped_at` (most recently bumped first — matches "I just
   decided this one matters right now").
2. **Sort change, additive only:** `sortActiveOrders` gains a bump-rank
   check _before_ the existing `created_at` comparison, within the same
   status-rank tier: bumped orders sort first (by `priority_bumped_at`
   descending), then the existing FIFO logic applies unchanged among the
   rest. `created_at` itself is never touched — ticket-aging display stays
   accurate regardless of bump state.
3. **Bump applies once, not pinned** — recommended over a permanent pin.
   A pin would let one bumped order silently block the queue indefinitely
   if forgotten about; a one-time jump-to-front, after which the order
   resumes normal aging/FIFO behavior from its new front-of-lane position,
   self-limits the override's blast radius. (Open question 1 — confirm
   with Manfred before building.)
4. **UI: a single "Bump to front" button, not drag-to-reorder.** Matches
   this codebase's existing one-tap-action philosophy (`ADVANCE`,
   `cancelOrder` are both single buttons, no drag interactions exist
   anywhere in the board today). Drag-to-reorder is a materially bigger
   UI investment for a case that's about occasional judgment calls, not
   routine reordering.
5. **Visible marker on a bumped card** — a small badge/icon (e.g. next to
   the existing age-clock indicator in `order-card.tsx:180-215`) so a
   bump is an explicit, seen state, not a silent reorder. Clears once the
   order is served (terminal) same as every other per-order state.
6. **No audit trail (who/when beyond the timestamp) for v1** — see open
   question 3. `priority_bumped_at` itself is enough to know _when_; _who_
   isn't attributable yet since booths have single-vendor-account access,
   not multi-staff identity.

## Architecture

### Schema

```sql
ALTER TABLE public.orders
  ADD COLUMN priority_bumped_at TIMESTAMPTZ;
```

No RLS change needed — this is a state-machine column on a row the
`orders_vendor_update` policy (owner-scoped) already covers, same as
`status`. Add to `BOARD_ORDER_COLUMNS` (`src/lib/orders.ts:7-8`) so it's
selected on initial load and realtime resync — no new plumbing needed
beyond that, since `use-realtime-orders.ts`'s Postgres-CDC channel already
propagates any column change on the `orders` table to every open vendor
session (confirmed: the channel listens for `event: "*"` with no column
allowlist, and `applyRealtimeOrderEvent` merges by id/`updated_at`, so a
new column rides along for free).

### Sort logic (`src/lib/orders.ts`)

```ts
export function sortActiveOrders(orders: BoardOrder[]): BoardOrder[] {
  return [...orders].sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    const aBumped = a.priority_bumped_at != null;
    const bBumped = b.priority_bumped_at != null;
    if (aBumped !== bBumped) return aBumped ? -1 : 1;
    if (aBumped && bBumped) {
      return (
        new Date(b.priority_bumped_at!).getTime() -
        new Date(a.priority_bumped_at!).getTime()
      );
    }
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}
```

Pure, non-mutating, same shape as today — one additional branch before the
existing `created_at` comparison.

### Server action (`src/app/dashboard/order-actions.ts`)

New `bumpOrder(orderId: string)`, mirroring `advanceOrder`'s exact shape:
`idSchema` validation, `loadOwnOrder` (RLS-scoped), reject if terminal
(`isTerminal(order.status)` — a completed/cancelled order can't be
bumped), then:

```ts
const { data: rows, error } = await supabase
  .from("orders")
  .update({ priority_bumped_at: new Date().toISOString() })
  .eq("id", orderId)
  .eq("status", order.status) // same optimistic-concurrency guard as advanceOrder/cancelOrder
  .select("id");
```

No new concurrency concern beyond what `advanceOrder`/`cancelOrder`
already handle with the `.eq("status", expected)` guard — two vendor
sessions bumping the same order twice in quick succession is harmless
(idempotent-ish: second bump just updates the timestamp again, order
stays at the front either way).

### UI (`src/components/order-card.tsx`)

Add a "Bump to front" button in the existing action row
(`order-card.tsx:322-375`, alongside `advance`/`Cancel`), visible only
when `!closed && order.priority_bumped_at == null` (already-bumped orders
don't need the button again — could hide it, or leave it as a no-op,
lean toward hiding to avoid a confusing double-bump affordance). Wire
through `useAsyncAction` (`run`) exactly like `advanceStatus`/
`cancelOrder` already do. Add the visible marker (badge near the age
indicator) driven by `order.priority_bumped_at != null`.

## Non-goals (v1)

- Drag-to-reorder (see Decision 4).
- Multi-staff attribution of who bumped (see Decision 6, and qkit's
  separately-tracked multi-staff-access gap).
- Any limit/cooldown on repeated bumping (open question 2).
- Applying this concept to the completed-orders history view — bumping
  only makes sense for active-lane ordering.
