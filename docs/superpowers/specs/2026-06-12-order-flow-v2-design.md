# Order Flow v2 — Design

Date: 2026-06-12
Status: Approved (pending spec review)

## Problem

The vendor order board has four manual status steps (`confirmed → preparing →
ready → completed`) that are heavier than a booth needs. Vendors want fewer
presses. Separately:

- With multiple booths, the live board merges every booth's orders into one grid
  with **no booth label**, so a vendor can't tell which order belongs to which
  booth.
- The active board has no ordering, so the cards that need action aren't
  surfaced first.
- The Cancel button fires immediately — one fat-finger cancels a real order with
  no confirmation.

Out of scope (decided against): customer self-cancel. Order #s are sequential
and guessable, the new flow prepares from t=0 (cancel = wasted product), and QSR
norms don't allow it. The real need is covered by the customer telling the
vendor, who cancels.

## Goals

1. Collapse the vendor flow to `preparing → ready → completed` (+ cancelled).
2. Sort the active board so in-progress work is on top.
3. Make multiple booths legible on the board (filter tabs + booth badge).
4. Guard Cancel behind a confirmation modal.

## Non-goals

- No customer-facing cancel.
- No DB enum change (keep all six values for back-compat; just stop producing
  `pending`/`confirmed`).
- No new migration. This is code-only.

---

## 1. Simplified status flow

**New orders insert as `preparing`** instead of `pending`
(`src/app/order/[boothId]/actions.ts` — change `status: "pending"` →
`status: "preparing"`). No acknowledgement step; the order is being made the
moment it lands.

**Vendor advance map** (`src/components/order-card.tsx`):

```
preparing → ready → completed
```

`NEXT_STATUS` becomes `{ preparing: "ready", ready: "completed" }`. Button
labels are intent-named, not status-named:

- status `preparing` → button **"Mark Ready"**
- status `ready` → button **"Mark Picked Up"** (sets `completed`)

Cancel remains available on both non-terminal states.

**DB enum is untouched.** `pending` and `confirmed` stay valid so historical
orders still render; we simply stop writing them. `order-status-badge.tsx` keeps
all six entries.

**Customer status page** (`order-status-poller.tsx`):

- `STEPS` becomes `["preparing", "ready"]` (2-step progress bar, was 4).
- `STATUS_MESSAGE` keeps all keys (back-compat for old orders) but the live
  flow only surfaces `preparing` / `ready` / `completed` / `cancelled`.
- `activeIndex` logic unchanged in shape; recomputed against the 2-step array.

## 2. Board sort

In `realtime-order-board.tsx`, after filtering to active orders, sort by:

1. **status priority**: `preparing` (0) before `ready` (1)
2. **FIFO within a status**: `created_at` ascending (oldest on top)

`created_at` is used (not `order_number`) because order numbers are per-booth and
not globally ordered. A small `STATUS_RANK: Record<OrderStatus, number>` drives
the primary key.

## 3. Multi-booth board

Filter tabs over the active board.

- Tab bar renders **only when `booths.length > 1`** — single-booth vendors see
  exactly today's UI (no tabs, no badge).
- Tabs: `All` + one per booth. Each tab shows its **active count**
  (e.g. `Waffles 3`), computed from the live `orders` array, so a new order on an
  inactive tab still lights up its count.
- `All` is the default selected tab.
- Selecting a booth filters the grid to that booth's orders.
- **Booth-name badge** on every `OrderCard`, shown whenever the tab bar is
  visible (i.e. multi-booth), including on `All`. The card maps `order.booth_id`
  → booth name from the `booths` prop.

State: a single `selectedBoothId: string | "all"` `useState` in
`RealtimeOrderBoard`. No URL/query persistence (ephemeral counter device).

`OrderCard` gains an optional `boothName?: string` prop; when present it renders
a small badge in the card header next to the status badge. Omitted → no badge
(single-booth path unchanged).

## 4. Cancel confirmation modal

Wrap the vendor Cancel action in a shadcn `AlertDialog`:

- Trigger: the existing Cancel button.
- Title: `Cancel order #<order_number>?`
- Body: `This permanently cancels the order and removes it from the board. This
  can't be undone.`
- Actions: **Keep order** (close) / **Cancel order** (destructive → runs
  `cancelOrder`).

If `alert-dialog` isn't already in `src/components/ui/`, add it via the shadcn
CLI (`pnpm dlx shadcn@latest add alert-dialog`) — do not hand-author it.

---

## Files touched

| File | Change |
|------|--------|
| `src/app/order/[boothId]/actions.ts` | insert `status: "preparing"` |
| `src/components/order-card.tsx` | new `NEXT_STATUS`, button labels, `boothName` badge, AlertDialog on cancel |
| `src/app/dashboard/realtime-order-board.tsx` | sort, booth tabs, pass `boothName` |
| `src/app/order/[boothId]/[orderNumber]/order-status-poller.tsx` | 2-step `STEPS` |
| `src/components/ui/alert-dialog.tsx` | add via shadcn CLI if missing |

No migration. No `types.ts` change (enum already lists all values).

## Testing

- `src/lib/` has the pure helpers; add a small unit test for the board-sort
  comparator (extract it as a pure function `sortActiveOrders(orders)` in a
  testable module, e.g. `src/lib/orders.ts`, rather than inlining in the
  component) covering: preparing-before-ready, FIFO within status, mixed booths.
- Manual: place order → lands `preparing`; Mark Ready → Mark Picked Up clears it;
  Cancel → modal → confirm clears it; two booths → tabs + badges appear, counts
  update live; one booth → no tabs.
- `pnpm check` green (tsc + eslint + prettier).

## Risks

- **Tabs hiding a new order** on an inactive booth tab → mitigated by `All`
  default + per-tab live counts.
- **Old orders** still in `pending`/`confirmed` from before the change render via
  retained badge/message config but won't advance through the new map. Acceptable
  — beta has no real historical orders; if any exist, a vendor cancels them.
