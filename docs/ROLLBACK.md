# qkit — Rollback Runbook

## App code — instant, via Vercel

Every merge to `main` gets an auto-tag (`.github/workflows/tag-release.yml`,
patch-bumped semver starting at `v0.1.0`). To roll back:

1. Find the tag/commit you want to revert to (`git tag -l` or the Vercel
   deployment list — each deployment is linked to the commit it built).
2. **Dashboard**: Vercel project → Deployments → find the prior deployment →
   "..." menu → **Promote to Production** (instant, no rebuild).
3. **CLI**: `vercel rollback <deployment-url-or-id>`.

This is genuinely instant — no rebuild, no migration, just repointing
production traffic at a previously-built deployment.

## Database — NOT instant, forward-only by design

**Do not expect a DB "rollback" to work like the app-code one above.**
`supabase/migrations/README.md` states the convention explicitly: migrations
are append-only, "nothing here is ever edited after landing — a later
migration corrects an earlier one." There is no supported "undo migration
0057" operation.

If a migration causes a real problem in production:

1. **Write a new, corrective migration** that undoes or fixes the specific
   change (e.g. drop a column a bad migration added, restore a previous
   function definition) — same review/testing process as any other
   migration (pgTAP coverage, `supabase test db`).
2. Apply it via `/supabase-migrate` (this project's migration skill) or
   the CLI, same as any forward migration — never hand-edit a landed
   migration file.
3. If the problem is bad _data_ (not schema) — e.g. a bug wrote wrong
   values — fix the data directly via a one-off, reviewed SQL script
   against production, not a schema migration. Keep a record of what was
   run and why (a comment in the PR/commit that fixed the underlying bug
   is enough — no separate audit table needed at this scale).

**Why not just restore from backup?** Supabase's point-in-time recovery
(PITR) is a paid add-on not currently enabled (see
`Merqo Business/docs/business/2026-07-17-merqo-roadmap.md` — deferred
until real transaction volume justifies the cost). Pro's included daily
backups exist as a last resort for catastrophic data loss, not as a normal
rollback mechanism — restoring from a daily backup loses everything since
that backup ran, which is a much bigger cost than writing a corrective
migration for a normal bad-migration scenario.

## Practical takeaway

- **App bug, no bad migration involved**: roll back the app deployment
  (instant), fix forward, redeploy via the normal PR flow.
- **Bad migration**: cannot instantly roll back — the app-level rollback
  above won't undo a schema change. Write and ship a corrective migration
  as fast as possible; this is a "fix forward" situation, not a rollback
  one, even though it feels like an emergency.
- **Both at once**: roll back the app immediately (stops the bleeding for
  users), then write the corrective migration at normal — not panicked —
  speed, since the app rollback already bought breathing room.
