# AAR: production 500s on order-status, `/o/[code]`, Settings, and Profile pages

**Date of incident:** 2026-09-17 (reported), root cause introduced 2026-09-16
**Date of this review:** 2026-09-18
**Severity:** Production outage on customer-facing order pages and two vendor
dashboard pages. Real customer orders were affected (any booth with social
links set 500'd on its order-status page).

## Summary

Two distinct crashes, same root cause: `@merqo/ui`'s entire package is
bundled with a package-wide `"use client"` banner (`tsup.config.ts`'s own
explicit tradeoff). Any qkit Server Component that consumed a **plain data
export** or passed a **function/component reference as a prop** into that
package broke at runtime, invisibly to `pnpm check`, `pnpm test`, and
`next build`. Both instances were live in production for roughly two days
before a user manually found them.

- **Crash 1** — `src/components/social-links-row.tsx` imported
  `SOCIAL_LINK_FIELDS` (a plain array constant, not a component) directly
  into a Server Component and called `.filter()` on it. Next's RSC
  machinery handed back a client-reference stub instead of the real array:
  `TypeError: c.SOCIAL_LINK_FIELDS.filter is not a function`. Affected every
  order-status page (`/order/[boothId]/[orderNumber]`) and `/o/[code]` for
  any booth with social links set. Fixed in
  [#159](https://github.com/cljiahao/Qkit/pull/159).
- **Crash 2** — `src/app/dashboard/settings/page.tsx` and
  `.../profile/page.tsx` (both Server Components) passed
  `LinkComponent={Link}` (`next/link`) as a prop into `@merqo/ui`'s
  `BackButton`. This is an explicit, well-documented Next.js RSC violation:
  `Error: Functions cannot be passed directly to Client Components...`.
  Affected `/dashboard/settings` and `/dashboard/profile` for every vendor.
  Fixed in [#160](https://github.com/cljiahao/Qkit/pull/160).

## Timeline

- **2026-09-16, PR #153** — "adopt @merqo/ui's shared
  BackButton/ElevatedCard/SocialLinksFields/MoneyInput/Footer." This is
  where both bugs were introduced: `social-links-row.tsx` switched from a
  local field list to importing `SOCIAL_LINK_FIELDS` from `@merqo/ui`, and
  `BackButton` usages in `settings/page.tsx`/`profile/page.tsx` were added
  with `LinkComponent={Link}`. CI (build, `check + unit`, e2e, all other
  gates) passed clean — none of it exercises the runtime RSC boundary these
  bugs live in.
- **2026-09-16 to 2026-09-17** — Both bugs live in production, silently.
  Neither surfaced until a real vendor/customer hit an affected page.
- **2026-09-17** — User reports a generic "Something went wrong" error
  while trying to place an order live on `qkit.merqo.io`. No stack trace
  visible client-side (production error minification + no Sentry/error
  tracking on qkit).
- User pulls the raw Vercel function log directly and pastes the real
  error: `TypeError: c.SOCIAL_LINK_FIELDS.filter is not a function`. This
  single piece of information is what made the root cause immediately
  traceable — before it, only the minified React error codes (#419/#441)
  were visible, which only said "a Suspense boundary failed on the
  server," not why.
- Root cause traced to `tsup.config.ts`'s package-wide `"use client"`
  banner. Fix applied, verified via an isolated DB-free repro route run
  through `pnpm build && pnpm start` (production mode — the only mode this
  bug class reproduces in), shipped as #159.
- User then reports Settings and Booth pages "also crashing." Static sweep
  of every `@merqo/ui` import in the codebase for the same two risk
  patterns turns up the `LinkComponent={Link}` instances in
  settings/profile. Same repro-and-verify method, shipped as #160.
- Live verification via the user's own authenticated Chrome session
  confirms both fixes resolved everything reported, including a
  previously-unclear "slow to load" payment page — which turned out to be
  the same crash presenting as an indefinite hang rather than the visible
  error screen, not a genuine network/API latency issue.

## Why this wasn't caught before production

Every existing quality gate was blind to this class of bug, for different
reasons:

- **`pnpm check` (tsc + eslint)** — static analysis has no model of the
  React Server Components serialization boundary. A function prop typed
  correctly in TypeScript is still invalid at the RSC boundary; the type
  system doesn't know the difference.
- **`pnpm test` (vitest + jsdom)** — component tests mock `@merqo/ui`
  entirely (house convention), so the real client-boundary behavior of the
  actual package never executes in a test.
- **`next build`** — confirmed empirically, twice, during this incident:
  the build succeeds with both bugs present. Next's build-time checks don't
  render dynamic routes against real data, so a runtime-only RSC violation
  tied to a specific prop value or data shape doesn't surface.
- **CI's e2e suite (Playwright)** — `auth-guard.spec.ts` and
  `customer-order.spec.ts` (against the coffee-cart seed) are the only two
  specs. Neither touches a booth with social links set, nor the Settings or
  Profile dashboard pages. A real, specific coverage gap, not a process
  failure — but worth naming.

This matches (and reconfirms) the existing memory note: `@merqo/ui`'s
package-wide client banner produces "RSC 500 not caught by build on
dynamic routes." That note was about function props specifically; this
incident shows the same failure mode also applies to plain data exports.

## What worked

- Pulling the real Vercel log line resolved crash 1 in one step — every
  minute spent trying to infer the cause from console digests and network
  traces was wasted next to just reading the actual server error.
- Building an isolated, DB-free repro route (`pnpm build && pnpm start`,
  production mode) let both bugs be reproduced and the fix verified with a
  real before/after, without needing local Supabase — this is the correct
  verification method for this specific bug class going forward, since
  it's the only mode either crash manifests in.
- Sweeping every `@merqo/ui` import in the codebase for both risk patterns
  (plain-data import into a Server Component; function/component prop
  into an `@merqo/ui` component from a Server Component) after the first
  fix caught the second bug proactively-ish, rather than waiting for a
  third user report.
- Live-verifying via the user's own authenticated browser session closed
  the loop for pages (Settings, Profile, booth edit) that need a real
  vendor login — something no automated check here covers either.

## Wider blast radius (not fixed here)

The identical `LinkComponent={Link}`-from-a-Server-Component pattern exists
in **paykit, stockkit, loopkit, and merqo** — all adopted `BackButton`/
`DashboardNav` the same way during the shared-component promotion
(qkit #153, stockkit #89, paykit #108, loopkit #134, merqo #78). Confirmed
present in: `plan/page.tsx`, `profile/page.tsx`, `settings/page.tsx`,
`redeem-voucher-confirm.tsx`, `referrals/page.tsx`, `counter/page.tsx`,
`setup/page.tsx`, `account-menu.tsx`. None of these have been checked for
the `SOCIAL_LINK_FIELDS`-style plain-data variant either — only qkit has
been swept.

## Recommendations

1. **Fix the same `LinkComponent` bug in paykit, stockkit, loopkit, and
   merqo.** Same one-line fix (drop the prop) should apply everywhere it's
   used the same way.
2. **Sweep all 4 sibling kits for both risk patterns**, the same way this
   review did for qkit — a plain-data `@merqo/ui` export imported into a
   Server Component, or a function/component prop passed into an
   `@merqo/ui` component from one.
3. **Reconsider merqo-ui's package-wide `"use client"` banner tradeoff.**
   It already has one escape hatch (`./legal`, a separate un-bannered
   entry for server-safe utilities per `tsup.config.ts`). Plain data
   exports like `SOCIAL_LINK_FIELDS` are a good candidate for a similar
   split — this bug class will keep recurring for every future consumer
   otherwise.
4. **Add minimal error tracking to qkit** (paykit already has
   `@sentry/nextjs`, gated on `SENTRY_DSN`). Both crashes here were only
   caught because a human manually hit the page and manually pulled a
   Vercel log — there is no automated alerting on qkit today.
5. **Consider extending e2e coverage** to touch a booth with social links
   set, and to visit Settings/Profile as an authenticated vendor — the two
   specific states that hid these bugs from CI for two days.
