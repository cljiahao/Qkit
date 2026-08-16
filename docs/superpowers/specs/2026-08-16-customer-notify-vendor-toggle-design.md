# Customer Notify Vendor Toggle — Design

**Date:** 2026-08-16
**Status:** Approved; plan to follow. Fast-follow on top of
`2026-08-16-customer-telegram-connect-design.md` — do not start until
that one has merged (it introduces the `notifyCustomer` call this spec
gates).

## Summary

`advanceOrder`'s `ready`-transition Telegram notification (shipped by the
customer-telegram-connect work) currently fires unconditionally for
every order whenever a customer connection exists. Adds a vendor-level
on/off toggle — a vendor may not want reward/order pings going out under
their brand, even though the _customer's_ consent (given once via
merqo's own connect flow) already covers the message itself. This is a
brand-preference control, not a consent gate — the customer already
consented; this only controls whether a given vendor chooses to use the
channel.

**Default: on (opt-out), not opt-in.** The customer already asked for
this by connecting; a default-off toggle would silently swallow a
feature the customer signed up for. Opt-out catches the rare vendor who
finds it off-brand, without breaking the common case.

## Guiding decisions

- **Reuse `board_settings`, don't add a table.** qkit already has a
  vendor-scoped JSONB settings column (`vendors.board_settings`,
  validated by `boardSettingsSchema` in `src/lib/schemas.ts`) holding
  `ready_auto_clear_min` and `daily_order_number_reset` — this is the
  same shape of "a small vendor preference," so it gets a new optional
  key there rather than a new migration/table.
- **Default `true` when the key is absent** — every vendor who already
  has a `board_settings` row (i.e. everyone, since the column predates
  this feature) must not have notifications silently switch off the
  moment this ships. Zod's `.default(true)` on the new key, not a
  required field.
- **Gate placed in `advanceOrder`, not in the notify helper.** The
  helper (`notifyCustomer` in `merqo-customer-notify.ts`) stays a dumb
  HTTP client; `advanceOrder` already reads the vendor row for other
  reasons in nearby code (`sweepReadyOrders` does), so the toggle read
  belongs at the call site that decides whether to fire at all.

## What changes

### `src/lib/schemas.ts`

`boardSettingsSchema` gets one new optional key:

```ts
customer_telegram_notify_enabled: z.boolean().default(true),
```

### `src/app/dashboard/order-actions.ts`

`advanceOrder`: before firing `notifyCustomer` on a `ready` transition,
read the vendor's `board_settings` (already fetched as part of
`loadOwnOrder`'s vendor context — if not, one extra scoped read, same
pattern as `sweepReadyOrders`'s own settings read), parse with
`boardSettingsSchema`, skip the `notifyCustomer` call entirely if
`customer_telegram_notify_enabled === false`.

### `src/app/dashboard/settings/settings-form.tsx` (or wherever

`ready_auto_clear_min`'s own toggle/input currently lives — verify the
exact file before editing)

Add a switch next to "Auto-clear after," labeled something like "Notify
customers on Telegram when their order is ready," bound to the new
`board_settings` key, default checked.

## Testing

- `schemas.test.ts`: `customer_telegram_notify_enabled` defaults to
  `true` when absent from stored JSON (backward compat for every
  pre-existing vendor row); parses `false` when explicitly set.
- `order-actions.test.ts` (extend): a vendor with the flag `false` (or
  no `board_settings` at all, still defaults true) — assert `false`
  suppresses `notifyCustomer`, default/absent/`true` still calls it.
- Settings form test: toggle renders, defaults checked, saves the flag.

## Self-review

- No placeholders.
- Doesn't touch merqo's or the consent model at all — this is purely a
  vendor-side "do I use this channel" switch layered on top of an
  already-consented customer.
- Backward-compat explicitly tested (default-true for every existing
  vendor row), not just asserted in prose.

## Parent

[specs](README.md)
