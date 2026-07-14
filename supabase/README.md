# supabase

## Purpose

Postgres schema, RLS policies, and test data for the `qkit` Supabase schema.

## Contents

- `config.toml`
- `migrations/`
- `seed/`
- `snippets/`
- `tests/`

## Connectivity

`migrations/` is the ordered schema history applied via the Supabase CLI (`supabase db push`/`db reset`); `seed/` holds demo and CI seed data built on top of that schema; `tests/` holds pgTAP RLS tests run against it. `snippets/` is Supabase Studio's saved-query folder, currently empty.

## Parent

[qkit](../README.md)
