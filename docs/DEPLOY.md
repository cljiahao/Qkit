# qkit — Deploy Notes

qkit runs on the **shared Merqo Supabase project** (same one as loopkit/merqo),
in its own `qkit` schema.

## Notes

- **qkit-loopkit auto-award**: apply merqo's `0008_kit_events.sql` first,
  then this repo's `0051_emit_order_completed.sql`. Set
  `NEXT_PUBLIC_LOOPKIT_URL` in Vercel env before deploying the order-status
  page change, or the earn link silently never shows (fails closed).

## Production vs Preview environment variables

Preview deploys (`*.vercel.app`, one per branch/commit) and Production
(`*.merqo.io`) share the same Vercel project but must **not** share every
env var value — some are Production-only by design:

- **`NEXT_PUBLIC_AUTH_COOKIE_DOMAIN`** — set to `.merqo.io` in **Production
  only**. Leave unset for Preview/Development. If set on Preview, the
  Supabase auth cookies (including the PKCE `code_verifier`) get written
  with `Domain=.merqo.io`, which browsers silently reject on a
  `*.vercel.app` host — Google OAuth then fails with `/login?error=oauth`
  on every preview deploy, with no error logged anywhere but a client-side
  `exchangeCodeForSession` failure (zero `/token` requests ever reach
  Supabase — that's the tell if this regresses). Hit and fixed 2026-08-13;
  see `src/app/auth/callback/route.ts` for the (now-logged) failure path.
  Check this env var's environment scoping in the Vercel dashboard whenever
  cross-kit SSO config changes — it's a dashboard setting, not something
  `.env.example` enforces.

**Database**: Preview and Production currently point at the **same**
Supabase project — no separate staging database. This is a known,
deliberate gap (not yet urgent) rather than an oversight: preview builds
read/write real production data. Segregating Preview onto a separate
staging project (plus auditing which other env vars should split
Prod/Preview) is scoped for a future pass, not scheduled yet.
