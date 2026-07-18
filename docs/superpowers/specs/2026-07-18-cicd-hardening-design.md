# CI/CD Hardening — Design

**Date:** 2026-07-18
**Status:** Decided — ready for implementation
**Context:** qkit is moving from a solo direct-to-main workflow toward a
real product with an actual pilot vendor (Manfred) taking live payment.
Existing `.github/workflows/ci.yml` already runs a thorough pipeline
(check+unit, 3 e2e jobs, migrations+pgTAP, build, mutation-on-PR) on both
`push: [main]` and `pull_request` — most of the "preview testing"
infrastructure already exists, just unused, since the current habit is
pushing straight to `main` instead of opening PRs.

## Decisions

1. **Adopt a PR-based workflow** — branch per change → PR → CI runs (already
   covers everything above) → Vercel auto-generates a preview URL on the PR
   → squash-merge to `main` once green. Squash keeps `main`'s history
   one-commit-per-feature, matching how commits already read in this repo.
2. **Enable GitHub branch protection on `main`** — require CI checks to
   pass before merge is allowed. Without this, PRs are a convention, not a
   gate.
3. **Auto-tag every merge to `main`**, patch-bump semver, starting at
   `v0.1.0` (no tags exist yet; pre-launch, pre-1.0 is the right start).
   Minor/major bumps stay manual (create a `vX.Y.0` tag by hand for a real
   milestone) — the auto-tagger reads the latest tag and patch-bumps from
   wherever it is, so a manual tag just becomes the new baseline.
4. **Rollback is mostly a runbook, not new code.** App rollback: Vercel's
   built-in instant rollback (dashboard or `vercel rollback`), now with
   clean tag references to pick from. DB rollback doesn't work the same
   way — migrations are explicitly forward-only
   (`supabase/migrations/README.md`: "nothing here is ever edited after
   landing, a later migration corrects an earlier one") — a bad migration
   gets fixed by a new corrective migration, never reverted. Document this
   explicitly so it's not assumed to behave like app rollback.
5. **Maintenance banner: informational only, DB-backed, instant toggle,
   built into the existing `/admin` surface.** qkit already has its own
   admin auth (`is_admin()`) — cheaper to add a real toggle there than to
   rely on raw SQL. New singleton table `qkit.platform_settings`
   (`banner_enabled boolean`, `banner_message text`), publicly readable
   (RLS: anyone can `SELECT`), writable only via `is_admin()`. Doesn't
   block any functionality underneath — just displays site-wide when on.

## Architecture

### PR workflow + branch protection

No code change to `ci.yml` — it already triggers on `pull_request`. New:
GitHub branch protection rule on `main` requiring the existing CI jobs
(`check + unit`, `e2e (auth-guard)`, `e2e (order lifecycle)`,
`db (migrations + pgTAP RLS)`, `build (next build)`) to pass before merge.
Configured via `gh api` or the GitHub UI, not a file in the repo.

### Tag automation

New `.github/workflows/tag-release.yml`, triggered on `push: [main]` (runs
after a merge lands). Reads the latest tag via `git describe --tags
--abbrev=0` (falls back to `v0.1.0` if none exist — first run creates the
baseline), parses semver, bumps patch, creates and pushes an annotated tag
(`git tag -a vX.Y.Z -m "..."` + `git push origin vX.Y.Z`). Uses the
default `GITHUB_TOKEN` (already has push access to tags in this repo's own
Actions context) — no new secret needed.

### Rollback runbook

New `docs/ROLLBACK.md`: app-rollback steps (Vercel dashboard/CLI, using a
tag to identify the deployment), explicit statement that DB changes are
forward-only and a bad migration needs a corrective migration, not a
revert — with a pointer to `supabase/migrations/README.md` for the
existing convention.

### Maintenance banner

- **Migration** (`supabase/migrations/`, next sequential number): creates
  `qkit.platform_settings` as a singleton (one row, enforced via a check
  constraint or a fixed known id, matching how other singleton-style
  config in this codebase is modeled if a precedent exists — check
  `board_settings`'s pattern, though that's per-vendor not global, so this
  may need its own simple single-row convention). RLS: `SELECT` open to
  `anon`/`authenticated` (the banner must render for anonymous customers
  too, not just logged-in vendors); `UPDATE`/`INSERT` restricted to
  `is_admin()`.
- **Admin UI**: a small section in the existing `/admin` dashboard —
  toggle + text input, wired through a new server action mirroring the
  existing admin action patterns (`src/app/admin/actions.ts`).
- **Site-wide display**: a read in the root layout (or as high as
  reasonably cheap — check current layout structure for where a
  global, low-latency read fits without adding meaningful overhead to
  every page load) that renders the banner when `banner_enabled` is true.

## Testing

- Tag-automation workflow: hard to unit-test directly (it's a GitHub
  Actions workflow) — verify by observing the first real merge produce a
  `v0.1.1` tag correctly. No pgTAP/vitest coverage needed for this piece.
- Maintenance banner: standard TDD per this project's convention — unit
  test for the semver-bump helper if one gets extracted, DOM test for the
  admin toggle UI, DOM test for the banner rendering conditionally, pgTAP
  for the RLS boundary (anon can read, only admin can write).

## Out of scope (v1)

- Conventional-commit parsing to auto-decide patch vs. minor/major — manual
  minor/major tags are enough for now.
- A real DB-rollback mechanism (snapshots/PITR-based revert) — out of
  scope, matches the already-decided PITR deferral from earlier roadmap
  work.
- Blocking/kill-switch behavior for the maintenance banner (Decision 5 —
  informational only was the explicit call).
