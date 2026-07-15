# plans

## Purpose

Step-by-step implementation plans, one per feature, each derived from the matching design spec in `../specs/`. These are historical build records (task breakdowns, file maps, self-review notes) — kept as project history, not living docs.

## Contents

- `2026-06-05-qkit-core.md` — "qkit Core Implementation Plan": the original MVP build — shadcn install, DB schema + RLS, Supabase clients/middleware, auth pages, order-status badge/card components, the realtime orders hook, the vendor dashboard, and the customer ordering + order-status pages.
- `2026-06-08-google-auth.md` — "Google-primary Auth Implementation Plan": adds Google OAuth as the primary sign-in method with email/password fallback and the `/auth/callback` handler.
- `2026-06-09-booth-menu-management.md` — "Booth & Menu Management Implementation Plan": lets vendors edit their booth name and menu items, including optional per-item pricing.
- `2026-06-09-drink-customization.md` — "Drink Customization Implementation Plan": seed-only customization (e.g. milk choice) via a bottom-sheet picker, plus cart keying so different option selections are distinct line items.
- `2026-06-09-menu-photos-mobile-coffee-seed.md` — "Per-item Photos, Mobile, Coffee-Cart Seed — Implementation Plan": per-item menu photos, mobile layout polish, and the "Kopitiam Cart" coffee-cart seed data.
- `2026-06-24-service-speed-stats.md` — "Service-speed stats Implementation Plan": adds time-to-ready service-speed metrics to the vendor stats page.
- `2026-06-28-payments-seam.md` — "qkit Payments Seam Implementation Plan": the PayNow payment connector interface, booth payment-method field, and the customer "I've paid" claim flow.
- `2026-07-01-booth-qr-token.md` — "Rotatable Booth QR Token — Implementation Plan": booth QR/order links carry a rotatable token instead of a bare booth id, so a leaked or reprinted poster can be invalidated.
- `2026-07-01-order-path-hardening.md` — "Order Path Hardening — Implementation Plan (Phase A)": moves order-path invariants into DB-enforced constraints and adds short order-entry codes, closing the anon-role PostgREST bypass the 2026-07-01 audit found.
- `2026-07-06-hero-ticket-carousel.md` — "Hero Ticket Carousel + Avatar Fix Implementation Plan": the rotating hero-ticket carousel on the customer order page, plus an avatar rendering fix.
- `2026-07-06-public-to-qkit-schema.md` — "public → qkit Schema Namespace — Implementation Plan": migrates all tables from Postgres's `public` schema into a dedicated `qkit` schema.
- `2026-07-09-qkit-vendor-status-endpoint.md` — "qkit Vendor-Status Endpoint Implementation Plan": adds an API endpoint exposing a vendor's plan/entitlement status.
- `2026-07-10-qkit-downgrade-request-endpoint.md` — "qkit Downgrade-Request Endpoint Implementation Plan": adds an endpoint for a vendor to request a plan downgrade.
- `2026-07-10-qkit-upgrade-request-endpoint.md` — "qkit Upgrade-Request Endpoint Implementation Plan": adds an endpoint for a vendor to request a plan upgrade.
- `2026-07-14-booth-form-ticket-cards.md` — "Booth Form Ticket Cards Implementation Plan": reworks the booth-editing form to render menu items as ticket-style cards.
- `2026-07-14-nav-plan-to-dropdown.md` — "Nav Plan-to-Dropdown Implementation Plan": moves the "Plan" nav link into the account dropdown menu and reorders the dropdown's items.
- `2026-07-14-tablet-two-column-layout.md` — "Tablet+ Two-Column Layout Implementation Plan": adds a two-column layout for tablet-and-larger viewports.

## Parent

[superpowers](../README.md)
