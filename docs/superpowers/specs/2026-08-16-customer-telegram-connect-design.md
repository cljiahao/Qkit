# Customer Telegram Connect — Design

**Date:** 2026-08-16
**Status:** Approved; plan to follow.

## Summary

qkit's half of `Merqo Business/docs/business/2026-08-16-telegram-
integration-design.md`'s Phase B+D. **Read that doc's "Phase B + D"
section first** — the consent model, the third Merqo-owned bot, and the
new `merqo.customers` shape are decided there, not re-derived here. This
spec covers only qkit's two touch points: the order-status page's
"Get notified on Telegram" button, and `advanceOrder`'s `ready` transition
firing the notification.

Depends on merqo's own spec
(`../../../merqo/docs/superpowers/specs/2026-08-16-customer-telegram-connect-design.md`)
shipping first — both new endpoints
(`/api/merqo/customer-connect-token`, `/api/merqo/notify-customer`) must
exist before this can call them.

## Guiding decisions

- **No new qkit table, no new qkit webhook.** Unlike Phase A (vendor
  alerts, qkit's own bot), this is customer identity — it lives in
  `merqo.customers`, owned by merqo. qkit only ever calls merqo's two
  HTTP endpoints; it never touches Telegram's API directly for this
  feature.
- **Button shown only while the order isn't yet `ready`** — same
  "waiting moment" reasoning as `EarnLink`'s placement, but `EarnLink`
  shows on `completed` (a different moment — "come back," not "hang
  on"). Once an order reaches `ready`/`completed`/`cancelled`, the
  connect button no longer makes sense (nothing left to notify about, or
  the moment already passed) — condition is
  `!isTerminal(order.status) && order.status !== "ready"`.
- **`notify_ref` is `` `qkit:${order.id}` ``** — matches the master doc's
  own example. Minted fresh per order; no reuse across orders (an old
  order's stale ref must never trigger a notification for a new one).
- **Fire-and-forget from `advanceOrder`**, same rule as every other
  Telegram integration point in this ecosystem (Phase A's
  `notifyVendorTelegram`): a failed/no-op `notify-customer` call must
  never fail the `ready` transition itself. The order board stays the
  source of truth.
- **No persisted "connected" state in qkit.** Unlike Phase A's vendor
  flow (`vendor_telegram`, a standing link qkit itself renders
  "Connected"/"disconnect" for), a customer's connection lives entirely
  in merqo and is single-order-scoped here — qkit has nothing to persist
  and no disconnect UI to build. The button either renders (order not
  yet ready) or it doesn't.

## What changes

### `src/app/order/[boothId]/[orderNumber]/telegram-connect.tsx` (new)

Server component, same shape as `earn-link.tsx`: takes `orderId`,
`vendorId`, calls merqo's `POST /api/merqo/customer-connect-token` with
`{ vendor_id: vendorId, kit_slug: "qkit", notify_ref: \`qkit:${orderId}\` }`(bearer-secret`MERQO_CUSTOMER_SECRET`, `AbortSignal.timeout(3000)`, same
fail-closed-on-any-error philosophy as `fetchEarnConfig` — a merqo outage
must never break the order-status page). On success, renders the
consent-aware connect button:

```tsx
<a href={deep_link} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
  Get notified on Telegram when it's ready →
</a>
<p className="mt-1 text-xs text-muted-foreground">
  Connects you to Merqo on Telegram — we'll message you here about your
  order, and about any Merqo kit you use going forward (never marketing,
  see merqo's disclosure page). You can block the bot any time.
</p>
```

The one-line disclosure summary here is intentionally short — the full
disclosure text lives in exactly one place (merqo's own connect/consent
flow, per the master doc's "consent copy lives in exactly one place"
rule); this is a preview, not a duplicate.

On any fetch failure or non-2xx, renders `null` — same degrade-to-nothing
rule as `EarnLink`.

### `src/app/order/[boothId]/[orderNumber]/page.tsx`

Add the connect component in the same slot reasoning as `EarnLink`
(pulled up next to the status block, not buried below items), gated on
the not-yet-ready condition:

```tsx
{
  !isTerminal(order.status) && order.status !== "ready" && booth?.vendor_id && (
    <TelegramConnect orderId={order.id} vendorId={booth.vendor_id} />
  );
}
```

Placed directly after `OrderStatusPoller`, before the social-links block
— the customer is actively waiting at this point in the page, which is
the moment this button is for.

### `src/app/dashboard/order-actions.ts`

`advanceOrder`: after a successful transition where `adv.next === "ready"`,
fire (not awaited into the response — same pattern as `notifyVendorTelegram`
in `src/app/o/[code]/actions.ts`) a call to merqo's
`POST /api/merqo/notify-customer` with
`{ vendor_id: userId, notify_ref: \`qkit:${orderId}\`, message: "Your order is ready for pickup!" }`.
Wrapped in try/catch, logged on failure, never changes `advanceOrder`'s
own return value. `loadOwnOrder`'s destructure already exposes `userId`(used today by`confirmOrderPayment`) — no new query needed.

### `src/lib/merqo-customer-notify.ts` (new)

Small shared module, same shape as `src/lib/telegram.ts` but calling
merqo's HTTP API rather than Telegram's directly:

```ts
export async function mintCustomerConnectToken(
  vendorId: string,
  kitSlug: string,
  notifyRef: string,
): Promise<{ token: string; deep_link: string } | null> { ... }

export async function notifyCustomer(
  vendorId: string,
  notifyRef: string,
  message: string,
): Promise<void> { ... } // fire-and-forget, catches+logs, never throws
```

Both read `process.env.MERQO_BASE_URL` and
`process.env.MERQO_CUSTOMER_SECRET` — new env vars, added to
`.env.example`.

## Testing

- `src/lib/merqo-customer-notify.test.ts`: `mintCustomerConnectToken`
  posts the right body/headers, returns `null` on non-2xx/timeout/network
  error; `notifyCustomer` posts correctly and never throws on failure.
- `src/app/order/[boothId]/[orderNumber]/telegram-connect.test.tsx` (or
  `.dom.test.tsx`): renders the link+disclosure on a successful token
  mint; renders nothing on a failed mint.
- `order-status page` test (extend existing): the connect component
  renders while `status` is `pending`/`confirmed`/`preparing`; does not
  render once `ready`/`completed`/`cancelled`.
- `order-actions.test.ts` (extend): `advanceOrder` to `ready` calls
  `notifyCustomer` with the right `notify_ref`; a `notifyCustomer` failure
  doesn't change `advanceOrder`'s success result; advancing to any status
  other than `ready` doesn't call it at all.

## Self-review

- No placeholders — every file has real, complete logic once written.
- Scope: qkit's two touch points only. No new qkit table, no new webhook,
  no persisted connection state — all of that lives in merqo, per the
  master doc's architecture.
- The single-line on-page disclosure doesn't restate or diverge from
  merqo's own consent copy — it previews, merqo's flow is the actual
  disclosure the customer accepts.

## Parent

[specs](README.md)
