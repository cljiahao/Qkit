# Reorder + Recent-Orders Collapse — Design

**Date:** 2026-06-20
**Status:** Approved (brainstorming)
**Author:** Clarence + Claude

## Problem

Two customer-side asks on the booth page:

1. The "Your orders here" list (recent orders) feels like it could grow and push
   content down.
2. No way to repeat a previous order — customers re-build the cart by hand.

**Finding on (1):** the list is already hard-capped. `recent-orders.ts` stores at
most `MAX = 10` entries (localStorage, deduped, newest-first, filtered per booth)
— it cannot grow unbounded. So server-side pagination is unnecessary (YAGNI). The
real concern is presentation length on mobile.

## Decisions (from brainstorming)

- **List:** collapse to the 3 most recent + a `Show all (N) ▾` toggle. No data change.
- **Reorder entry points:** both the order status page and each recent-orders row.
- **Menu drift:** best-effort — prefill the cart with still-available lines at the
  **current** price/options, skip removed ones, drop the customer on the menu with
  a toast summary; they review before placing.

## Architecture

Customers are anonymous; the cart is client state (`Map<string, CartItem>` in
`OrderForm`, keyed by `cartKey`). Reorder reuses that seam: stash the intended
lines, navigate to the booth menu, let `OrderForm` reconcile against the **live**
menu it already receives and seed the cart.

### Units

**1. `src/lib/reorder.ts` (pure, unit-tested)**

```ts
type ReorderLine = { menuItemId: string; quantity: number; options?: SelectedOption[] };
type ReorderResult = { items: CartItem[]; unavailable: number };

reconcileReorder(lines, menuItems, remaining = {}): ReorderResult
```

For each line: find the item by `menuItemId` in the current menu; verify each
selected option still exists (match by **label** — `SelectedOption` holds labels,
per `item-customizer`); clamp quantity to live `remaining` stock. Valid → emit a
`CartItem` rebuilt with the **current** `name`/`price_cents`; invalid/removed/
zero-room → `unavailable++`. Duplicate `cartKey`s merge (summed quantity).

**2. `src/lib/reorder-handoff.ts` (sessionStorage)**

```ts
type ReorderSeed = { lines: ReorderLine[]; customerName?: string };
stashReorder(boothId, seed): boolean   // write qkit:reorder:<boothId>
takeReorder(boothId): ReorderSeed | null  // read-once, then remove
```

Best-effort (try/catch, SSR-guarded), mirrors `recent-orders.ts`.

**3. `src/components/reorder-button.tsx` (client)**

`stashReorder(boothId, {lines, customerName})` then `router.push(/order/<boothId>)`.
Shared by both entry points.

**4. Entry points**

- **Status page** (`[orderNumber]/page.tsx`, server): already loads the order via
  service-role. Strip each item to `{menuItemId, quantity, options}` (drops
  `cost_cents`/`price` — cost never reaches the client) and render `ReorderButton`
  with `customerName = order.customer_name`.
- **Recent-orders row** (`recent-orders.tsx`, client): extend `RecentOrder` with an
  optional `items: ReorderLine[]` snapshot (written by `addRecentOrder` at
  placement, where `OrderForm.onSubmit` already has `cartItems`). Rows with `items`
  show a Reorder button; pre-existing rows without it don't (graceful).

**5. `OrderForm` seed-on-mount**

`useEffect` (post-mount, client-only, like the localStorage read): `takeReorder` →
`reconcileReorder(lines, menuItems, remaining)` → seed the cart Map → `setValue`
the customer name → toast `Added N · M unavailable` (or, if nothing survived,
`These items aren't available anymore`). Key is consumed (read-once) so a refresh
doesn't re-seed.

### Recent-orders collapse

`recent-orders.tsx`: `const [showAll, setShowAll] = useState(false)`; render
`orders.slice(0, showAll ? orders.length : 3)`; show the toggle only when
`orders.length > 3`.

## Testing

- `reorder.test.ts`: removed item → unavailable; renamed option label → dropped;
  price changed → current price used; duplicate lines → merged + summed; stock cap
  → quantity clamped / over-cap dropped; all-unavailable → `items: []`.
- `reorder-handoff.test.ts`: stash→take round-trips; take clears (second take =
  null); malformed/garbage → null; SSR (no window) → null/false.
- `recent-orders.test.ts`: extend — `items` snapshot persists and round-trips;
  legacy entries without `items` still load.
- `order-form.dom.test.tsx`: a stashed seed populates the cart + prefills the name
  on mount; an all-unavailable seed leaves the cart empty.

## Out of scope (YAGNI)

- Server-side pagination (list is localStorage-capped at 10).
- Cross-device reorder for foreign recent-orders rows (recent-orders is already
  device-scoped, best-effort — the status-page button covers any device since it
  reads server-side).
- Persisting cost/price in the localStorage snapshot (reconcile uses the live menu).

## Acceptance criteria

- [ ] Recent-orders shows 3 by default with a working `Show all (N)` toggle.
- [ ] Reorder button on the status page and on recent-orders rows (rows with a
      snapshot).
- [ ] Reorder lands on the menu with the cart prefilled at current prices, name
      filled, and a toast; removed items are skipped, not errored.
- [ ] `reconcileReorder` and the handoff are unit-tested; `pnpm check` + `pnpm test`
      green.

## Risks

- **Option-label rename** drops a line (matched by label, not id). Acceptable —
  best-effort; the customer re-picks. Documented.
- **Stale localStorage snapshot** (price/menu changed): reconcile always uses the
  live menu, so the cart can't show a wrong price.
- **sessionStorage unavailable** (private mode): `stash` returns false; button
  still navigates to a fresh menu — degrades to "Order again".
