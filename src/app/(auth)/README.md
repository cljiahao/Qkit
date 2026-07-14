# (auth)

## Purpose

Route group for the vendor authentication flow (the parens exclude it from the URL path — routes are `/login` and `/reset-password`, not `/(auth)/login`).

## Contents

- `login/` — combined email/password sign-in, sign-up, and password-reset-request page (`page.tsx`), plus Google OAuth sign-in.
- `reset-password/` — the follow-on page reached from a Supabase password-recovery email link, where the user sets a new password.

## Connectivity

Two steps of one flow: `login/` is where a vendor signs in, signs up, or triggers `supabase.auth.resetPasswordForEmail`; `reset-password/` is where they land after clicking the emailed recovery link (routed through `src/app/auth/callback`, which establishes the recovery session before forwarding here). Successful sign-in/sign-up routes to `/dashboard`.

## Parent

[app](../README.md)
