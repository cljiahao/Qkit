# Customer Notify Vendor Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `board_settings` toggle (default on) that lets a vendor turn
off the customer Telegram "order ready" notification without touching
the customer's own consent.

**Spec:** `docs/superpowers/specs/2026-08-16-customer-notify-vendor-toggle-design.md`

**Depends on:** `feat/customer-telegram-connect` (this repo) already
merged — this plan gates the `notifyCustomer` call that plan introduces
in `advanceOrder`. Confirm it's on `main` before starting.

## Global Constraints

- Default must be `true` for every existing vendor (absent key ≠ off).
- The toggle only ever affects whether qkit _calls_ `notifyCustomer` —
  it must never touch merqo's consent/connection data.
- TypeScript strict, no `any`.
- Work on a feature branch, never commit directly to `main`.
- Run `pnpm check && pnpm test && pnpm build` before opening the PR.

---

### Task 0: Branch setup

```bash
git fetch origin main
git checkout -b feat/customer-notify-vendor-toggle origin/main
```

Confirm `pnpm test` passes on baseline, and that `advanceOrder` already
calls `notifyCustomer` on the `ready` transition (i.e. the dependency
plan has landed) before proceeding.

---

### Task 1: Schema

**Files:** `src/lib/schemas.ts`, `src/lib/schemas.test.ts`

- [ ] Failing test first: `boardSettingsSchema` parses
      `customer_telegram_notify_enabled: false` correctly; defaults to
      `true` when the key is absent from the input object.
- [ ] Add `customer_telegram_notify_enabled: z.boolean().default(true)`
      to `boardSettingsSchema`.
- [ ] Commit: `feat: add customer_telegram_notify_enabled to board_settings schema`.

### Task 2: Gate `advanceOrder`

**Files:** `src/app/dashboard/order-actions.ts`,
`src/app/dashboard/order-actions.test.ts` (extend)

- [ ] Failing tests first: a vendor whose `board_settings` has
      `customer_telegram_notify_enabled: false` does NOT call
      `notifyCustomer` on a `ready` transition; a vendor with the flag
      `true`, or no `board_settings` row at all, still calls it (same
      assertions as the dependency plan's own Task 4 tests, plus the new
      `false` case).
- [ ] Implement: read+parse the vendor's `board_settings` before the
      existing `notifyCustomer` call, skip the call when the flag is
      explicitly `false`.
- [ ] Commit: `feat: let a vendor disable the customer order-ready notification`.

### Task 3: Settings UI

**Files:** locate the file rendering `ready_auto_clear_min`'s own
input/toggle first (verify the actual path — likely
`src/app/dashboard/settings/settings-form.tsx`, don't assume), extend it

- its test.

* [ ] Failing test first: a switch labeled for the customer notification
      renders, defaults checked, and its save path writes the flag into
      `board_settings`.
* [ ] Implement: add the switch next to the existing "Auto-clear after"
      control, same save action / form submission path.
* [ ] Commit: `feat: add customer-notify toggle to dashboard settings`.

### Task 4: Docs

**Files:** `AGENTS.md`, `CHANGELOG.md`

- [ ] Update `AGENTS.md`'s data model note on `board_settings` to
      mention the new key.
- [ ] Add a `CHANGELOG.md` entry.

### Task 5: Verification gate

- [ ] `pnpm check && pnpm test && pnpm build`.
- [ ] Push, PR, poll CI green (`gh pr checks <N> --watch` — block on it
      yourself, no monitor exists), squash-merge.

## Self-Review Notes

- Spec coverage: schema (Task 1), gate (Task 2), UI (Task 3), docs
  (Task 4), verification (Task 5).
- Default-true backward compat is explicitly tested in Task 1 and
  Task 2, not just claimed.
- This plan never touches merqo or the consent model — vendor-side gate
  only.
