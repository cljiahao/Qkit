# Project audit, 2026-10-07

Review base: `45e10d4502e83b908887ca0fa4433ba4ebb47add`. Changes are local and
uncommitted. No hosted database, deployment, real environment file or credentials
were inspected. This is a source review with regression tests, not a penetration
test or a guarantee that all defects have been found.

## Scope and evidence

The [file inventory](2026-10-07-file-inventory.md) covers all 780 files tracked at
the start, including 424 non-vendored JavaScript/TypeScript files. Every path has
a role/disposition. Static import analysis identified one removable module;
framework routes, public assets, SQL history and operating documentation were
assessed by their consumers rather than import counts alone. Historical designs
and binary/generated assets were inventoried, not exhaustively reviewed line by
line. Dependencies and generated build output were excluded from source review.

Detailed evidence and scoped inventories:

- [Database, RPCs, grants, seeds and RLS](2026-10-07-database-review.md).
- [Customer, authentication and integrations](2026-10-07-customer-security-review.md).
- [Vendor/admin UI, business logic and realtime](2026-10-07-vendor-ui-review.md).
- [Approved governance changes](2026-10-07-harness-proposal.md).

The second sweep crossed ownership boundaries and challenged the first patches.
It caught missed UPDATE events during realtime reconciliation, duplicate INSERTs,
offset paging against a changing active set, payment-return/cancellation states,
scanner exception recovery, and OCR amount substring matching/worker cleanup.
These received targeted regressions. Review did not end at a clean import graph.

## Changes prepared

### Authorization and trust boundaries

- Customer collection changes lifecycle only; it cannot confirm payment or stamp
  paid_at. Shared support-message updates are restricted to qkit.
- Migration 0095 restricts order-number allocation, direct rate-limit execution,
  vendor plan INSERTs and server-owned printer identifiers. It restores missing
  legitimate column/service privileges without widening vendor RLS.
- Public menu projections omit nested private costs. QR/walkup option validation
  shares a private SQL helper; direct feedback calls are rate-limited in SQL.
  Paid QR stock checks acquire the same booth row lock used by competing orders.
- Production seed reuse cannot transfer an existing booth to another vendor.
- Direct analytics INSERTs are revoked; the bounded, validated server action
  owns writes. Standalone order completion tolerates an absent Merqo metric
  function while preserving installed integrations' transactional behavior.
- The service-only application limiter no longer exposes arbitrary bucket writes
  through a publicly callable RPC. Failure logs omit potentially private keys.
- Approved hooks normalize Windows paths, protect secret reads as well as writes,
  ask for governance/workflow writes, and treat quoted injection phrases as
  advisory. Sixteen synthetic tests exercise these boundaries.

### Correctness, latency and maintainability

- Initial subscriptions and reconnects reconcile active orders with keyset
  pagination while retaining newer realtime events. Unknown UPDATEs upsert;
  duplicate INSERTs do not duplicate cards.
- Customer status transitions refresh server-rendered pickup/payment content.
  Undo returns to usable checkout; already placed orders redirect forward;
  cancelled orders cannot display a new payment form. Scanner and walkup failures
  release pending state, and stale menu requests cannot replace current data.
- Vendor order totals and sales summaries read all pages instead of silently
  stopping at the API cap. The public queue filters historical completions in
  SQL before limiting. Shared auth lookups paginate beyond the first 1,000 users.
- Reorders include option surcharges; option statistics use collision-safe keys;
  CSV imports preserve quoted multiline descriptions. OCR matches whole amounts,
  presents a hint rather than payment confirmation, and terminates workers.
- Sort/range selection and booth selectors expose accessible names/state.
- Removed the unused local avatar primitive. Retained route adapters, migration
  history, separate customer/vendor orchestration and tests with real consumers.
- Promoted unused-variable checks to errors while retaining SonarJS complexity,
  commented-code and inline-comment gates. Removed silent success on no tests;
  added an explicit coverage command. Integration tests no longer read `.env.local`
  merely by being collected; they require explicit test-only process variables.
- Updated README, affected directory guides, changelog and stale comments. No new
  framework, repository layer or generalized abstraction was introduced.

## Verification

A mocked application test does not prove the corresponding SQL policy or deployed
integration. Final local verification:

- Focused customer/security regression run: **214 passed across 20 files**.
- `pnpm check`: **passed**, including repository formatting, ESLint and TypeScript.
- `pnpm test:coverage`: **1,567 passed; two opt-in database tests skipped** across
  152 passing test files. Coverage: statements **71.10%**, branches **67.17%**,
  functions **67.76%**, lines **71.69%**. `src/lib` lines: **97.83%**. Two stale
  limiter mocks failed the preceding full run and were corrected before this run.
  Tests emitted two jsdom navigation notices; no failed tests or unhandled errors.
- Coverage gaps are concentrated in server pages/layouts, auth callback/reset
  flows, several administrative/integration routes and real client factories.
  Prioritize auth/session and cross-service behavior tests over raising a blanket
  percentage with trivial rendering assertions. SQL is outside V8 coverage.
- Isolated production build: **passed** (`next build --webpack`, including type
  checking, static generation and tracing). The copy contained only selected
  source/config/assets and used dummy Supabase variables; no application env
  files were copied or loaded. Dependencies were linked to the installed tree.
  This validates the webpack production compiler, not the default Turbopack
  build or live dynamic-route behavior. The pnpm wrapper's attempted reinstall
  was aborted; the existing Next CLI ran directly without changing dependencies.
- Production dependency audit: **zero findings**. Full dependency audit reduced
  from 21 findings to **one high development-only braces advisory**. The reported
  fixed release 3.0.4 was not available from the registry (latest 3.0.3), so it was
  not fabricated or suppressed. Track [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- SQL/pgTAP, two-session stock races and real Supabase E2E remain **unexecuted**:
  Docker's Linux daemon is unavailable. Migration 0095 is prepared, **not applied**.
  The new SQL regression suite contains **46 assertions**; the existing 131-case
  suite now expects direct anonymous analytics writes to be denied.
- Gitleaks is not installed; no history/staged secret-scan success is claimed.
  Secret-file exclusion and synthetic guard tests are not substitutes for it.
- No live device/browser, load benchmark or production latency measurement was
  performed. Performance benefits above describe eliminated work/leaks and
  correctness under pagination, not measured milliseconds.

## Remaining work, in priority order

1. **P1: payment reconciliation and cancel/confirm races.** A paykit success and
   local mirror write are separate transactions. Failures or concurrent cancel
   can leave paid/cancelled or remotely claimed/locally pending states. Resolve
   with cross-kit idempotency, retry/reconciliation and compensation semantics;
   local predicates alone cannot establish atomicity.
2. **P2: admin plan/payment ledger concurrency.** Read/change/insert can duplicate
   ledger rows under concurrent calls. A transactional RPC or durable idempotency
   key needs concurrency tests.
3. **P2: remaining partial reporting.** Merqo metrics/activity and some admin reads
   remain capped/unpaged; event reviews use a latest-500 sample. Move promised
   totals to SQL aggregates and fetch review membership in the database. The new
   deterministic offset helper is not a transactionally consistent snapshot
   during concurrent writes, and large histories cost memory/network.
4. **P2: long-session state.** Midnight baselines/cup counts need a day-boundary
   refresh; exceptionally large public queues remain response-capped. Test clock
   boundaries and disconnects with real Supabase.
5. **P3: action latency and polling.** Notifications/audit calls remain awaited;
   polling can overlap and hidden printer tabs still poll. Measure these paths,
   then use supported post-response work or shared snapshots without losing
   durable side effects. Auth pagination is correct but still scans accounts.
6. **P3: large UI responsibilities and exports.** The board/menu editor/order card
   remain large. Extract independently testable mutation/timer responsibilities
   when changing those flows. Define spreadsheet-formula handling before changing
   CSV content and breaking roundtrips. Do not delete migrations to reduce LOC.

Before rollout, run migration replay plus both pgTAP suites on local Supabase,
the two-session stock races and critical-path Playwright tests. Review the actual
deployed ACLs separately. The approved guard changes also require a human to
regenerate the integrity baseline after commit: the existing verifier hashes
HEAD, not the uncommitted working tree. No hook bypass or baseline rewrite was
performed here.

## Skills and external guidance

Applied templateCentral standards to naming, Zod boundaries, comments and lint
configuration. Its better-auth/Drizzle recipes were intentionally excluded:
qkit's Supabase/RLS architecture is a documented variant. Applied frontend-design
to accessibility, state clarity and existing UI behavior; this was not a visual
redesign. There is no installed standalone README skill; repository documentation
contracts and templateCentral comment guidance supplied that scope instead.

Used project next-verify, changelog and security-scan guidance with explicit
limitations above. Investigation, regression-first fixes, narrow refactoring and
cross-review guidance supported the two sweeps; no new skills were installed.
Installed Next.js data-security documentation informed server/client boundary
review. External references supporting the trust-boundary checks:

- [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): enforce authorization at every reachable boundary.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): RLS and service-role privilege boundaries.
- [Supabase functions](https://supabase.com/docs/guides/database/functions): explicit function execution privileges and security-definer precautions.

These references guide the review; they do not certify this application.
