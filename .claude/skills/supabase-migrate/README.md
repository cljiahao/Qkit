# supabase-migrate

## Purpose

Skill that applies `supabase/migrations` and regenerates `src/lib/types.ts`, with a safety gate.

## Contents

- `SKILL.md` — defines the `supabase-migrate` skill (`allowed-tools: Bash(supabase *), Bash(pnpm *)`, `disable-model-invocation: true` — only runs when explicitly called, never auto-triggered). Documents three apply paths: local Dockerized dev (`supabase migration up`, or destructive `supabase db reset`, then `supabase gen types typescript --local > src/lib/types.ts`); linked/hosted (`supabase db push` then `supabase gen types typescript --linked > src/lib/types.ts`); and a CLI-less fallback (paste SQL into the Supabase SQL Editor and hand-update `src/lib/types.ts`, keeping `Relationships`/`Views`/`Functions`/`CompositeTypes` or queries degrade to `never`). The safety gate before touching a non-local project: confirm the linked project ref via `supabase projects list`, keep RLS enabled on `vendors`/`booths`/`orders` (fix the policy, never disable it), and confirm `orders` stays in the `supabase_realtime` publication.

## Connectivity

Operates on `supabase/migrations/` (the SQL schema source of truth) and writes `src/lib/types.ts` (the generated DB types consumed throughout `src/`). `disable-model-invocation: true` means it must be invoked directly as `/supabase-migrate`, reflecting that schema/RLS changes shouldn't happen automatically.

## Parent

[skills](../README.md)
