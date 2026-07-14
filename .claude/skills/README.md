# skills

## Purpose

Project-specific slash-command skills available to Claude Code in this repo.

## Contents

- `changelog/`
- `next-verify/`
- `security-scan/`
- `supabase-migrate/`

## Connectivity

Each subfolder is one skill (a `SKILL.md`). `next-verify` and `supabase-migrate` wrap this project's own verify/migration workflows (typecheck+lint+test; applying `supabase/migrations`); `changelog` and `security-scan` are narrower single-purpose utilities (Keep-a-Changelog entries; local secret scan + dependency audit).

## Parent

[.claude](../README.md)
