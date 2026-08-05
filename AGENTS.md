<!-- templateCentral: nextjs@5.14.0 (Supabase variant — NOT better-auth/Drizzle) -->

# AGENTS.md — qkit

> STOP — This project diverges from the stock templateCentral Next.js stack on
> the data layer only. Auth/DB/realtime are **Supabase** (`@supabase/ssr`), not
> better-auth + Drizzle. Authorization is enforced in Postgres via **RLS**, not
> an app repository layer. Runtime matches tc: Next 16, route protection in
> `src/proxy.ts`, and `cookies()`/`headers()`/`params`/`searchParams` are async.

## What qkit is

Vendor booth ordering system. Vendors sign in to manage menus and watch live
orders; customers order from a QR-linked booth page and track status in realtime.

## Stack

Next.js 16 · App Router · Turbopack · TypeScript strict · Tailwind v4 · shadcn/ui
(new-york) · TanStack Query v5 · React Hook Form · Zod · Supabase (`@supabase/ssr`)
Vitest · pnpm 11 · Node ≥24 · deploy target: Vercel

## Commands

```bash
pnpm dev          # dev server — http://localhost:3000
pnpm build        # production build
pnpm test         # run test suite (vitest)
pnpm test:mutation # stryker mutation testing (scoped to src/lib; ~1 min)
pnpm test:e2e     # playwright e2e smoke (needs local Supabase up — see below)
pnpm check        # prettier --check + eslint + tsc --noEmit
pnpm format       # prettier --write
```

E2E (Playwright, `e2e/`) is a small critical-path smoke against a REAL local
Supabase — it covers what the mocked unit/component tests cannot (RLS, the
`proxy.ts` auth guard, the full order lifecycle). To run:

1. Docker running, then `supabase start`
2. apply migrations + the `supabase/seed/coffee-cart.sql` seed
3. `pnpm test:e2e` (auto-starts `pnpm dev`)
   `auth-guard.spec.ts` needs only a booting app; `customer-order.spec.ts` needs
   the coffee-cart seed (the "Kopitiam Cart" booth).

Mutation testing (Stryker) is scoped to `src/lib` — the pure business logic.
Components/actions/supabase clients are excluded (I/O- or DOM-bound, low signal).
**Advisory only** — non-blocking (no CI gate); run on demand when changing
`src/lib` and treat survivors as a review prompt (many remaining are equivalent
mutants). Component behavior is covered by RTL+jsdom tests (`*.dom.test.tsx`),
unit logic by node tests (`*.test.ts`).

## File Layout

```
src/app/                        — app router (pages, layouts, server actions)
src/app/(auth)/                 — login page: email/password sign-in + sign-up; Google OAuth via src/app/auth/callback
src/app/dashboard/              — vendor dashboard (realtime order board)
src/app/order/[boothId]/        — customer menu + cart + placeOrder action
src/app/order/[boothId]/[orderNumber]/ — live order status page
src/proxy.ts                    — Supabase session refresh + /dashboard guard (Next 16)
src/lib/supabase/               — browser / server / service clients + mw helper
src/lib/types.ts                — DB types (mirror of supabase/migrations)
src/lib/schemas.ts              — Zod schemas for forms + actions
src/components/ui/              — shadcn primitives (CLI-managed, do not hand-edit)
src/hooks/use-realtime-orders.ts — Supabase realtime subscription
supabase/migrations/            — SQL schema + RLS + realtime publication
```

## Data model

- `vendors` (id = auth.users.id), `booths` (JSONB `menu_items`),
  `orders` (JSONB `items`, `order_status` enum: pending→confirmed→preparing→ready→completed, + cancelled).
- RLS: a vendor sees/edits only their own `vendors` row, their own `booths`,
  and `orders` whose `booth_id` belongs to them. Active booths are publicly
  readable (customer ordering). Anyone may INSERT an order. The customer status
  page reads via the **service-role client** (bypasses RLS) — server-only.

## Rules (always)

- TypeScript strict — no `any`, no `@ts-ignore`.
- Validate all user input with Zod at every boundary (forms + server actions).
- Authorization lives in **RLS policies**, not in app code. Never widen a policy
  to "fix" a query — fix the query or the session instead.
- Use the **service-role client only** in Server Actions / Route Handlers, never
  in client components. It bypasses RLS.
- No secrets in `NEXT_PUBLIC_*`. `NEXT_PUBLIC_SUPABASE_*` are inlined at build —
  rebuild after changing them.
- `@supabase/ssr` and `@supabase/supabase-js` versions must stay compatible
  (currently ssr 0.10.x ↔ supabase-js 2.48.x — check package.json, not this
  number, since both get bumped) or every query degrades to `never`.
- After editing the schema, update both `supabase/migrations/` and `src/lib/types.ts`
  (or run `supabase gen types typescript` once the CLI is installed).

## Skills

### Project skills — check here first (`.claude/skills/`)

| Skill               | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `/next-verify`      | typecheck + lint + test in one pass                          |
| `/supabase-migrate` | apply `supabase/migrations` + regenerate types (safety gate) |
| `/security-scan`    | local secret scan (gitleaks) + dependency audit before push  |
| `/changelog`        | append a Keep-a-Changelog entry under `[Unreleased]`         |

### templateCentral plugin skills

templateCentral has **no Supabase support** (auth=better-auth, db=Drizzle/Kysely/Mongoose,
no realtime). Use only the stack-agnostic ones here:
| Skill | When to use |
|-------|-------------|
| `templatecentral:standards` | naming/validation/drift-check (expect Supabase-vs-tc drift findings) |

Do **not** run `templatecentral:add (auth)` or `(database)` — they install
better-auth / Drizzle and will break RLS + realtime.

**5.0 → 5.7 review (2026-07-03):** version marker + `harness.json` bumped to 5.7.0.
Deliberately **not** adopted (Supabase-variant / bespoke-harness divergence, each
a conscious choice — don't let a future drift-check "fix" them):

- **pino route-logging enforcement** (5.7) — pino was removed as an unused dep;
  qkit's API surface (one route) logs via `console.error`, not the tc `withLogging`
  wrapper. No `scripts/check-route-logging.mjs` gate.
- ~~**lefthook** (5.2) — qkit uses husky + lint-staged; not migrating the git-hook system.~~
  Superseded — see the 2026-07-24 entry below.
- **tc CI gates + `.harness-base`** (5.2–5.3) — qkit has its own CI
  (`.github/workflows/{ci,security}.yml`); no harness re-sync base exists (seeded
  pre-5.3), so `migrate` Phase-5 3-way merge is N/A. (`verify-harness.sh` itself
  _was_ adopted as part of the 2026-07-24 lefthook migration, without the
  `.harness-base` 3-way-merge machinery.)
- **password min-12 on the login schema** (5.5) — would lock out existing 8-char
  sign-ins; Supabase Auth config owns the real policy.

Adopted: build-artefact `Read` denies in `settings.json` (context hygiene, 5.4).

**Cherry-picked 5.8 comment gate (2026-07-10):** not a full 5.7→5.9 re-review,
just this one delta. `no-inline-comments` flipped `warn` → `error` (own-line
comments only, ignore-pattern for `eslint-`/`@ts-`/`prettier-`/coverage
directives) and `sonarjs/no-commented-code` added at `error` (blocks
committing dead commented-out code) — `eslint-plugin-sonarjs` is a new
devDependency. Both hard-block `pnpm check`/CI now. Test files and `scripts/`
keep `no-inline-comments` off (unchanged rationale: table-driven fixtures read
better with a trailing note).

**Unused-vars gate + harness permission fix (2026-07-16):** neither `tsconfig.json`
(no `noUnusedLocals`/`noUnusedParameters`) nor `eslint-config-next`'s own
`next/typescript` block flagged unused vars/imports — a real gap, found by
diffing against templateCentral 5.11's scaffold `eslint.config.mjs`. Added
`@typescript-eslint/no-unused-vars: 'warn'` (`^_`-prefix ignore pattern,
matching this project's existing convention), reusing the `@typescript-eslint`
plugin instance `eslint-config-next` already registers rather than adding a
second direct dependency on it. Caught one real dead import on first run
(`OrderStatusBadge` in the order-status page), now removed.

**Permission-rule correction (2026-07-17):** the 2026-07-16 entry above added
separate `Write(...)` ask-rules alongside `Edit(...)` for the governance files,
believing `Edit`/`Write` were independently matched. Verified this is wrong:
the permission-rule matcher covers `Write(path)` under `Edit(path)` — only
`Edit(...)` is needed. The redundant `Write(...)` entries were removed from
`.claude/settings.json`, back to `Edit(...)`-only.

**Lefthook migration (2026-07-24):** superseded the 2026-06-05 husky decision;
migrated the git-hook layer to lefthook and split the previously-inline
`node -e` one-liners in `.claude/settings.json` into standalone
`.claude/hooks/*` script files, to match the other 3 built-out kits'
(loopkit/stockkit/paykit) and merqo's harness architecture. `husky` +
`lint-staged` and `.husky/` are gone; `scripts/check-readme-freshness.mjs`
was replaced by `.lefthook/readme-coupling.sh` (same non-blocking nudge,
now run as a lefthook pre-commit command instead of a husky script).
Net-new: `lefthook.yml`, `.lefthook/`, `.gitleaks.toml`,
`.claude/verify-harness.sh` (harness integrity sensor, wired into
`pre-push` and CI) and `.claude/regen-harness.sh` (human-run-only baseline
rewrite). This also picks up the security hardening already reflected in
the hook scripts themselves: the `LEFTHOOK=0`/`core.hooksPath=` bypass block,
a broadened `--no-verify` regex, protected-branch/force-push/guard-file-checkout
guards, an `.env*` catchall deny (was previously just the specific `.env.<env>`
variants), and OWASP LLM02 credential-leak detection in the prompt guard.
`SubagentStop` is a net-new hook (qkit previously had none). `harness.json`'s
`templatecentral_version` marker moved 5.7.0 → 5.11.0 — the 5.8–5.11 feature
deltas (comment gate, README governance/richReadme, unused-vars gate) were
already reviewed in the entries above; this migration closes the one
remaining architectural gap (the git-hook layer + hook-script-file layout).

**husky migration (2026-08-01):** superseded the 2026-07-24 lefthook decision
— lefthook's `lefthook.exe` is unsigned and Windows Smart App Control blocks
it unconditionally on this machine (Code Integrity events, "did not meet the
Enterprise signing level requirements"), which has no signed-binary
workaround (winget's `evilmartians.lefthook` package ships the identical
unsigned upstream binary). husky v9 has no native binary in its execution
path. Same enforcement rigor (every lefthook check ported into `.husky/*`
shell scripts); the Windows-path-with-space workarounds
(`.lefthook/commit-msg/commit-msg.sh`'s argv-rejoin wrapper) are deleted, not
ported — husky has no equivalent templating bug to work around. This was a
cross-repo decision (qkit/loopkit/stockkit/paykit/merqo all made the same
lefthook→husky call, not a qkit-local one) — see the workspace-level design
doc at `../docs/superpowers/specs/2026-08-01-lefthook-to-husky-migration-design.md`,
outside this repo's own git tree, alongside the other cross-kit specs.

## AI Harness

PreToolUse: `protect-files.sh` hard-blocks (exit 2) writes to `.env*` (except
`.env.example`/`.env.default`), CI/CD pipeline files, secrets directories, and
cert/credential files, and asks for human approval (via a `permissionDecision`
JSON payload) on other protected files (`AGENTS.md`/`CLAUDE.md`,
`docs/CONSTITUTION.md`, `.claude/settings.json`, `.claude/hooks/*`,
`.claude/agents/*`, `.mcp.json`, the harness manifest/verifier/regen scripts,
`Dockerfile`, `.gitleaks.toml`, `.husky/*`); `block-no-verify.sh`
blocks `--no-verify`/`-n` on `git commit`, `HUSKY=0`/`HUSKY_SKIP_HOOKS`/
`core.hooksPath=` bypasses, direct commits to `main`, force-push to a protected
branch, `git checkout/restore` on guard-layer files, and recursive-force `rm`
on source directories. App code, skills, specs, and `.github/workflows/`
unrestricted (CI is reviewed code; the workflow-write block was lifted 2026-06-16).
UserPromptSubmit: `user-prompt-guard.cjs` pattern-checks prompts for injection
phrases (OWASP LLM01) and embedded credentials — AWS keys, GitHub PATs,
Anthropic API keys, PEM blocks, DB/broker URLs (OWASP LLM02); exit 2 blocks.
PostToolUse: `post-edit-typecheck.sh` runs incremental `tsc --noEmit` after
every Edit/Write to a `.ts`/`.tsx` file (feedback-only); `skill-usage-log.sh`
logs every skill invocation to `.claude/skill-usage.log`.
PostToolUseFailure: `post-tool-failure.sh` surfaces the failed tool's name/error
to stderr so the model can self-correct; always exits 0.
Stop: `stop-checks.sh` exits 0 when `stop_hook_active` (no re-entry loop); else
runs the test suite, exit 2 feeds failures back, exit 0 on pass.
SubagentStop: `subagent-stop.sh` type-gates a subagent's uncommitted `.ts`/`.tsx`
changes before it can hand back control.
SessionStart (startup|resume|clear|compact): `session-context.sh` re-injects
the first 30 lines of this file, all of `docs/CONSTITUTION.md`, and a fixed
list of always-on invariants — the documented inject path (PostCompact stdout
is ignored, cannot inject context).
`permissions`: max-privilege — bare-tool `allow` (Bash/Read/Edit/Write/web/Skill/
Task) so common work doesn't prompt; `deny` covers secret reads/edits (`.env*`
catchall plus the specific `.env.<env>` variants, `./secrets/**`/`./.secrets/**`
— `.env.example` is the one whitelisted env file), build-artefact reads
(`node_modules`, `.next`, `dist`, `coverage`, `.turbo`, `*.tsbuildinfo`, root
and `./**/` forms), and irreversible ops (`rm -rf`, `git push --force`/`-f`,
`git reset --hard`, `git clean -fd/-fx`, `git filter-branch`, ref-delete). `ask`
gates `Edit(...)` (covers both Edit and Write calls) on the medium-security
governance files: `AGENTS.md`,
`CLAUDE.md`, `docs/CONSTITUTION.md`, `.claude/harness.json`, `.claude/settings.json`,
`.claude/settings.local.json`. Deny always wins over ask/allow (enforced even
under bypass); it's a guardrail, not a sandbox — prefix-matched and
wrapper-bypassable. CI security: `.github/workflows/security.yml`
(gitleaks v3 + CodeQL + `pnpm audit`) and `.github/dependabot.yml` (security-only).
Git hooks (husky): `pre-commit` runs format/lint (`prettier`+`eslint --fix`
on staged `.ts/.tsx/.js/.mjs/.cjs`), format-docs (`prettier --write` on staged
`.json/.md/.css`), `tsc --noEmit`, a frozen-lockfile install check, a gitleaks
secret-scan on staged files (if gitleaks is installed), and the README-coupling
nudge (`.husky/lib/readme-coupling.sh`); `commit-msg` enforces Conventional
Commits (`.husky/lib/commit-msg-check.sh`); `pre-push` runs
`.claude/verify-harness.sh` (integrity check) plus `pnpm run check && pnpm
test`. Config: `.husky/` (plain shell hook files, no native binary — migrated
2026-08-01 off lefthook, whose unsigned `lefthook.exe` Windows Smart App
Control blocks unconditionally; a cross-repo decision, see the
workspace-level design doc at
`../docs/superpowers/specs/2026-08-01-lefthook-to-husky-migration-design.md`,
outside this repo's own git tree).
Secret-scan ruleset: `.gitleaks.toml`.
RLS isolation: `supabase/tests/rls.test.sql` via `supabase test db`.
Project skills (directory form, `<name>/SKILL.md`): `.claude/skills/` |
Manifest: `.claude/harness.json`

## Skills Security

- Review `SKILL.md` before installing any third-party skill — treat skills like packages.
- Scope `allowed-tools:` to the minimum (e.g. `Bash(git *)` not `Bash`).
- Never install skills that hardcode secrets or make unlisted outbound calls.

## Project-Specific Notes

- **Inviolable rules:** `docs/CONSTITUTION.md` (RLS-is-authz, service-role
  server-only, Zod boundaries, no secrets in `NEXT_PUBLIC_*`, deny-rules are a
  guardrail not a sandbox). Read it before changing auth, schema, or the harness.
- Plan of record: `docs/superpowers/plans/2026-06-05-qkit-core.md` (specs in
  `docs/superpowers/specs/`; roadmap/audit/task-registry meta docs in `docs/meta/`).
- Migrated 15→16 on 2026-06-05 (`middleware.ts`→`proxy.ts`, `next lint`→eslint CLI).
<!-- [[post-harness]] — reserved for trace capture and meta-harness integration -->
