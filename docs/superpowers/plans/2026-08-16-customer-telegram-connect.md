# Customer Telegram Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Get notified on Telegram" button on the order-status page's
waiting moment, calling merqo's `customer-connect-token` endpoint; the
`ready` transition in `advanceOrder` fires merqo's `notify-customer`
endpoint. No new qkit table, no new webhook — the connection lives
entirely in `merqo.customers`.

**Spec:** `docs/superpowers/specs/2026-08-16-customer-telegram-connect-design.md`

**Depends on:** merqo's `docs/superpowers/plans/2026-08-16-customer-
telegram-connect.md` shipped and deployed first (both endpoints must
exist and `MERQO_CUSTOMER_SECRET` must be set on both sides before this
plan's Task 3/4 can be tested against a real endpoint — unit tests can
still mock the HTTP layer ahead of that).

## Global Constraints

- The connect button is shown only while
  `!isTerminal(order.status) && order.status !== "ready"` — not on
  `ready`/`completed`/`cancelled`.
- `notify_ref` is always `` `qkit:${order.id}` `` — no other shape.
- A failed/timed-out call to either merqo endpoint must never break the
  order-status page render, and must never change `advanceOrder`'s own
  returned result — same rule as every other Telegram integration point
  in this ecosystem.
- The on-page disclosure text is a one-line preview only — it must not
  restate or diverge from merqo's own consent copy (that's the actual
  disclosure the customer accepts).
- TypeScript strict, no `any`.
- Work on a feature branch, never commit directly to `main`.
- Run `pnpm check && pnpm test && pnpm build` before opening the PR.

---

### Task 0: Branch setup

```bash
git fetch origin main
git checkout -b feat/customer-telegram-connect origin/main
```

Confirm `pnpm test` passes on baseline first.

---

### Task 1: `src/lib/merqo-customer-notify.ts`

**Files:** `src/lib/merqo-customer-notify.ts`,
`src/lib/merqo-customer-notify.test.ts`

- [ ] Failing tests first: `mintCustomerConnectToken` posts
      `{ vendor_id, kit_slug: "qkit", notify_ref }` with the
      `MERQO_CUSTOMER_SECRET` bearer header to
      `${MERQO_BASE_URL}/api/merqo/customer-connect-token`, returns the
      parsed `{ token, deep_link }` on 2xx, returns `null` on non-2xx,
      timeout, or network error; `notifyCustomer` posts
      `{ vendor_id, notify_ref, message }` and never throws on failure
      (catches + logs).
- [ ] Implement per the spec.
- [ ] Commit: `feat: add merqo customer-notify HTTP client helpers`.

### Task 2: `TelegramConnect` component

**Files:**
`src/app/order/[boothId]/[orderNumber]/telegram-connect.tsx`,
matching test file (same convention as `earn-link.test.tsx` if one
exists, else a new `.dom.test.tsx`)

- [ ] Failing tests first: renders the link + one-line disclosure on a
      successful token mint; renders nothing (`null`) when
      `mintCustomerConnectToken` returns `null`.
- [ ] Implement as a server component, same shape as `earn-link.tsx`:
      calls `mintCustomerConnectToken`, renders the deep-link `<a>` +
      disclosure preview, or `null`.
- [ ] Commit: `feat: add TelegramConnect order-status component`.

### Task 3: Wire into the order-status page

**Files:** `src/app/order/[boothId]/[orderNumber]/page.tsx`, extend that
page's existing test coverage

- [ ] Failing tests first: `TelegramConnect` renders while `status` is
      `pending`/`confirmed`/`preparing`; does not render once
      `ready`/`completed`/`cancelled`.
- [ ] Implement: add the component after `OrderStatusPoller`, before the
      social-links block, gated on the not-yet-ready condition and
      `booth?.vendor_id`.
- [ ] Commit: `feat: show Telegram connect button while an order is waiting`.

### Task 4: Wire the notification into `advanceOrder`

**Files:** `src/app/dashboard/order-actions.ts`,
`src/app/dashboard/order-actions.test.ts` (extend)

- [ ] Failing tests first: `advanceOrder` transitioning an order to
      `ready` calls `notifyCustomer` with
      `{ vendor_id: userId, notify_ref: \`qkit:${orderId}\`, message }`;
a `notifyCustomer`rejection doesn't change`advanceOrder`'s own
success result; advancing to any status other than `ready` doesn't
      call it at all.
- [ ] Implement: after the successful `ready`-transition branch, fire
      (wrapped in try/catch, logged, not awaited into the response)
      `notifyCustomer`.
- [ ] Commit: `feat: notify customer on Telegram when their order is ready`.

### Task 5: `.env.example` + docs

**Files:** `.env.example`, `AGENTS.md`, `src/lib/README.md`,
`src/app/order/[boothId]/[orderNumber]/README.md` (if one exists),
`CHANGELOG.md`

- [ ] Add `MERQO_BASE_URL` and `MERQO_CUSTOMER_SECRET` to `.env.example`
      with a one-line comment (must match the value merqo's own env
      records for this kit).
- [ ] Update `AGENTS.md`'s data model / file layout sections to document
      the new component + lib module and the kit → merqo call direction
      (name it as the new pattern it is, matching merqo's own spec's
      framing — don't let it read as pre-existing).
- [ ] Add a `CHANGELOG.md` entry.

### Task 6: Verification gate

- [ ] `pnpm check && pnpm test && pnpm build`.
- [ ] Push, PR, poll CI green, squash-merge.

## Self-Review Notes

- Spec coverage: HTTP client helpers (Task 1), connect component
  (Task 2), page wiring (Task 3), `advanceOrder` wiring (Task 4),
  docs/env (Task 5), verification (Task 6).
- No task lets a merqo-side failure affect order-status rendering or
  `advanceOrder`'s result — Tasks 2–4's tests explicitly prove this, not
  just claim it.
- This plan assumes merqo's endpoints exist for its own E2E verification
  (Task 6's `pnpm build`/live check); unit tests in Tasks 1–4 mock the
  HTTP layer and don't require it, so this plan CAN start before merqo's
  ships, but shouldn't merge/deploy live-tested until it has.
