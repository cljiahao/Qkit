# specs

## Purpose

Approved design docs, one per feature, each with a matching implementation plan in `../plans/`. These capture the problem statement, decisions made during brainstorming, and the architecture a feature was built against — kept as project history, not living docs.

## Contents

- `2026-06-08-google-auth-design.md` — "Design: Google-primary auth with email/password fallback": goal, architecture, config, and error handling for Google-primary sign-in.
- `2026-06-09-booth-menu-management-design.md` — "Booth & Menu Management — Design": migration `0002`, schema/validation changes, and the `saveBooth` server action for vendor menu editing.
- `2026-06-09-drink-customization-design.md` — "Drink Customization (seed-only, bottom-sheet)": data model, `src/lib/cart.ts` keying, and the seed rewrite for bottom-sheet drink customization.
- `2026-06-09-menu-photos-mobile-coffee-seed-design.md` — "Round 2 — Per-item menu photos, mobile optimization, coffee-cart seed": per-item photo storage, mobile-optimization pass, and the coffee-cart seed.
- `2026-06-10-vendor-customization-editor-design.md` — "Vendor customization editor + multi-select options — design": lets vendors author their own customization option groups (not just seed-fixed ones), including multi-select.
- `2026-06-10-vendor-stats-design.md` — "Vendor stats page — design": time windows, what counts as a sale, architecture, and chart-library risk assessment for the stats page.
- `2026-06-11-admin-identity-and-audit-design.md` — "Separate admin identity + audit log — design": migration `0006`, role model/routing, and an audit log distinct from vendor identity.
- `2026-06-11-booth-qr-poster-design.md` — "Booth QR poster — design": the printable QR poster architecture for a booth.
- `2026-06-11-entitlement-foundation-design.md` — "Entitlement foundation (plans + hard locks) — design": migration `0003`, the pure `src/lib/plan.ts` rules module, the 1-booth-on-free gate, and the stats-window gate.
- `2026-06-11-landing-and-admin-design.md` — "Landing page + admin dashboard + event tracking — design": the public `/` landing page, the `/admin` dashboard, and click-rate event tracking (migration `0005`).
- `2026-06-12-booth-ops-improvements-design.md` — "Booth Ops Improvements — Design": a shared timezone helper, working-hours, active-pill recolor, hiding dead booth tabs, and a busiest-hour stat.
- `2026-06-12-order-flow-v2-design.md` — "Order Flow v2 — Design": simplified order-status flow, board sort order, multi-booth board, and a cancel-confirmation modal.
- `2026-06-16-admin-revamp-design.md` — "Admin Page Revamp — Design (2026-06-16)": reorganizes the admin page into a new section hierarchy.
- `2026-06-16-landing-refresh-design.md` — "Landing Page Refresh — Design (2026-06-16)": research-backed section rework of the landing page.
- `2026-06-16-stats-revamp-design.md` — "Stats Revamp — Design (2026-06-16)": time window, metrics, and free-vs-Pro gating for the revamped stats page.
- `2026-06-18-monetization-gating-and-licensing-design.md` — "Monetization: free-tier gating, sold-out caps, and per-event licensing — design": Part A free-tier gates + sold-out caps, Part B entitlement/licensing fulfilled without Stripe.
- `2026-06-20-feedback-events-and-chart-design.md` — "Feedback Streams, Per-Event Stats & Profit-Chart Fix — Design": feedback event streams, per-event stats breakdown, and a profit-chart correctness fix.
- `2026-06-20-harness-hardening-design.md` — "Harness Hardening & Project Governance — Design": `.claude/settings.json` permissions, project skills, docs reorg + constitution, and security scanning.
- `2026-06-20-reorder-and-recent-orders-design.md` — "Reorder + Recent-Orders Collapse — Design": one-tap reorder and a collapsed recent-orders view on the customer status page.
- `2026-06-21-mobile-sound-and-notifications-design.md` — "Mobile Sound + Notifications — Design": fixes for sound alerts and browser notifications on mobile.
- `2026-06-24-demo-video-generator-design.md` — "Demo video generator — design": architecture for the Playwright-driven prospect demo-video generator (matches `scripts/demo/`).
- `2026-06-24-service-speed-stats-design.md` — "Service-speed stats — design (2026-06-24)": data model, metric definition, and architecture for time-to-ready stats.
- `2026-06-27-onboarding-tour-design.md` — "Onboarding Tour — Design": the vendor onboarding tour shown after first sign-up.
- `2026-06-28-qkit-payments-seam-design.md` — "qkit Payments Seam — Design": data model, `src/lib/payments/` connector interface, flow, and RLS for PayNow payments.
- `2026-07-01-booth-qr-token-design.md` — "Rotatable Booth QR Token — Design": the rotatable-token architecture backing the QR-token plan.
- `2026-07-01-order-path-hardening-design.md` — "Order Path Hardening — DB-Enforced Ordering + Short Code — Design (Phase A)": moving order-path invariants into the database and adding short order-entry codes.
- `2026-07-02-order-integrity-design.md` — "Order Integrity — Vendor Write Path Hardening (Phase B / B2) — Design": closes the `authenticated`-role gap the sweep-2 audit found in the vendor write path.
- `2026-07-04-admin-vendor-management-design.md` — "Admin vendor management — design": admin-side tooling for managing vendor accounts.
- `2026-07-04-sales-export-seam-design.md` — "qkit Sales Export Seam — Design": a sales-data export seam, including auth via same-origin vendor session cookie.
- `2026-07-06-hero-ticket-carousel-design.md` — "Hero Ticket Carousel + Avatar Fix — Design": the rotating hero-ticket carousel and an avatar-rendering fix.
- `2026-07-09-vendor-board-settings-design.md` — "Vendor Board Settings — Design": per-vendor board display/behavior settings.
- `2026-07-14-booth-form-ticket-cards-design.md` — "Booth Form Ticket Cards — Design": rendering booth-form menu items as ticket-style cards.
- `2026-07-14-cross-kit-nav-standardization-design.md` — "Cross-kit account-menu standardization: Plan placement + item order": standardizes the account-menu's "Plan" entry placement and item order across kits.
- `2026-07-14-tablet-two-column-layout-design.md` — "Tablet+ Two-Column Layout — Design": the two-column layout design for tablet-and-larger viewports.
- `2026-07-16-vendor-social-links-design.md` — "Vendor Social & Website Links — Design": two-level (profile default + per-booth override) config for vendor website/Instagram/Facebook/TikTok links, shown on the customer order-status page footer only.
- `2026-07-18-allergen-dietary-tagging-design.md` — "Allergen / Dietary Tagging — Design": lets a vendor tag allergens at whichever level (base item vs. customization choice) they actually vary, simplified from an earlier add/remove-list model after founder review; touches the same `optionChoiceSchema` as the price-delta design.
- `2026-07-18-cicd-hardening-design.md` — "CI/CD Hardening — Design": moves qkit from solo direct-to-main pushes to a PR-based workflow so the existing (already thorough, currently unused) `ci.yml` pipeline actually gates changes ahead of the Manfred pilot taking live payment.
- `2026-07-18-live-wait-time-estimate-design.md` — "Live Wait-Time Estimate — Design": shows customers a live "ready in ~N min" estimate on the order-status page, computed from data qkit already tracks, to cut "is it ready yet" interruptions.
- `2026-07-18-manual-queue-priority-override-design.md` — "Manual Queue Priority Override — Design": a one-time bump (not a permanent pin) that jumps an order to the front of its status lane, for a vendor to help a specific customer right now; depends on the Track B unified board.
- `2026-07-18-menu-choice-price-delta-design.md` — "Menu Customization Choice Price Delta — Design": an optional `cost_delta_cents` on a customization choice, computed server-side into the order total from the stored menu (never trusted from the client), preserving the order-path-hardening invariant.
- `2026-07-18-vendor-notification-channels-design.md` — "Vendor Notification Channels (Telegram/WhatsApp pickup pings) — Design": draft, pending founder review — push a pickup-ready ping to a vendor-chosen channel since the customer order-status page is poll-only and stops working once a customer locks their phone; qkit-only for now, not extracted as a shared service.
- `2026-07-21-arrival-confirmation-design.md` — "Arrival Confirmation (\"Scan-to-Start\") — Design": holds prep for a perishable-immediately item until the customer is confirmed at the counter, reusing the dormant `pending` order status instead of adding a new enum value.
- `2026-07-21-drop-vendor-identity-columns-design.md` — "Drop `qkit.vendors.name` / `qkit.vendors.social_links` — Design": finishes the deferred step 4 of merqo's shared-vendor-profile cutover (which shipped 2026-07-17) by dropping the two now-stale columns once a full deploy cycle had passed.
- `2026-08-16-telegram-order-alerts-design.md` — "Telegram Order Alerts — Design": a vendor connects Telegram once (deep-link QR, own bot/webhook), then gets a message the moment a new order lands — a redundant channel alongside the live dashboard board. Phase A of the cross-kit Telegram integration design; distinct from (but infra-compatible with) the still-draft `2026-07-18-vendor-notification-channels-design.md`'s customer-facing "order ready" ping.
- `2026-08-16-customer-telegram-connect-design.md` — "Customer Telegram Connect — Design": qkit's half of Phase B+D — a "Get notified on Telegram" button on the order-status page's waiting moment, calling merqo's new `customer-connect-token`/`notify-customer` endpoints; `advanceOrder`'s `ready` transition fires the notification. No new qkit table or webhook — the connection lives entirely in `merqo.customers`.
- `2026-08-16-customer-notify-vendor-toggle-design.md` — "Customer Notify Vendor Toggle — Design": fast-follow on the customer Telegram connect work — a `board_settings` on/off switch (default on) letting a vendor turn off the customer order-ready notification without touching the customer's own consent.

## Parent

[superpowers](../README.md)
