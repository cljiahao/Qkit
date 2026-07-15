# Monetization: free-tier gating, sold-out caps, and per-event licensing — design

Date: 2026-06-18
Status: approved-for-planning

## Context

qkit has an entitlement foundation (migration 0003): `vendors.plan` (`free`/`pro`),
`PLAN_LIMITS` in `src/lib/plan.ts`, a 1-booth-on-free gate (RLS + app), and
stats-range gating. Pro is flipped manually via the admin toggle. There is **no
billing** and there are no real vendors yet — the goal of this work is to make the
free/Pro line sharp enough to **test whether the Pro features are a real moat**,
and to stand up a **per-event pricing option** that fits the target market.

Two hard constraints shape the approach:

1. **No Stripe yet.** Stripe in Singapore requires an ACRA business
   registration (UEN), which we will not apply for just to run a validation test.
   Money is therefore collected **out-of-band (PayNow / cash)** and access is
   fulfilled by an **admin-minted, time-boxed license**. This tests real
   willingness-to-pay without any payment integration.
2. **Market fit.** Target vendors run ~1–2 events/week or biweekly. A monthly
   subscription does not fit the occasional operator, so a **per-event pass** is
   offered alongside it.

## Pricing structure (plan-of-record)

Three rungs, segmented by **behaviour, not by crippling features** (the named
freemium anti-pattern is forcing one model on every segment / stripping features):

| Rung                            | For                                         | Unlocks                                                                                      |
| ------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Free**                        | no-risk entry, tiny booths                  | 1 booth, 6 menu items, 3 option groups/item, manual open/close, 24h stats, unlimited orders  |
| **Per-event pass** (time-boxed) | occasional / biweekly vendors, first-timers | **all operational Pro features** for the window + **that event's own (24h) stats**           |
| **Monthly subscription**        | regular organisers (≈3+ events/mo)          | all operational Pro features **+ longitudinal stats** (7/30/90d trends, cross-event history) |

Rationale for the stats split: longitudinal stats are _naturally_ a recurring-use
value. A one-off buyer wants "how did today go?" (24h) but gets little from a
90-day trend — so trends accrue to subscribers **without** the pass being
feature-gimped operationally. An event vendor needs auto-close and sold-out caps
_most_, so the pass must include them.

Breakeven guidance: with pass ≈ 1/3 of monthly, ~3 events/month is the crossover —
biweekly vendors land on the pass, weekly+ on subscription. **Absolute prices are
not fixed in code**: they live in an admin-editable `pricing` row so they can be
tuned during the test. Magnitudes should be sanity-checked against real
willingness-to-pay with pilot vendors (the original $29/12h + $99/mo reads
B2B-SaaS-high for a micro food-booth market; durations of 24–48h fit day/weekend
markets better than 12h).

Research basis: freemium consensus targets **20–40% of users fully satisfied on
free** (>50% too generous, <10% too restrictive); contextual upgrade prompts at
the gate convert **3–5× better** than generic banners; day-pass-alongside-
subscription is the textbook fit for event/seasonal/low-frequency segments
(precedents: Gemini $2.99/24h, Freshservice 24h agent pass).

---

# Part A — free-tier gates + sold-out caps (the things worth buying)

## A1. Entitlement limits

Centralise all limits as a single source of truth. Replace the current
plan-keyed `PLAN_LIMITS` with an **entitlement object** derived by the resolver in
Part B. The object:

```
Entitlement = {
  tier: "free" | "pass" | "pro",
  maxBooths: number,              // free 1, pass/pro Infinity
  maxMenuItems: number,           // free 6, pass/pro Infinity
  maxOptionGroupsPerItem: number, // free 3, pass/pro Infinity
  autoCloseHours: boolean,        // free false, pass/pro true
  stockCaps: boolean,             // free false, pass/pro true
  statsRanges: readonly string[], // free ["24h"], pass ["24h"], pro ["24h","7d","30d","90d"]
}
```

Pure helpers (`canAddMenuItem`, `optionGroupCapReached`, `canUseAutoClose`,
`canUseStockCaps`, …) read from the entitlement and are unit-tested, mirroring the
existing `canAddBooth` pattern. Existing call sites that pass a bare `Plan` migrate
to the entitlement.

## A2. Enforcement model (and an honest caveat)

Booth content (menu items, option groups, hours, stock) lives in the `booths`
JSONB, saved via the booth-save server action under the vendor's own session.

- **Item-count / option-group / hours caps** are enforced in the **booth-save
  server action** via a plan-aware Zod refinement, plus UI affordances (disabled
  "Add item" past the cap, etc.). This matches the existing app-layer stats
  gating.
- **Caveat (documented, not hidden):** a free vendor could bypass these via a raw
  client write to _their own_ booth. This is **quota evasion, not a security
  hole** — no access to other vendors' data, no privilege escalation. The rigorous
  fix is a DB trigger validating JSONB content against the vendor's plan; it is
  **out of scope** for the validation test (YAGNI). Document it as future
  hardening.
- **Sold-out enforcement is server-side at `placeOrder`** (it affects customers,
  so it is real and not vendor-bypassable). This is the one that matters.

## A3. Sold-out / stock caps (net-new subsystem)

No inventory concept exists today; `MenuItem.available` is a manual on/off toggle.

- **Data:** add optional `stock?: number | null` to `MenuItem` (JSONB).
  `null`/absent = unlimited → every existing item is unchanged. Added to
  `MenuItem` type, `menuItemSchema`, `menuItemFormSchema`.
- **Soft cap, live-order-aware:**
  `remaining = stock − Σ quantity of this item across **non-cancelled** orders for
the booth`. A cancelled (or amended-down) order automatically returns its stock —
  no manual restock. No JSONB decrement → no write race.
- **Count without leaking orders:** orders are not publicly readable (RLS). Add a
  `SECURITY DEFINER` SQL function `booth_remaining_stock(p_booth_id uuid)` →
  returns `{ menuItemId: remaining }` only (**no customer PII**). `search_path`
  pinned to `public`. Callable by the anon customer page and reused in
  `placeOrder`.
- **Customer order page:** show "N left" and a greyed, non-orderable "Sold out"
  state per item; cart caps quantity at `remaining`.
- **`placeOrder`:** after the existing open/closed check, re-fetch remaining
  server-side and reject any line exceeding it ("Sorry — just sold out"). A
  TOCTOU oversell-by-1 is possible under simultaneous taps; **accepted** per the
  soft-cap decision, and self-heals when an order is cancelled.
- **Dashboard menu editor:** a Pro-only "Limit stock" number field per item, with
  the contextual upgrade prompt (A4) for free vendors.

## A4. Contextual upgrade prompts (the 3–5× lever)

Each gate gets its **own** inline Pro nudge naming the specific feature — not a
generic banner: "Add a 7th item — Pro", "Schedule auto-close — Pro", "Limit stock
so orders stop when you sell out — Pro". Each routes through the existing
`logEvent('upgrade_cta', { feature })` so the admin funnel shows **which gate**
drives demand — the core moat signal.

---

# Part B — entitlement & licensing (how you sell + fulfil, Stripe-less)

## B1. `licenses` table (migration)

```
licenses(
  id          uuid pk default gen_random_uuid(),
  vendor_id   uuid not null references vendors(id) on delete cascade,
  expires_at  timestamptz not null,
  source      text not null default 'admin_manual',  -- 'stripe' later
  note        text,                                   -- PayNow ref / "cash 2026-06-20"
  created_at  timestamptz not null default now()
)
```

- **No `event_id`** — the pass is an **account-wide time window**, not tied to a
  modelled event (qkit has no real-world "event" entity; the `events` table is the
  analytics CTA log).
- **Status is computed, not stored:** "active" ⇔ `expires_at > now()`. This avoids
  the original prompt's bug where a stored `status` never flips to expired.
- **RLS:** vendor `SELECT` own rows (`vendor_id = auth.uid()`); **no client
  write** — only the service-role admin action inserts. Index on
  `(vendor_id, expires_at)`.

## B2. Entitlement resolver

`getEntitlement(vendor, activeLicense, now): Entitlement` in `plan.ts`, pure +
unit-tested:

- `vendors.plan = 'pro'` (permanent / subscription / comp) → `tier:"pro"`, full
  stats ranges.
- else a live license (`expires_at > now`) → `tier:"pass"`, operational features
  on, `statsRanges: ["24h"]`.
- else → `tier:"free"`.
- Permanent-pro and an active pass may coexist → the resolver returns the
  **stronger** entitlement (pro).

Every Part A gate consumes this, so "is Pro?" transparently includes an active
pass. Server components fetch the vendor's single most-recent live license
alongside the vendor row.

## B3. Admin mint UI + action

On `/admin`, per vendor: a **"Grant pass"** control → choose duration
(**24h / 48h / 72h presets + custom**, covering multi-day markets) + a free-text
payment note → a **service-role server action** inserts a `licenses` row
(`expires_at = now() + duration`) and writes an `admin_audit` entry. The existing
permanent free⇄pro toggle stays for subscriptions/comps.

## B4. Admin-editable pricing

Single-row **`pricing` table**:

```
pricing(
  id            int pk default 1 check (id = 1),
  event_pass_cents int not null,
  monthly_cents    int not null,
  currency      text not null default 'SGD',
  updated_at    timestamptz not null default now()
)
```

- **RLS:** public `SELECT` (prices aren't secret); **service-role-only write**.
- Admin page gets a small **Pricing form** → service-role action updates the row,
  audited.
- Lets prices be tuned during the test without a deploy. Mint-time durations remain
  code presets (not config — YAGNI).

## B5. Vendor offer page (`/dashboard/plan`)

- Shows the **3 rungs** with live prices from `pricing`.
- **No Stripe checkout.** Instead: **"Pay via PayNow → we activate your pass"**
  with the payment instruction, and a CTA that logs
  `logEvent('upgrade_cta', { option: 'event' | 'monthly' })` so the admin funnel
  shows which rung vendors want.
- An **active pass shows a countdown** ("Pro until Sat 9pm · 41h left").
- On expiry, features degrade gracefully back to free — no data loss, limits
  simply reapply; unlimited customer ordering always remains free.

## B6. Stripe-later seam

When ACRA/UEN is sorted, Stripe slots in with **no rework**: a verified webhook
(idempotent on `event.id`, signature-checked, service-role) either inserts a
`licenses` row (`source:'stripe'`, one-time pass) or sets `vendors.plan='pro'` +
subscription columns (subscription). The resolver already unifies both. Subscription
columns on `vendors` and the webhook are **out of scope here**.

---

## Data model summary / migration

One migration (`0010_monetization.sql`):

- `licenses` table + RLS + index.
- `pricing` table + RLS + a seed row.
- `booth_remaining_stock(p_booth_id uuid)` SECURITY DEFINER function.
- (No column for `stock` — it lives inside the existing `menu_items` JSONB.)

`src/lib/types.ts` updated for `licenses`, `pricing`, `MenuItem.stock`, and the
new function signature.

## Testing

- **Pure/unit:** `getEntitlement` (all tiers, coexistence, expiry boundary);
  stock-remaining math (cancelled excluded, amend-down returns stock, multi-line);
  cap helpers (`canAddMenuItem`, `optionGroupCapReached`, …).
- **Component (RTL+jsdom):** gated affordances render the right contextual prompt;
  "Sold out" / "N left" states; countdown.
- **Server action:** `placeOrder` rejects over-stock lines; booth-save refuses
  over-cap content for free.
- Advisory Stryker over the new `src/lib` logic.

## Out of scope / deferred

- Stripe integration (checkout, webhook, subscription columns) — pending ACRA/UEN.
- DB-trigger hardening of JSONB content caps (app-layer + UI is enough for the
  test).
- Real-time "N left" updates (page-load + on-submit recompute is enough).
- Event-scoped (per-`event_id`) licenses; longitudinal stats inside a pass.
- Multi-currency.

## Assumed defaults (flag if wrong)

- Free = 1 booth / 6 items / 3 option groups per item.
- Pass durations: 24/48/72h presets + custom; account-wide window.
- Pass grants operational features + 24h stats; longitudinal stats need
  subscription/permanent-pro.
- Prices are display + out-of-band only (admin-mint does not enforce payment).
- Currency fixed to SGD.
