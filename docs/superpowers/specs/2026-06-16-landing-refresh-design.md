# Landing Page Refresh — Design (2026-06-16)

## Overview

Improve the public landing (`src/app/page.tsx`) per 2026 SaaS best practices:
show the product fast, update stale copy to match the stats revamp, add
authentic trust, and a clearer FAQ. Keep the "Kraft & Ember" identity and the
existing section order. Built with the frontend-design skill; mobile-first
(375px); `templatecentral:standards` drift check before merge.

## Research basis (web, 2026-06-16)

Hero must show product value in 3–5s (visual, not text-only); single
intent-matched primary CTA above the fold; structure hero → features → social
proof → FAQ → final CTA; FAQ concise + plain customer language (≤6, accordion);
social proof must be authentic (no fake testimonials/logos/counts) — for a
pre-customer product use positioning + a product visual; ~83% mobile.
Sources: Leadfeeder, fibr.ai, Mailchimp (FAQ), ProveSrc (social proof).

## Sections

1. **Hero** — keep H1 "Live booth ordering, minus the queue." Refine subhead.
   Add a **product visual**: a mock live order board (2–3 Kraft & Ember "ticket"
   cards with Preparing/Ready statuses), so visitors see the product instantly.
   Visual stacks below copy on mobile. One primary CTA (`Get started`) +
   secondary `See how` anchor; eyebrow chip stays.
2. **Trust strip (new)** — one honest line: "Built in Singapore for hawker
   stalls, night-market & event booths" + factual chips: **No app · No hardware
   · Free to start.** No fabricated proof.
3. **FeaturedBooths (new, seam only)** — a presentational section rendered ONLY
   when given ≥1 featured booth; fed an empty array now, so it is hidden today.
   No DB change in this task. A future spec adds the data source (vendor
   `showcase` opt-in + **consent** + quote, admin verify/feature toggle) and
   populates it. Consent is required before any real vendor appears publicly.
4. **How it works** — keep 3 steps; copy polish; fix stale status wording to
   "preparing → ready → done" (matches shipped order-flow v2).
5. **Why / moat** — refresh "Know your numbers" → "Revenue trends, your busiest
   day × hour, top sellers, and true profit margin per item."
6. **Pricing (updated info — key fix)**
   - Free: 1 booth · live order board · QR poster + menu customization · today's stats.
   - Pro: unlimited booths · **full stats — 7/30/90-day + period comparison,
     busy-times heatmap, profit margins, revenue trend, CSV export** · everything
     in Free. (Current copy says only "7d/30d + top items" — stale.)
7. **FAQ** — tighten to plain customer language; cap at 6, accordion stays.
   Keep: no-download, payment (honest — not yet, settle cash/PayNow/terminal),
   cost, non-food. Add: "How long to set up?" ("Minutes — add items, print the
   QR, you're live") and "What do I need?" ("Any phone or laptop browser — no
   app, no hardware").
8. **Final CTA + footer** — keep; optional one-line honest maker note in footer.

## Architecture

- Extract the mock board into `src/app/(marketing)/...`? No — keep route at `/`.
  New presentational components beside the page:
  `src/components/landing-board-preview.tsx` (the hero mock board) and
  `src/components/featured-booths.tsx` (the seam section; renders null when
  empty). Section copy/data arrays stay inline in `page.tsx`.
- `page.tsx` stays a server component (auth-aware CTA via `getUser`). It passes
  `featured={[]}` to `FeaturedBooths` for now, with a comment pointing at the
  future spec.

## Testing

Presentational — no business logic. Rely on `pnpm build` + a 375px visual check.
One light RTL smoke is optional: `FeaturedBooths` renders null on `[]` and shows
cards when given data (guards the seam contract).

## Out of scope (separate future spec)

Vendor showcase opt-in + consent + quote, admin verify/feature toggle, the
"hidden/invite vendor onboarding" path, and wiring real featured booths into the
section. Built when a willing, consenting vendor exists.
