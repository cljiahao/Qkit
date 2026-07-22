# e2e

## Purpose

Playwright end-to-end smoke tests, run against a real local Supabase (not mocked) — covers what the mocked unit/component tests can't (RLS, the `proxy.ts` auth guard, the full order lifecycle including payment).

## Contents

- `auth-guard.spec.ts` — exercises `src/proxy.ts` → `updateSession`: an anonymous visitor hitting `/dashboard` or `/onboarding` must be redirected to `/login`. Needs only a booting app, no seed data.
- `customer-order.spec.ts` — the full customer lifecycle against the seeded "Kopitiam Cart" booth (`c0ffee01-0000-4000-8000-000000000001`, entered via short code `e2eKopitiam01`): open the booth, customize a drink, place an order under a name, land on the live order-status page (`/order/<booth>/<orderNumber>?t=<token>`), see the "Scan with your PayNow banking app to pay" panel (the seeded booth has a payment method), and confirm "I've paid" flips the order to the "payment sent" state. Requires `supabase/seed/coffee-cart.sql`.
- `order-code.spec.ts` — short-code order entry: a valid code (`e2eKopitiam01`) renders the booth's order page ("Kopitiam Cart", a visible "Customize" button); a bogus code hard-blocks with an "this code expired" message. Also requires the coffee-cart seed.

## Connectivity

Run via `pnpm test:e2e` (auto-starts `pnpm dev`); `auth-guard.spec.ts` needs only a booting app, `customer-order.spec.ts` and `order-code.spec.ts` need the coffee-cart seed applied first (Docker + `supabase start` + migrations + `supabase/seed/coffee-cart.sql`). Both order specs hardcode the same `e2eKopitiam01` short code and booth id — no shared fixtures module exists yet for `e2e/`, so keep them in sync with the seed file if either changes.

## Parent

[qkit](../README.md)
