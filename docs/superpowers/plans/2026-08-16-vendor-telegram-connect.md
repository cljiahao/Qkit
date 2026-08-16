# Vendor Telegram Connect (Phase A2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire qkit's own Telegram bot (Phase A) and route vendor
order-alert notifications through merqo's shared bot instead (Phase A2).

**Spec:** `docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`

**Depends on:** merqo's `docs/superpowers/plans/2026-08-16-vendor-telegram-connect.md`
shipped and deployed first — `POST /api/merqo/notify-vendor` must exist
(unit tests here can mock the HTTP layer ahead of that; the deletion
tasks below don't depend on it at all).

## Global Constraints

- This plan deletes real, currently-shipped code (Phase A's bot). Every
  deleted source file's own test file is deleted alongside it — no
  orphaned tests referencing removed modules.
- `notifyVendorTelegram`'s call site in `placeOrder` and its
  never-blocks-order-placement guarantee are unchanged — only its
  internals move from a local bot call to merqo's endpoint.
- TypeScript strict, no `any`.
- Work on a feature branch, never commit directly to `main`.
- Run `pnpm check && pnpm test && pnpm build` before opening the PR.

---

### Task 0: Branch setup

```bash
git fetch origin main
git checkout -b feat/vendor-telegram-connect origin/main
```

Confirm `pnpm test` passes on baseline first.

---

### Task 1: Add `notifyVendor` helper

**Files:** extend `src/lib/merqo-customer-notify.ts` (or a new
`src/lib/merqo-vendor-notify.ts` — pick per the spec's own note), its
test

- [ ] Failing tests first: `notifyVendor(vendorId, message)` posts
      `{ vendor_id, message }` with the `MERQO_CUSTOMER_SECRET` bearer
      header to `${MERQO_BASE_URL}/api/merqo/notify-vendor`; never throws
      on non-2xx/timeout/network error.
- [ ] Implement.
- [ ] Commit: `feat: add notifyVendor merqo HTTP client helper`.

### Task 2: Rewire `placeOrder`'s vendor alert

**Files:** `src/app/o/[code]/actions.ts`,
`src/app/o/[code]/actions.place-order.test.ts` (rewrite the existing
Telegram-alert test block, don't leave the old assertions alongside new
ones)

- [ ] Failing tests first: `placeOrder` on a successful order calls
      `notifyVendor` with the booth's `vendor_id` and a message
      containing the order number/total; a `notifyVendor` failure doesn't
      change `placeOrder`'s own returned result.
- [ ] Implement: replace `notifyVendorTelegram`'s body — keep the
      existing booth→`vendor_id` lookup, replace the local
      `vendor_telegram` read + `sendTelegramMessage` call with
      `notifyVendor`.
- [ ] Commit: `feat: route order-placed vendor alerts through merqo instead of qkit's own bot`.

### Task 3: Delete Phase A's bot infrastructure

**Files (delete):**

- `src/app/api/telegram/webhook/route.ts` + its test
- `src/lib/telegram.ts` + its test
- `src/app/dashboard/settings/telegram-section.tsx` + its test
- `src/app/dashboard/settings/telegram-actions.ts` + its test
- The render call for `TelegramSection` wherever the settings page
  composes it (remove the section entirely, not just its import)

**Migration:** `supabase/migrations/00XX_drop_vendor_telegram.sql` (next
free id) — `drop table qkit.telegram_link_tokens; drop table
qkit.vendor_telegram;` per the spec.

- [ ] Confirm `pnpm test` still passes after every deletion (no dangling
      import, no orphaned test referencing a removed module).
- [ ] Apply the migration locally.
- [ ] Commit: `feat: retire qkit's own Telegram bot in favor of merqo's shared one`.

### Task 4: `.env.example` + docs

**Files:** `.env.example`, `AGENTS.md`, `src/lib/README.md`,
`src/app/dashboard/settings/README.md`, `CHANGELOG.md`

- [ ] Remove `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET` from
      `.env.example`.
- [ ] Update `AGENTS.md`'s data model / file layout sections to remove
      the retired tables/routes and document `notifyVendor` calling
      merqo instead — name the Phase A → A2 supersession explicitly
      (don't just silently delete the old note).
- [ ] Add a `CHANGELOG.md` entry stating the retirement and the
      reconnect-required consequence for any vendor who'd linked qkit's
      own bot.

### Task 5: Verification gate

- [ ] `pnpm check && pnpm test && pnpm build`; extend
      `supabase/tests/rls.test.sql` to remove the now-dropped tables'
      RLS assertions (don't leave them testing tables that no longer
      exist).
- [ ] Push, PR, poll CI green (`gh pr checks <N> --watch` — block on it
      yourself, no monitor exists), squash-merge.

## Self-Review Notes

- Spec coverage: helper (Task 1), `placeOrder` rewiring (Task 2),
  deletion (Task 3), docs/env (Task 4), verification (Task 5).
- Task 3 is a real deletion pass, not a "leave it, just stop calling
  it" shortcut — dead code left behind here would violate this
  project's own clean-codebase standard.
- No task lets a merqo-side failure affect `placeOrder`'s result —
  Task 2's tests explicitly prove this, not just claim it.
