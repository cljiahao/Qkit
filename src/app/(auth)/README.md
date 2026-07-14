# (auth)

## Purpose

Route group for the vendor authentication flow (the parens exclude it from the URL path — routes are `/login` and `/reset-password`, not `/(auth)/login`).

## Contents

- `login/`
- `reset-password/`

## Connectivity

Two steps of one flow: `login/` is email/password sign-in and sign-up; `reset-password/` is the follow-on form reached from a Supabase password-recovery email link.

## Parent

[app](../README.md)
