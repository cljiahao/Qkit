# landing

## Purpose

The two "QKit" wordmark surfaces shared outside the main landing-page
component tree (`../landing-*`, documented in the parent README): the sticky
top nav and the plain inline mark used on the login page.

## Contents

- `nav.tsx` — `Nav({ authed })`: the marketing landing page's sticky top nav.
  Composes `@merqo/ui`'s `LandingNav` shell (sticky positioning, background
  blur, border, and the responsive `end`-slot gap all live there) —
  this file supplies only the wordmark and right-side content: a plain
  `<a href="/#top">` (not `next/link`'s `Link` — a same-page hash jump needs a
  native anchor so the URL bar's hash always updates, which `Link` doesn't
  reliably do when only the fragment changes) as `wordmark`, and, as `end`, a
  "FAQ" jump link plus either a "Dashboard" link (`authed`) or "Sign in" +
  "Get started" links (signed out).
- `wordmark.tsx` — `Wordmark({ className })`: the standalone "QKit" mark (no
  link, no nav chrome) used by the login page's two panels, where the nav
  shell itself doesn't apply.

## Connectivity

`nav.tsx`'s `Nav` is rendered once, by `src/app/page.tsx` (the landing page).
`wordmark.tsx`'s `Wordmark` is rendered by `src/app/(auth)/login/page.tsx`.
Neither is used by the vendor dashboard, which has its own wordmark markup
inlined in `src/app/dashboard/dashboard-nav.tsx` (also composing `@merqo/ui`,
via `DashboardNav` rather than `LandingNav`).

## Parent

[components](../README.md)
