# plan

## Purpose

Billing/plan page — shows the vendor's current tier, a live countdown for an active event pass, a free/pass/pro feature-comparison table, and upgrade call-to-actions (interest-only; payment is collected out-of-band).

## Contents

- `page.tsx` — `PlanPage()` (server, `revalidate = 0`): resolves `entitlement`/`licenseExpiresAt` via `requireEntitledVendor()`, reads the singleton `pricing` row (`event_pass_cents, monthly_cents, currency`, `id = 1`; falls back to `DEFAULT_PRICING` from `@/lib/pricing`) — unset prices mean pre-Stripe beta, where the pass is a free trial granted on request. Renders a tier badge, `PassCountdown` when on an active pass, a Pro "you're covered" message or two `TicketCard`s (Event pass / Monthly Pro) each with an `UpgradeCta`, and the local `FEATURES` array mapped into `@merqo/ui`'s shared `PlanComparisonTable` (3 tiers: Free/Pass/Pro) for the feature-comparison grid — `FEATURES` itself stays local (qkit's own feature list), only the grid's rendering moved to the shared component (v0.16.0+).
- `page.dom.test.tsx` — renders `PlanPage()` (mocking `requireEntitledVendor` and the pricing-row read) and asserts the migrated `PlanComparisonTable` grid: header columns, full row-label order, and per-row check/dash cell counts — scoped to the grid's own container since the tier badge above it can repeat a column label (e.g. "Free").
- `pass-countdown.tsx` — `PassCountdown({ expiresAt })` client component: live minute-ticking countdown (`useNow(60_000)`) formatted as `Xd Yh left` / `Xh Ym left` / `Xm left`, with the expiry rendered in a fixed SGT string (`sgtWeekdayTime`) to avoid a server/client hydration mismatch from a runtime-timezone `toLocaleString`.
- `upgrade-cta.tsx` — `UpgradeCta({ option, label, variant })` client component: on click, fires `logEvent("upgrade_cta", { option })` (admin funnel analytics) and calls `requestUpgrade(option)` from `@/app/actions/purchase`, toasting success/error — files an in-product upgrade request for the admin to action manually (no email, no live payment collection yet).

## Connectivity

Reachable from `dashboard-nav.tsx`'s account menu ("Plan" item). `page.tsx` reads `@/lib/pricing` and `requireEntitledVendor()` (`@/lib/supabase/get-entitlement`), and renders `pass-countdown.tsx` and `upgrade-cta.tsx`; `upgrade-cta.tsx` calls into `@/app/actions/purchase` and `@/app/actions/events`, which are outside this folder.

## Parent

[dashboard](../README.md)
