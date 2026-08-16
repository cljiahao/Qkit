# Shared Plan Comparison Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the duplicated feature-comparison grid on qkit's and
loopkit's `/dashboard/plan` pages into a new `@merqo/ui` component,
`PlanComparisonTable`, and migrate qkit's own page onto it. This plan
builds the shared component (in `merqo-ui`) as part of Task 1 — loopkit's
own sibling plan only needs to consume the already-published version.

**Spec:** `docs/superpowers/specs/2026-08-16-shared-plan-comparison-table-design.md`

## Global Constraints

- `PlanComparisonTable`'s tier count must not be hardcoded anywhere in
  its implementation — verify it actually renders correctly with 2 tiers
  (loopkit's shape) and 3 (qkit's), not just the one this plan migrates
  first.
- The migrated qkit page's visible output (column order, check/dash
  rendering, row order) must be pixel-equivalent to what it replaces —
  this is a refactor, not a redesign.
- TypeScript strict, no `any`.
- Work on a feature branch, never commit directly to `main`.
- Run `pnpm check && pnpm test && pnpm build` before opening the PR (both
  repos).

---

### Task 0: Branch setup

In `merqo-ui`:

```bash
git fetch origin main
git checkout -b feat/plan-comparison-table origin/main
```

In `qkit` (separate branch, same name is fine, different repo):

```bash
git fetch origin main
git checkout -b feat/plan-comparison-table origin/main
```

Confirm `pnpm test` passes on baseline in both before proceeding.

---

### Task 1: Build `PlanComparisonTable` in `merqo-ui`

**Files (in `../merqo-ui`):** `src/plan-comparison-table.tsx`,
`src/plan-comparison-table.test.tsx`, `src/index.ts` (export)

- [ ] Failing tests first: renders one header column per tier plus the
      leading "Feature" column; a boolean-`true` cell renders a check
      icon, `false` renders a muted dash, a string value renders as
      plain centered text; rows render in input order; works correctly
      at both 2 tiers and 3 tiers (don't just test one count).
- [ ] Implement per the spec — computed `gridTemplateColumns` inline
      style, not a Tailwind arbitrary-value class.
- [ ] Export from `src/index.ts`.
- [ ] Bump `package.json` version (minor — new export), run
      `pnpm test && npm run typecheck`, commit, push, open a PR, poll CI
      (`gh pr checks <N> --watch`, block on it, no monitor exists), merge.
- [ ] Tag the merged commit (`git tag vX.Y.0 <sha> && git push origin vX.Y.0`).

### Task 2: Migrate qkit's plan page

**Files:** `package.json` (bump `@merqo/ui`), `src/app/dashboard/plan/page.tsx`,
its existing test

- [ ] Bump `@merqo/ui` to the new tag, `pnpm install`, confirm
      `node_modules/@merqo/ui/dist/index.js` actually exports
      `PlanComparisonTable` (same verification step used for the earlier
      kit-family domain fix in this repo — confirm the built dist, don't
      just trust the version bump).
- [ ] Failing tests first (if a test covers the comparison grid,
      re-target its assertions at `PlanComparisonTable`'s rendered output
      rather than the deleted local markup — same visible behavior).
- [ ] Replace the local `FEATURES`-rendering JSX + local `Cell` with
      `PlanComparisonTable`, per the spec's exact prop shape. Delete the
      now-unused local `Cell` function.
- [ ] Commit: `feat: use the shared PlanComparisonTable component on the plan page`.

### Task 3: Docs

**Files:** `AGENTS.md` or `src/app/dashboard/plan/README.md` (whichever
already documents this page), `CHANGELOG.md`

- [ ] Note the migration and the new `@merqo/ui` dependency version.

### Task 4: Verification gate

- [ ] `pnpm check && pnpm test && pnpm build`.
- [ ] Push, PR, poll CI green (`gh pr checks <N> --watch` — block on it
      yourself, no monitor exists), squash-merge.

## Self-Review Notes

- Spec coverage: shared component (Task 1), qkit migration (Task 2),
  docs (Task 3), verification (Task 4).
- Task 1's tests explicitly cover both tier counts this session's two
  real consumers need, not just qkit's own 3-tier case — loopkit's own
  follow-up plan depends on the 2-tier case already working.
- This plan does not touch paykit or stockkit — confirmed out of scope
  by the spec's own research, not silently expanded here.
