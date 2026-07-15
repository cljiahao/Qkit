# public → qkit Schema Namespace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every qkit database object out of the `public` schema into a dedicated `qkit` schema, so the shared Merqo Supabase project reads `merqo.* / qkit.* / <future-kit>.*` — self-documenting ownership per kit.

**Architecture:** qkit keeps ONE schema (`qkit`) holding all its tables, enums, functions, policies, and its realtime publication membership. The move is a scoped textual rewrite of the migration set (`public.` → `qkit.`), not an in-place `ALTER SCHEMA RENAME` — the DB is being reset fresh (zero vendors), so there is no data to preserve and a clean rewrite avoids the partial-breakage of rename (plpgsql bodies, `search_path` pins, publication refs all resolve correctly from migration 1). The app layer pins the supabase-js default schema to `qkit`; Merqo still reads qkit only over HTTP (`/api/merqo/metrics`), so this move is invisible across the product boundary.

**Tech Stack:** Supabase (Postgres + PostgREST + Realtime), `@supabase/ssr`, Next.js 16, TypeScript strict, Vitest, pgTAP.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Authorization stays in RLS policies, never widened to "fix" a query (constitution).
- Service-role client server-only.
- `auth.*` and `extensions.*` schemas are Supabase-managed — DO NOT touch or rename them. Only `public` → `qkit`.
- Local Supabase CLI cannot spawn on this Windows box: migrations, pgTAP (`supabase test db`), and Playwright e2e are verified in CI, not locally. The local gate is `pnpm check` (prettier + eslint + tsc) and `pnpm test` (vitest). Every task's "verify" reflects this split.
- `search_path = public` → `search_path = qkit` is a 1:1 rewrite (these functions reference only pg_catalog built-ins + own-schema objects; `extensions` was never in their pinned path).
- Do NOT rewrite `graphql_public` (it is a distinct schema, not `public.`), `auth.`, or `extensions.`.
- Additive to the Merqo HTTP contract: no change to `/api/merqo/metrics` response shape.

---

### Task 1: Rewrite migrations `public.` → `qkit.`

**Files:**

- Create: `supabase/migrations/0000_create_qkit_schema.sql`
- Modify: all `supabase/migrations/00NN_*.sql` that reference `public.` (46 of 47 files) and the 20 with `SET search_path = public`
- Modify: `supabase/config.toml:13` (`schemas`) and `:15` (`extra_search_path`)

**Interfaces:**

- Produces: a `qkit` schema containing every qkit table/enum/function/policy; realtime publication `supabase_realtime` includes `qkit.orders`; `anon`/`authenticated`/`service_role` hold `USAGE` on `qkit` plus the same per-table grants the migrations already assert (the deliberate revokes on internal tables/functions carry over unchanged).

- [ ] **Step 1: Create the schema-bootstrap migration**

`supabase/migrations/0000_create_qkit_schema.sql`:

```sql
-- qkit lives in its own schema so the shared Merqo project reads merqo.* / qkit.*
-- per kit. auth.* and extensions.* are Supabase-managed and untouched.
CREATE SCHEMA IF NOT EXISTS qkit;

-- Data API roles need USAGE on the schema before any table grant resolves.
-- Per-table/per-function grants (and the deliberate revokes) stay in the
-- migrations that own each object.
GRANT USAGE ON SCHEMA qkit TO anon, authenticated, service_role;
```

- [ ] **Step 2: Rewrite `public.` → `qkit.` across the migration bodies**

Scoped replace in every `supabase/migrations/00NN_*.sql` (NOT 0000, already correct). Replace the token `public.` with `qkit.` and `SET search_path = public` with `SET search_path = qkit`. Leave `graphql_public`, `auth.`, `extensions.`, and the publication name `supabase_realtime` untouched.

Run (git-bash):

```bash
cd /c/Users/Clarence/Desktop/Coding/qkit
for f in supabase/migrations/00[0-9][0-9]_*.sql; do
  case "$f" in *0000_create_qkit_schema.sql) continue;; esac
  sed -i \
    -e 's/\bpublic\./qkit./g' \
    -e 's/SET search_path = public/SET search_path = qkit/g' \
    "$f"
done
```

- [ ] **Step 3: Verify no stray `public.` app-object refs remain**

Run:

```bash
grep -rn "public\." supabase/migrations/ | grep -v "graphql_public"
```

Expected: only comment lines are acceptable; NO remaining `public.<table>`, `public.<function>`, `SET search_path = public`, or `ADD TABLE public.` in executable SQL. Manually inspect each hit; fix any missed by the `\bpublic\.` boundary (e.g. `"public".` quoted identifiers, if any).

- [ ] **Step 4: Confirm the realtime publication + enum types moved**

Run:

```bash
grep -rn "supabase_realtime\|order_status\|payment_status" supabase/migrations/0001_initial_schema.sql
```

Expected: `ALTER PUBLICATION supabase_realtime ADD TABLE qkit.orders;` and `CREATE TYPE qkit.order_status`. If any enum/publication ref still says `public.`, fix it.

- [ ] **Step 5: Update `config.toml` exposed schemas + search path**

`supabase/config.toml`:

```toml
# line 13
schemas = ["qkit", "graphql_public"]
# line 15 — qkit replaces public; keep extensions for the request search path
extra_search_path = ["qkit", "extensions"]
```

Leave `auto_expose_new_tables = false` as-is (already correct; it is what stops the CLI re-granting `authenticated` over qkit's revokes).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/ supabase/config.toml
git commit -m "refactor(db): move all objects from public to qkit schema"
```

Verification note: `supabase db reset` + pgTAP run in CI (cannot spawn locally). This task's local check is Step 3/4 grep inspection; the DB-level proof is Task 5 (pgTAP) executed by CI.

---

### Task 2: Point the realtime subscription at the `qkit` schema

**Files:**

- Modify: `src/hooks/use-realtime-orders.ts:80` (`schema: "public"`)
- Test: `src/hooks/use-realtime-orders.dom.test.tsx` if it asserts the channel config; otherwise the tsc + existing dom test is the guard.

**Interfaces:**

- Consumes: the `qkit.orders` publication membership from Task 1.
- Produces: the vendor board subscribes to `postgres_changes` on schema `qkit`.

- [ ] **Step 1: Change the subscription schema**

In `src/hooks/use-realtime-orders.ts`, the `.on("postgres_changes", { … })` filter:

```ts
        {
          event: "*",
          schema: "qkit",
          table: "orders",
          filter: `booth_id=in.(${boothIds.join(",")})`,
        },
```

(Keep the surrounding `event`/`table`/`filter` exactly as they were; only `schema: "public"` → `schema: "qkit"`.)

- [ ] **Step 2: Typecheck + run the hook's tests**

Run:

```bash
pnpm check && pnpm test -- use-realtime-orders
```

Expected: PASS. If a dom test hardcodes `schema: "public"` in an assertion, update it to `"qkit"`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-realtime-orders.ts src/hooks/use-realtime-orders.dom.test.tsx
git commit -m "refactor(realtime): subscribe on qkit schema"
```

---

### Task 3: Pin supabase-js default schema to `qkit` (clients + types)

**Files:**

- Modify: `src/lib/types.ts:81` (`public:` → `qkit:`) and `:553-560` (type aliases)
- Modify: `src/lib/supabase/client.ts` (browser client)
- Modify: `src/lib/supabase/server.ts` (server + service clients)
- Modify: `src/lib/supabase/middleware.ts` (session client — schema optional but set for consistency)

**Interfaces:**

- Consumes: the `qkit` schema from Task 1.
- Produces: every supabase-js call resolves unqualified table names in `qkit`; `Database["qkit"]["Tables"][…]` typing throughout.

- [ ] **Step 1: Rename the schema key in the generated types**

In `src/lib/types.ts`, change the top-level `Database` schema key `public:` (line 81) to `qkit:`, and update every `Database["public"]["Tables"][…]` alias (lines 553-560+) to `Database["qkit"]["Tables"][…]`.

Run:

```bash
grep -rn 'Database\["public"\]' src/
```

Expected after edit: no matches (all now `["qkit"]`). Fix any occurrences outside `types.ts` too.

- [ ] **Step 2: Set the default schema + schema generic on the browser client**

`src/lib/supabase/client.ts`:

```ts
export function createClient() {
  return createBrowserClient<Database, "qkit">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { db: { schema: "qkit" } },
  );
}
```

(Match the existing env-var names/args in the file; only add the `<Database, "qkit">` generic and the `{ db: { schema: "qkit" } }` options object.)

- [ ] **Step 3: Set it on the server + service clients**

In `src/lib/supabase/server.ts`, add the same `<Database, "qkit">` generic and `db: { schema: "qkit" }` to BOTH `createServerClient` and `createServiceClient` factories, merging into any existing options object (cookies config stays). In `src/lib/supabase/middleware.ts`, add `db: { schema: "qkit" }` to the client used for session refresh.

- [ ] **Step 4: Typecheck the whole app**

Run:

```bash
pnpm check
```

Expected: PASS with zero `tsc` errors. A missed alias or a table name PostgREST can't resolve under the new schema generic surfaces here as a type error.

- [ ] **Step 5: Full test suite**

Run:

```bash
pnpm test
```

Expected: PASS. The mocked supabase clients in tests are schema-agnostic; failures here mean a test asserted the old `public` typing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/supabase/
git commit -m "refactor(supabase): default client schema to qkit"
```

---

### Task 4: Update pgTAP RLS test references

**Files:**

- Modify: `supabase/tests/rls.test.sql`

**Interfaces:**

- Consumes: the `qkit` schema from Task 1.

- [ ] **Step 1: Rewrite `public.` → `qkit.` in the RLS test**

Run:

```bash
sed -i -e 's/\bpublic\./qkit./g' supabase/tests/rls.test.sql
grep -n "public\." supabase/tests/rls.test.sql | grep -v graphql_public
```

Expected: no executable `public.` refs remain (comments OK). Verify `set search_path` / `set role` helpers and any `tests.` pgTAP helper schema are untouched (only qkit table refs move).

- [ ] **Step 2: Commit**

```bash
git add supabase/tests/rls.test.sql
git commit -m "test(rls): reference qkit schema"
```

Verification note: `supabase test db` runs in CI (cannot spawn locally). Inspection in Step 1 is the local gate.

---

### Task 5: Verify end-to-end + update the runbook doc

**Files:**

- Modify: `docs/superpowers/plans/2026-07-06-public-to-qkit-schema.md` (this file — check the hosted-apply checklist below)
- Reference: `docs/specs/2026-07-05-merqo-metrics-consumption.md` (already states qkit lives in its own schema — confirm wording still accurate)

- [ ] **Step 1: Local gate**

Run:

```bash
pnpm check && pnpm test
```

Expected: PASS (prettier + eslint + tsc + vitest).

- [ ] **Step 2: Push branch; confirm CI green**

CI runs: build, migrations apply to a fresh DB, pgTAP RLS, Playwright e2e (customer order + auth guard against the `qkit` schema). All must pass before merge — this is the real proof the schema move works, since it cannot run locally.

- [ ] **Step 3: Hosted-apply checklist (user-side, AFTER merge, on the reset Merqo project)**

Not code — the operator steps to bring the hosted DB to the new state:

1. Reset the DB (wipes the throwaway `public` data): fresh project or `Database → reset`. Nothing to hand-delete.
2. Apply qkit migrations — they now build `qkit.*` (0000 creates the schema first).
3. Apply the Merqo migration (`merqo.*`).
4. Data API → Exposed schemas: set to **`qkit`, `merqo`** (+ `graphql_public`); REMOVE `public` and `extensions` from the exposed list.
5. Data API → **Automatically expose new tables: OFF** (matches the explicit-grant model; stops re-granting over qkit's revokes).
6. Data API → Extra search path: clear it (the client sets `db.schema`); Max rows: leave 1000.
7. Set `MERQO_METRICS_SECRET` (both sides) + qkit's publishable/secret keys in Vercel; redeploy qkit.
8. Seed `merqo.products` (point `metrics_url` at qkit) + `merqo_team`.

- [ ] **Step 4: Commit any doc touch-ups**

```bash
git add docs/
git commit -m "docs: qkit-schema apply runbook"
```

---

## Self-Review

**Spec coverage:**

- Migrations move → Task 1. Realtime → Task 2. Clients+types → Task 3. pgTAP → Task 4. Verify+runbook → Task 5. Data API exposure (schemas, tables via grants, auto-expose, search path, max rows) → Task 1 (config.toml) + Task 5 Step 3 (hosted). Merqo HTTP contract unchanged → Global Constraints. ✓
- e2e references: covered by CI in Task 5 Step 2; no `public.` literals in `e2e/` (grep returned only `rls.test.sql`). ✓

**Placeholder scan:** every step has concrete commands/edits; no TBD/TODO. ✓

**Type consistency:** `Database["qkit"]["Tables"]` used in Task 3 matches the `qkit:` key rename in the same task; `schema: "qkit"` in Task 2 matches the publication `qkit.orders` in Task 1; `createServiceClient`/`createServerClient` names match the existing `server.ts` exports referenced by the Merqo route. ✓

**Open risk to watch during execution:** if any migration used a bare unqualified name relying on the old `public` being first on the search path (rather than explicit `public.`), the rewrite won't have caught it — Task 5 CI (fresh DB apply) is the backstop. If CI fails on an unresolved relation, qualify it `qkit.<name>` in the owning migration.
