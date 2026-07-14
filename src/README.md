# src

## Purpose

The Next.js application source.

## Contents

- `app/`
- `components/`
- `hooks/`
- `lib/`
- `proxy.ts`

## Connectivity

`app/` is the Next.js App Router tree (pages, layouts, server actions); `components/` and `hooks/` hold cross-route shared UI and logic; `lib/` holds framework-agnostic business logic and the Supabase clients that `app/` depends on. `proxy.ts` is Next 16's middleware-equivalent, refreshing the Supabase session and guarding routes on every request.

## Parent

[qkit](../README.md)
