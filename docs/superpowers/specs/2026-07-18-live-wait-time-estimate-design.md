# Live Wait-Time Estimate — Design

**Date:** 2026-07-18
**Status:** Decided (2026-07-18) — ready for an implementation plan

## Summary

Show customers a live "ready in ~N min" estimate on the order-status page,
Luckin/Chagee-style, computed from data qkit already tracks — no new
instrumentation. Goal: cut "is it ready yet" interruptions at the source
(same motivation as the board's one-tap/auto-clear work), by giving the
customer an honest answer up front instead of making them ask.

## Current state

- `src/lib/stats.ts` already computes `avgWaitSeconds(orders)` — mean
  placed→ready seconds over non-cancelled orders with a `ready_at`,
  `null` if none qualify (the module's convention: rates/waits return
  `null` on insufficient data, never a misleading `0`).
- `src/lib/orders.ts`'s `sortActiveOrders` defines the board's real queue
  order: `preparing` before `ready` (rank 0/1), `pending`/`confirmed` rank
  2, then FIFO by `created_at` within a rank. This is the actual queue
  position logic to reuse — an estimate must match what the vendor's board
  shows, not a separate invented ordering.
- The customer order-status page
  (`src/app/order/[boothId]/[orderNumber]/page.tsx`) currently fetches
  only the single order + booth row (one query, `Promise.all`'d with the
  booth read) — no query today counts other orders at the booth. Adding
  "orders ahead of this one" needs a new, cheap query: count of that
  booth's active orders with `STATUS_RANK <= this order's rank` and
  `created_at < this order's created_at`.
- Entitlement gating (`src/lib/plan.ts`) only gates operational scaling
  (`maxBooths`, `autoCloseHours`) — customer-facing display features like
  this aren't gated anywhere in the codebase. The closest precedent,
  `2026-07-16-vendor-social-links-design.md`, explicitly chose free/
  ungated for a customer-experience feature, reasoning that gating a
  low-marginal-cost feature that improves the customer's experience is
  inconsistent with what the existing gates actually protect against
  (booth/menu scaling, not display polish). Recommend the same call here.

## Approaches considered

**A. Global historical average (`avgWaitSeconds` as-is) × queue position.**
Simplest — reuse the existing pure function unchanged, query today's (or
a rolling N-day) order set for the booth, multiply by queue depth ahead.
Con: a historical average from calmer days will under-promise on a vendor's
first big rush, or over-promise on an unusually quiet day — reacts slowly
to what's actually happening right now.

**B. Rolling recent-window average (e.g. last 10-20 completed orders
today) × queue position — recommended.** Same `avgWaitSeconds` function,
just called with a recency-filtered slice instead of the full history.
Reacts to the booth actually running slow/fast _today_ — closer to what
Luckin/Chagee-style estimates actually do (they're reacting to live
kitchen throughput, not a 30-day average). Con: needs a minimum sample
size before it's trustworthy (see open question 1 below) — noisier with
few data points than approach A.

**C. Hybrid — rolling window with a historical fallback.** Use the
recent-window average once there are enough same-day orders; fall back to
the longer historical `avgWaitSeconds` below that threshold. Best of both,
but more logic to write and test than either alone, and introduces a
threshold number to tune (see open question 1).

**Recommendation: B for v1, revisit C only if B's cold-start behavior
(open question 1) proves genuinely bad in practice.** Don't over-engineer
a hybrid before knowing B's simpler version is actually insufficient.

## Data flow (approach B)

1. Order-status page's existing query gains a second, parallel query
   (same `Promise.all` the page already uses for the order+booth reads):
   count of the booth's active orders ranked ahead of this one
   (`STATUS_RANK[status] <= STATUS_RANK[this.status]` and earlier
   `created_at`, mirroring `sortActiveOrders`'s own comparison — do not
   reimplement the ordering logic a second time, extract/reuse it).
2. A recent-orders query (e.g. today's completed orders for this booth,
   most recent N) feeds `avgWaitSeconds` from `stats.ts` unchanged.
3. `estimateSeconds = ordersAhead × avgWaitSeconds(recentOrders)`. Return
   `null` (render nothing, not a guess) if `avgWaitSeconds` is `null` —
   matches the module's existing empty-data convention exactly.
4. Display: a coarse label matching `elapsedLabel`'s existing precision
   philosophy in `orders.ts` ("just now", "5 min ago" — the customer wants
   a sense it's tracked, not second precision) — e.g. "~5 min" not
   "4 min 37 sec".

## Decisions (2026-07-18)

1. **Minimum sample size: ~10 recent completed orders** before showing an
   estimate at all. Below that, show nothing rather than a guess — a
   booth's first event of the day gets no wrong number displayed.
2. **Live-updating, not a one-time snapshot.** Reuse the existing realtime
   wiring (`use-realtime-orders`) rather than a stale estimate frozen at
   order-placed time — more honest if the queue speeds up or slows down
   after the customer last looked.

## Out of scope for this spec

- Any change to the vendor-facing board itself — this is customer-status-
  page-only.
- Multi-booth/multi-cart wait estimates (see the still-unscoped multi-cart
  coordination question elsewhere in the backlog) — this spec assumes one
  booth, one queue, as the current data model already does everywhere
  else.
