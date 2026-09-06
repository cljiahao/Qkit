# landing

## Purpose

The "QKit" wordmark surfaces and the site chrome shared across the
landing page and `/about`: the sticky top nav, the footer, and the plain
inline mark used on the login page.

## Contents

- `nav.tsx` — `Nav({ authed })`: the sticky top nav, shared by the
  landing page and `/about`. Composes `@merqo/ui`'s `LandingNav` shell
  (sticky positioning, background blur, border, and the responsive
  `end`-slot gap all live there) — this file supplies only the wordmark
  and right-side content: a plain `<a href="/#top">` (not `next/link`'s
  `Link` — a same-page hash jump needs a native anchor so the URL bar's
  hash always updates, which `Link` doesn't reliably do when only the
  fragment changes) as `wordmark`, and, as `end`, "FAQ" (`/#faq`, an
  absolute path since this nav also renders on `/about`, not just `/`)
  and "About" links plus either a "Dashboard" link (`authed`) or "Sign
  in" + "Get started" links (signed out).
- `nav.test.tsx` — asserts the About/FAQ/Sign-in/Get-started/Dashboard
  link targets.
- `footer.tsx` — `Footer()`: the site footer, shared by the landing page
  and `/about` (previously inlined in `src/app/page.tsx`, extracted so
  `/about` could reuse it without duplicating the markup) — wordmark,
  tagline, copyright line, an "About" link, `@merqo/ui`'s
  `LegalFooterLinks` (Terms/Privacy), and a "Vendor sign in" link.
- `footer.test.tsx` — asserts the wordmark link, tagline, copyright line,
  About link, and Terms/Privacy links.
- `wordmark.tsx` — `Wordmark({ className })`: the standalone "QKit" mark (no
  link, no nav chrome) used by the login page's two panels, where the nav
  shell itself doesn't apply.

## Connectivity

`nav.tsx`'s `Nav` and `footer.tsx`'s `Footer` are rendered by both
`src/app/page.tsx` (the landing page) and `src/app/about/page.tsx`.
`wordmark.tsx`'s `Wordmark` is rendered by `src/app/(auth)/login/page.tsx`.
None of these are used by the vendor dashboard, which has its own wordmark
markup inlined in `src/app/dashboard/dashboard-nav.tsx` (also composing
`@merqo/ui`, via `DashboardNav` rather than `LandingNav`).

## Parent

[components](../README.md)
