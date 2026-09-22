# hooks

## Purpose

Shared React hooks that factor out client-side stateful patterns (pending-flag
tracking, tab-aware polling, live clocks, Supabase Realtime subscriptions) that
would otherwise be duplicated across the vendor dashboard and the customer
order-status page.

## Contents

- `use-async-action.ts` — `useAsyncAction()` returns `{ pending, error, run, reset }`;
  a thin adapter over `@merqo/ui`'s `useAsyncAction`, which binds one action at
  hook-creation time. The adapter binds that fixed action to "call whatever
  closure you're given" (`(fn) => fn()`), so qkit's call sites keep their original
  per-call-dynamic-closure shape — `run(async () => { … })` per call, not one
  action bound up front — with zero changes needed. `run` still wraps the handler
  in `try/finally` so `pending` always resets even if the handler throws; `error`
  now surfaces the last rejection and `reset()` clears it. Also re-exports
  `navigatingAway()` from `@merqo/ui`, a promise that never resolves, used to
  keep `pending` true through a `router.push`/`router.replace` transition so a
  button doesn't flash re-enabled while the old page is still showing.
- `use-async-action.test.tsx` — RTL tests: pending resets on success, resets on a
  thrown/rejected handler, stays `true` while the handler is in flight, `error`
  stays `null` on success and is set (with `run` still re-throwing) on a
  rejection, and `reset()` clears a stale `error`.
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
- `use-printer-status.ts` — `usePrinterStatus(boothId)` returns a small view
  of this booth's printer as printkit reports it: `loading`, `unreachable`,
  `none` (no printer set up), or `printer` with its name and whether it is
  online. It polls qkit's own `/api/printkit/printer-status` route every 30
  seconds rather than calling printkit directly, because the printkit bearer
  secret must never reach the browser. It replaced a realtime presence
  subscription that only a Bluetooth bridge could ever feed: printkit now
  owns printer health for every kind of printer, including cloud and 4G
  printers that have no bridge at all.
  Its behaviour is covered from the outside, in
  `dashboard/booths/printing-section.dom.test.tsx`, since what matters is
  what a vendor sees on the booth page rather than the hook's own shape.
- `use-money-field.ts` — `useMoneyField(cents, onCommit)` returns
  `{ value, onFocus, onChange, onBlur }` props for a controlled $-amount
  `<Input>`. Reformats to the canonical 2-decimal string only on blur (or on
  an external `cents` change while unfocused, adjusted during render per
  React's own pattern rather than in an effect) instead of on every keystroke
  — reformatting live resets the caret to the end after each key, so typing
  "6.50" left-to-right used to land as "6.01" in `menu-editor.tsx`/
  `option-groups-editor.tsx`'s price/cost inputs (each digit appended past the
  fixed decimal point). Not consumed directly — see `MoneyInput` in
  `src/components/README.md`, which wraps it so the hook is always called at a
  real component's top level even when rendered from inside a `.map()` or a
  render-prop.

## Connectivity

- `use-realtime-orders.ts` imports `createClient` from `@/lib/supabase/client`,
  `parseRealtimeOrderEvent`/`applyRealtimeOrderEvent` from `@/lib/realtime-orders`,
  `BOARD_ORDER_COLUMNS` from `@/lib/orders`, and the `BoardOrder` type from
  `@/lib/types`. It is consumed by the vendor dashboard's realtime order board
  to keep the board in sync without a full page reload.
- `use-polling.ts` and `use-now.ts` have no app-specific dependencies; they are
  consumed by the customer-facing order-status and payment-tracking pages to
  drive periodic status checks and live countdown/elapsed-time display.
- `use-async-action.ts` re-exports (via a thin adapter) `useAsyncAction`/
  `navigatingAway` from `@merqo/ui`; it is consumed by dashboard and order-flow
  components that submit server actions from a button (menu editing, order
  status transitions, checkout) to derive their disabled/loading state.
- `use-printer-status.ts` calls qkit's own `/api/printkit/printer-status` route;
  consumed by `dashboard/booths/printing-section.tsx`.

## Parent

[src](../README.md)
