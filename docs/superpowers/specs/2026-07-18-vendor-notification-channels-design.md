# Vendor Notification Channels (Telegram/WhatsApp pickup pings) — Design

**Date:** 2026-07-18
**Status:** Draft — pending founder review (open questions below)
**Depends on:** none structurally. Not a shared cross-kit service — same
reasoning already applied to menukit/apikit this session: only qkit needs
this today, no second kit (shopkit) exists yet to justify extracting a
shared notification service. Build it here first.

## Problem

The customer order-status page (`src/app/order/[boothId]/[orderNumber]/page.tsx`)
is poll-only by design (`order-status-poller.tsx` — Supabase realtime is
unreliable on customer devices, so the page polls every interval instead).
That only works while the customer keeps the tab open. Once they lock
their phone or switch apps, they stop finding out when the order flips to
`ready` until they reopen the tab. Telegram/WhatsApp reach the customer
regardless of screen state, but require the customer to message the
bot/business first (both platforms block a business from messaging cold —
spam prevention, not a qkit limitation).

## Confirmed from code

- **Trigger point:** `advanceOrder` (`src/app/dashboard/order-actions.ts:39-72`)
  is where a vendor's "Mark Ready" tap transitions `preparing → ready`,
  server-side, after the RLS-scoped optimistic-concurrency UPDATE succeeds.
  This is the one and only place a "ready" notification should fire from —
  not the customer-side poller (which the customer may not have open),
  not a new poll of its own.
- **Existing per-booth config pattern to mirror:** `PaymentConfig`
  (`src/lib/types.ts`, edited via `payment-section.tsx`) is a
  discriminated union stored on `booths.payment` (JSONB), with a
  `RadioGroup` of kinds and one config sub-form per kind. This is the
  right shape to copy for a new `booths.notifications` JSONB column.
- **Existing cross-kit opt-in-link pattern to mirror (structurally, not
  literally — this is same-kit, no cross-kit HTTP call needed):**
  `earn-link.tsx` — conditionally renders a link on the order-status page
  based on a vendor's config, fails closed (renders nothing) on any
  error. A "Get notified on Telegram/WhatsApp instead" link/button on
  `page.tsx` follows the same shape, just reading `booth.notifications`
  directly instead of fetching a cross-kit API.
- **Existing vendor-wide entitlement gate to mirror:**
  `src/lib/plan.ts` — `Entitlement`/`Tier`, resolved from `vendors.plan`
  (currently a manual `'free'|'pro'` column, no real billing). The
  WhatsApp paid-gate should be a boolean in this same shape, not a new
  ad-hoc flag, so swapping "admin manually flips it" for "a real Stripe
  webhook flips it" later (founder is actively pursuing ACRA registration
  specifically to attach Stripe billing) is changing what sets the
  column, not the gating code that reads it.

## Decisions

1. **Config lives on the booth (`booths.notifications` JSONB), the paid
   gate lives on the vendor (`vendors` table/entitlement), matching this
   codebase's existing split** — `PaymentConfig` is booth-scoped (a
   vendor's booths can differ), `Entitlement`/`plan` is vendor-scoped
   (billing is a vendor relationship, not a per-booth one). A vendor with
   multiple booths configures Telegram/WhatsApp per booth, but the
   WhatsApp _add-on_ is purchased once per vendor account, same as `plan`
   is today.
2. **Telegram: one Merqo-operated shared bot by default, optional
   per-booth BYO bot token under an "Advanced" collapsed section** — free
   either way (Telegram Bot API has no per-message cost), so no
   entitlement gate needed on Telegram itself.
3. **WhatsApp: gated behind a boolean entitlement flag** (proposed name:
   `whatsapp_addon: boolean` alongside `plan` on `vendors`, resolved into
   `Entitlement` the same way `tier` is) **— manually flipped by an admin
   today, same pattern as the existing `plan` column**, explicitly
   designed so a future Stripe subscription webhook can flip the same
   column without any change to the code that reads it.
4. **Opt-in flow for both channels**: a deep link on the order-status page
   (`t.me/<bot>?start=<order_id>` for Telegram, `wa.me/<number>?text=<order_id>`
   for WhatsApp) the customer taps once to message the bot/business —
   satisfies both platforms' anti-spam rule — after which the backend can
   send the "ready" message when `advanceOrder` fires.

## Open questions — need your call

1. **How does the opt-in message get correlated back to the order?**
   Telegram's `?start=<payload>` deep-link parameter arrives with the
   bot's first inbound webhook call, giving a clean order-id correlation
   for free. WhatsApp's `wa.me/?text=` pre-fills a message body but
   doesn't guarantee the customer doesn't edit it before sending — needs
   either parsing the order ref out of the received text (fragile if
   edited) or a shorter/more robust encoding. Worth deciding before
   building the WhatsApp half specifically.
2. **WhatsApp template message content** — Meta requires pre-approval for
   any message sent outside the 24h post-customer-contact window. The
   opt-in message itself (within 24h of the customer's first message) is
   free-form and fine; but if `advanceOrder` fires _after_ that window
   (a slow-moving order), the "ready" message would need an approved
   template instead. Given qkit orders are same-day/short-lived, this may
   never actually trigger — worth confirming that assumption rather than
   building template-approval handling for a case that may not occur.
3. **Which BSP for WhatsApp** — not decided anywhere yet (this session's
   research only got as far as recommending HitPay for _payments_; WhatsApp
   Business API access is a separate product from most BSPs, not
   necessarily the same vendor). Needs its own small research pass before
   implementation, not guessed here.
4. **Does the shared Merqo Telegram bot's token belong in env vars
   (like `MERQO_METRICS_SECRET`) or somewhere else?** Recommend env var,
   same pattern as the existing cross-kit shared secret — no new secrets
   infrastructure needed for the default-bot case. BYO bot tokens (a
   vendor's own) are per-booth data, not a shared secret, so those belong
   in the `booths.notifications` JSONB alongside the rest of that
   booth's config (not encrypted at rest today, same as `payment_config`
   already storing UENs/mobile numbers in plain JSONB — consistent with
   existing practice, flagging only so it isn't assumed to need new
   encryption infra it doesn't have today).

## Non-goals (v1)

- Marketing/broadcast messaging — that's loopkit's separate, already-
  planned WhatsApp campaign feature, not this.
- Multi-language message templates — out of scope until it's asked for.
- BYO WhatsApp Business API for vendors — technically supportable by the
  same schema, but realistically no small vendor will have gone through
  Meta's business verification themselves; don't build UI for a case
  that won't occur in practice yet.
- Automatic Stripe-driven `whatsapp_addon` flipping — the column is
  _designed_ for it (Decision 3) but wiring the actual webhook is separate
  work, gated on the ACRA/Stripe integration landing first.
