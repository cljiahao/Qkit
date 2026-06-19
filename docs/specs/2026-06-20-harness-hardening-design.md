# Harness Hardening & Project Governance — Design

**Date:** 2026-06-20
**Status:** Approved (brainstorming)
**Author:** Clarence + Claude

## Problem

QKit's AI harness, tooling, and security posture grew organically. Most
infrastructure exists (vitest/playwright/stryker, eslint, prettier+husky,
CHANGELOG, CI, hooks, two project skills) but with gaps:

- Permissions are **deny-only** — every Bash/Edit prompts, slowing work.
- No CI security scanning (secrets, SAST, dependency vulns).
- No defense-in-depth test for the core auth model (RLS cross-vendor isolation).
- Project skills lack scoped `allowed-tools` and aren't aligned to the
  templateCentral skill conventions.
- Docs carry framework branding (`docs/superpowers/`) and there's no durable
  "constitution" capturing the inviolable rules.
- `harness.json` records `templatecentral_version: 5.0.0` while the installed
  plugin is `4.2.0` (drift).

This is **hardening + formalizing**, not greenfield. Goal: a maximally
productive, fully-covered, self-documented harness.

## Goals

1. Maximally permissive agent permissions — deny only secrets + irreversible ops.
2. Full CI security coverage: secret scanning, SAST, dependency vulns, RLS isolation.
3. Project-local skills, tightly scoped, following templateCentral conventions.
4. A durable `constitution.md` of inviolable rules; de-branded docs layout.
5. Correct version metadata; documented test/lint/format matrix.

## Non-Goals (YAGNI)

- Vendoring external plugin skills (superpowers/caveman/templateCentral stay plugins).
- semgrep (CodeQL covers SAST).
- Branch protection / multi-contributor process (solo; deferred per memory).
- Dependabot **version** updates (security-only — version bumps were dropped as noise).

---

## A. Permissions — `.claude/settings.json`

Add an `allow` list of **bare tool names** (auto-approve common work) plus a
`deny` list for secrets and irreversible operations. Existing hooks unchanged.

### Precedence (confirmed via Claude Code docs)

`deny` > `ask` > `allow`. **Deny always wins; specificity does NOT change order;
deny is enforced even under `bypassPermissions`.** Consequence: you cannot
`deny Read(.env*)` and `allow Read(.env.example)` — deny would win. To whitelist
only `.env.example`, the deny list **enumerates the secret variants** and leaves
`.env.example` un-denied. (`defaultMode: "auto"` is a research-preview flag and
is intentionally NOT used — bare-tool allows are portable and achieve the goal.)

Bash deny is **prefix match, a guardrail not a security boundary** (bypassable
via wrappers like `trash-cli`); it's a circuit-breaker against model error, not
sandboxing. Documented as such in the constitution.

### Resulting `permissions` block

```json
"permissions": {
  "allow": [
    "Bash", "Read", "Edit", "Write", "Grep", "Glob",
    "WebFetch", "WebSearch", "Skill", "Task", "TodoWrite", "NotebookEdit"
  ],
  "deny": [
    "Bash(rm -rf:*)",
    "Bash(rm -fr:*)",
    "Bash(git push --force:*)",
    "Bash(git push -f:*)",
    "Bash(git reset --hard:*)",
    "Bash(git clean -fd:*)",
    "Bash(git clean -fx:*)",
    "Bash(git filter-branch:*)",
    "Bash(git update-ref -d:*)",
    "Read(.env)",
    "Read(.env.local)",
    "Read(.env.*.local)",
    "Read(.env.development)",
    "Read(.env.production)",
    "Read(.env.staging)",
    "Read(.env.test)",
    "Read(./secrets/**)",
    "Edit(.env)",
    "Edit(.env.local)",
    "Edit(.env.development)",
    "Edit(.env.production)",
    "Edit(.env.staging)",
    "Edit(.env.test)",
    "Edit(./secrets/**)"
  ]
},
"skillListingBudgetFraction": 0.02
```

- `.env.example` is **not** denied → readable/editable (the one whitelisted env file).
- Force-push, hard reset, history rewrite, recursive delete, ref-delete are blocked.
- The PreToolUse secret-write hook stays (belt-and-suspenders for any non-enumerated
  `.env.<new>`), as does the `--no-verify` Bash block.

**Residual risk (documented, accepted):** a _newly-named_ `.env.<x>` not in the
list would be readable. Mitigated by: gitignore (`.env`, `.env.local` ignored),
the secret-write hook, and the small fixed set of env files this project uses.

---

## B. Skills — project-local, tightly scoped

Keep skills **in-repo and project-scoped**; do not vendor plugin skills. Align to
templateCentral CONVENTIONS: a registered `SKILL.md` per directory; our skills
have no stack-variants so single-file (2-level) is correct — no reference-file
split needed.

### Changes to existing skills

Add tightly-scoped `allowed-tools` frontmatter:

- `next-verify` → `allowed-tools: "Bash(pnpm *)"`
- `supabase-migrate` → `allowed-tools: "Bash(supabase *), Bash(pnpm *)"`
  (`disable-model-invocation: true` — touches the linked DB; user-invoked only)

### New skills

- **`security-scan`** — run the security suite locally before pushing
  (`gitleaks detect`, `pnpm audit --audit-level=high`). `allowed-tools:
"Bash(gitleaks *), Bash(pnpm *), Bash(npx *)"`.
- **`changelog`** — append an entry under `## [Unreleased]` in CHANGELOG.md
  following Keep-a-Changelog. `allowed-tools: "Read, Edit"`. `argument-hint:
"[Added|Changed|Fixed] <summary>"`.

All four `SKILL.md` bodies stay ≤30 lines, description ≤150 chars (CONVENTIONS §3).

---

## C. Docs reorg + constitution + gitignore

### Layout

- `git mv docs/superpowers/specs docs/specs`
- `git mv docs/superpowers/plans docs/plans`
- Remove the now-empty `docs/superpowers/`.
- This spec already lives at `docs/specs/2026-06-20-harness-hardening-design.md`.

### `docs/constitution.md` (new)

Durable, inviolable principles — the _why-never-change_, distinct from AGENTS.md
(the _how-to-route_). Seeded from AGENTS.md "Rules (always)" + the data model:

1. Authorization lives in **RLS policies**, never app code. Never widen a policy
   to fix a query.
2. Service-role client is **server-only** (Server Actions / Route Handlers).
3. Validate every boundary input with **Zod**. TypeScript strict — no `any`,
   no `@ts-ignore`.
4. No secrets in `NEXT_PUBLIC_*` (build-inlined, browser-exposed).
5. `@supabase/ssr` ↔ `@supabase/supabase-js` versions stay compatible.
6. Permission deny-rules are a guardrail, not a sandbox — never rely on them as
   a security boundary.
7. Schema changes update both `supabase/migrations/` and `src/lib/types.ts`.

### gitignore

- `.superpowers/` (visual companion) stays ignored — confirm present.
- No spec/plan/skill content is ignored — all committed (durable record).

### Reference updates

- `AGENTS.md`: plan-of-record path `docs/superpowers/plans/...` →
  `docs/plans/...`; add a pointer to `docs/constitution.md`.
- Memory `project-qkit.md`: update the plan path.
- Brainstorming spec default for this project: `docs/specs/`.

---

## D. Security scanning

### `.github/workflows/security.yml` (new)

Three jobs, on `push` to main + `pull_request` (+ weekly cron for CodeQL):

1. **gitleaks** — `gitleaks/gitleaks-action@v3` (free for personal-account repos;
   v2 stops working Sept 2026 with Node 20 removal). Scans for committed secrets.
2. **CodeQL** — advanced setup (committed workflow, reproducible — default setup
   is UI-only). `languages: javascript-typescript`. Push + PR + weekly schedule.
3. **dependency audit** — `pnpm audit --audit-level=high` as a hard gate
   (fails on high/critical). Belt-and-suspenders with Dependabot.

### `.github/dependabot.yml` (new)

Security-updates-only via `open-pull-requests-limit: 0` (documented trick that
keeps security PRs flowing while disabling version bumps). Ecosystems: `npm`,
`github-actions`.

### `e2e/rls-isolation.spec.ts` (new)

Defense-in-depth for the auth model: seed two vendors (A, B) with booths+orders;
assert vendor A's authenticated session **cannot** read or mutate vendor B's
booths or orders (RLS denies). Needs a two-vendor seed
(`supabase/seed/rls-isolation.sql` or extend existing seed). This is the one
project-specific security test — it guards the single most important invariant.

---

## E. Test / lint / format / harness — gap close

Existing layers are correct; formalize and document the matrix in
`docs/constitution.md` (or an AGENTS.md "Testing" section):

| Layer         | Tool                            | Scope                            | CI               |
| ------------- | ------------------------------- | -------------------------------- | ---------------- |
| Unit          | vitest `*.test.ts`              | `src/lib` pure logic             | every push/PR    |
| Component     | vitest `*.dom.test.tsx` (jsdom) | React behavior                   | every push/PR    |
| E2E           | playwright                      | auth guard, order lifecycle, RLS | push/PR (subset) |
| Mutation      | stryker (`src/lib`)             | advisory, changed files          | PR only          |
| Type/lint/fmt | `pnpm check`                    | prettier + eslint + tsc          | every push/PR    |

CI gains the new `security.yml`; `ci.yml` adds the `rls-isolation` e2e to the e2e
job (or a dedicated job if it needs the full local Supabase). `verify.sh` remains
the local heavy gate (build + check + test).

---

## F. Version drift

- `harness.json`: `templatecentral_version` `5.0.0` → `4.2.0` (match installed
  plugin). Note: a `/plugin` check reported 5.1.0 available — record the
  _installed/seeded-against_ version, not latest; re-seeding is out of scope.
- CHANGELOG: add an `## [Unreleased]` entry summarizing this harness work.

---

## Acceptance criteria

- [ ] `.claude/settings.json` has the allow+deny block; reading `.env.example`
      does not prompt; reading `.env.local` is denied; `git push --force` is denied.
- [ ] Four project skills carry scoped `allowed-tools`; bodies ≤30 lines.
- [ ] `docs/specs/` and `docs/plans/` exist; `docs/superpowers/` gone; old files
      moved via `git mv` (history preserved).
- [ ] `docs/constitution.md` committed; AGENTS.md + memory references updated.
- [ ] `security.yml` (gitleaks v3 + CodeQL + pnpm audit) and `dependabot.yml`
      (security-only) committed and valid YAML.
- [ ] `rls-isolation.spec.ts` passes against local Supabase (vendor A cannot read
      vendor B).
- [ ] `harness.json` version corrected; CHANGELOG Unreleased entry added.
- [ ] `pnpm check && pnpm test` green.

## Risks

- **CodeQL noise/runtime** on a small repo — triggers are push-to-main + PR +
  weekly cron (matches §D); if PR-run latency annoys, drop the push trigger and
  keep PR + weekly.
- **gitleaks false positives** on `.env.example` placeholders — add a
  `.gitleaks.toml` allowlist for example/dummy values if it fires.
- **RLS e2e flakiness** if seed isn't deterministic — fixed seed file, unique
  vendor emails.
- **Permission deny bypassability** — accepted; it's a guardrail (documented in
  constitution).
