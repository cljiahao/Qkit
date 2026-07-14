# hooks

## Purpose

Shared React hooks that factor out client-side stateful patterns (pending-flag
tracking, tab-aware polling, live clocks, Supabase Realtime subscriptions) that
would otherwise be duplicated across the vendor dashboard and the customer
order-status page.

## Contents

- `use-async-action.ts` — `useAsyncAction()` returns `{ pending, run }`; `run` wraps
  an async handler in `try/finally` so `pending` always resets even if the handler
  throws (replaces hand-rolled `setBusy(true)…await…setBusy(false)` that left
  buttons stuck-disabled on a rejection). Also exports `navigatingAway()`, a
  promise that never resolves, used to keep `pending` true through a
  `router.push`/`router.replace` transition so a button doesn't flash re-enabled
  while the old page is still showing.
- `use-async-action.test.tsx` — RTL tests: pending resets on success, resets on a
  thrown/rejected handler, and stays `true` while the handler is in flight.
- `use-now.ts` — `useNow(intervalMs, enabled=true)`: client-only hook that
  re-renders every `intervalMs` with `Date.now()`, driving "time ago"/countdown
  UI; `enabled=false` stops the ticking (e.g. once an order reaches a terminal
  status). Marked `"use client"`.
- `use-polling.ts` — `usePolling(tick, { intervalMs, enabled })`: runs `tick` on
  an interval only while the tab is visible, pausing on `visibilitychange` when
  hidden and firing an immediate tick when the tab regains focus (also covers
  the SSR/hydration gap). `tick` is held in a ref so a fresh closure per render
  doesn't force a resubscribe — only `intervalMs`/`enabled` do. Shared by the
  customer order-status and payment pollers, which previously carried their own
  copies of this logic.
- `use-polling.test.tsx` — fake-timer tests: no-op while disabled, immediate +
  interval ticks while visible, silence while hidden, immediate tick on
  visibility regain, and cleanup on unmount.
- `use-realtime-orders.ts` — `useRealtimeOrders(boothIds, initialOrders, onInsert?)`
  returns `{ orders, status }` (`RealtimeStatus = "connecting" | "connected" |
"disconnected"`). Subscribes to a Supabase Realtime `postgres_changes` channel
  (`vendor-orders`, schema `qkit`, table `orders`, filtered to
  `booth_id=in.(...)`), validates every payload through
  `parseRealtimeOrderEvent` from `@/lib/realtime-orders` before applying it via
  `applyRealtimeOrderEvent`, and calls `onInsert` on new orders. On a genuine
  reconnect (a `SUBSCRIBED` that follows a drop, not the first one) it refetches
  the active-order set with the same columns as the dashboard server query
  (`BOARD_ORDER_COLUMNS` from `@/lib/orders`) and merges by `id`, keeping
  whichever of {local, snapshot} has the newer `updated_at` so a just-placed
  order already reflected locally is never clobbered by a stale snapshot.
  Surfaces `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` as `"disconnected"` rather than
  failing silently.
- `use-realtime-orders.test.tsx` — mocks `@/lib/supabase/client`'s `channel`/
  `from`/`removeChannel` to test: no subscribe with an empty booth list, first
  `SUBSCRIBED` connects without a resync, an `INSERT` payload updates state and
  fires `onInsert`, a reconnect (`CLOSED` → `SUBSCRIBED`) triggers a resync that
  keeps the newer of {local, snapshot} per id, and error statuses flip to
  `"disconnected"`.

## Connectivity

- `use-realtime-orders.ts` imports `createClient` from `@/lib/supabase/client`,
  `parseRealtimeOrderEvent`/`applyRealtimeOrderEvent` from `@/lib/realtime-orders`,
  `BOARD_ORDER_COLUMNS` from `@/lib/orders`, and the `BoardOrder` type from
  `@/lib/types`. It is consumed by the vendor dashboard's realtime order board
  to keep the board in sync without a full page reload.
- `use-polling.ts` and `use-now.ts` have no app-specific dependencies; they are
  consumed by the customer-facing order-status and payment-tracking pages to
  drive periodic status checks and live countdown/elapsed-time display.
- `use-async-action.ts` has no dependencies beyond React; it is consumed by
  dashboard and order-flow components that submit server actions from a button
  (menu editing, order status transitions, checkout) to derive their
  disabled/loading state.

## Parent

[src](../README.md)
