# Design: Google-primary auth with email/password fallback

Date: 2026-06-08
Status: Approved (pending spec review)

## Goal

Make Google OAuth the primary vendor sign-in method, keep email/password as a
secondary option, and unify account onboarding. Authentication only
authenticates; collecting the vendor's stall name (and creating the `vendors`
row) happens once, post-login, through a single gated path — regardless of
which method was used.

Customers are unaffected (they order via QR, never authenticate).

## Decisions (from brainstorming)

1. **Single auth screen** — collapse `/login` and `/register` into one `/login`
   screen: "Continue with Google" (primary) above an email/password form
   (secondary) with an inline "Sign in ⇄ Create account" toggle. OAuth has no
   login/register distinction, so two screens add friction and duplicate code.
   `/register` redirects to `/login`.
2. **Unified post-login onboarding** — both Google and email/password land on
   `/onboarding` if they have no `vendors` row. One code path creates the row.
3. **Server-component gate** (not middleware) — a shared `getVendor()` helper.
   `proxy.ts` stays auth-only; no per-request DB query.

## Architecture

### Components

| Unit | Type | Responsibility |
|------|------|----------------|
| `src/app/(auth)/login/page.tsx` | client page | Google button + email/password form (sign-in / create-account toggle). Only authenticates. |
| `src/app/(auth)/register/page.tsx` | — | Removed. `/register` → `/login` via a `next.config.ts` redirect (`permanent: false`). |
| `src/app/auth/callback/route.ts` | route handler | OAuth return: `exchangeCodeForSession(code)` → redirect to `/dashboard`. |
| `src/app/onboarding/page.tsx` | server page | Gated. No vendor → render stall-name form; has vendor → redirect `/dashboard`. |
| `src/app/onboarding/actions.ts` | server action | `createVendor(input)` — Zod-validated, inserts the `vendors` row (RLS `vendors_self_insert`). The ONLY writer of `vendors` on signup. |
| `src/lib/supabase/get-vendor.ts` | server helper | `getVendor()` → the caller's `vendors` row or `null`. Single source of truth for the gate. |
| `src/lib/schemas.ts` | schemas | Remove `registerSchema` entirely (email+password sign-up reuses `loginSchema`); add `vendorSchema { name }`. |
| `supabase/config.toml` | config | Enable `[auth.external.google]` (local). Hosted project enables Google in dashboard. |

### Data flow

```
Google ─signInWithOAuth─> Google ─> /auth/callback ─exchangeCodeForSession─┐
Email  ─signInWithPassword / signUp───────────────────────────────────────┤
                                                                           v
                                                              session established
                                                                           │
                                              /dashboard (server component)
                                                   getVendor() == null ? ──> /onboarding
                                                              │ else
                                                              v
                                                        order board
```

`/onboarding`: `getVendor()` truthy → redirect `/dashboard`; else show form →
`createVendor({ name })` → redirect `/dashboard`.

### The gate (DRY)

`getVendor()` is called by both:
- `/dashboard` — no user → `/login`; no vendor → `/onboarding`.
- `/onboarding` — no user → `/login`; vendor exists → `/dashboard`.

`createVendor` is the sole code path that inserts a `vendors` row. The
client-side insert currently in the register form is removed.

### Auth secondary path (email/password)

One form, a `mode` toggle (`signin` | `signup`):
- `signin` → `signInWithPassword` → on success router push `/dashboard` (gate routes onward).
- `signup` → `signUp` (email + password only) → on success same redirect.
  With email confirmation OFF (local) a session exists immediately. With it ON
  (prod), show "check your email"; the vendor row is created later at first real
  login — which works because creation is post-login, not in the signup form.

## Configuration

- **Google Cloud**: OAuth 2.0 client (Web). Authorized redirect URIs:
  - local: `http://127.0.0.1:54321/auth/v1/callback`
  - prod: `https://<project-ref>.supabase.co/auth/v1/callback`
- **Local** (`supabase/config.toml`): `[auth.external.google] enabled = true`,
  `client_id = "env(SUPABASE_AUTH_GOOGLE_CLIENT_ID)"`,
  `secret = "env(SUPABASE_AUTH_GOOGLE_SECRET)"`. Values live in the Supabase
  CLI's env (not the Next app); never committed.
- **Prod**: enable Google in the hosted dashboard with the same client ID/secret.
- App-level redirect: `signInWithOAuth({ options: { redirectTo: `${origin}/auth/callback` } })`
  using `NEXT_PUBLIC_BASE_URL`.

## Error handling

- OAuth callback with no/invalid `code` → redirect `/login?error=oauth`.
- `createVendor` Zod failure → re-render form with field error (no row written).
- `vendors` insert error → surface a friendly message; user stays on `/onboarding`.
- Duplicate vendor row (race) → treated as success (row exists → proceed).

## Testing

- Unit: `vendorSchema` accept/reject; `registerSchema` removed (sign-up reuses `loginSchema`).
- Manual (local):
  1. Google sign-in (new) → `/onboarding` → set name → `/dashboard`.
  2. Google sign-in (returning) → straight to `/dashboard`.
  3. Email create-account → `/onboarding` → `/dashboard`.
  4. Email sign-in (existing vendor) → `/dashboard`.
  5. Visit `/onboarding` with a vendor row → redirected to `/dashboard`.
  6. Visit `/dashboard` with no vendor row → redirected to `/onboarding`.
- `pnpm check` + `pnpm test` + `pnpm build` green.

## Out of scope (YAGNI)

- In-app booth creation (booths still seeded via Studio).
- UI/UX redesign (separate task).
- Additional OAuth providers.
