# Merqo product sweep, October 9

## Publication and upstream integration

The measurements below are the initial local audit checkpoint, before PR
publication and Qkit's subsequent integration of upstream main at `1e6d8f8`.
Main later advanced to `730e511`; that second integration retains the new
ticket-number, payment-prefill and touch-control behavior, with 208 focused
regressions passing. Qkit PR #196 is open; CI verification of the second
integration remains required.
The integrated Qkit production build passes in a secret-free curated copy.
Its first full run passed 2,056 tests, skipped two opt-in database tests and
identified four stale test fixtures for the availability RPC and stale-order
filter. The corrected fixtures pass 81 focused tests with their assertions
retained. The first integrated full coverage run passes 2,065 tests in 188 suites,
with two opt-in database tests skipped. Statements are 85.36%, branches 82.03%,
functions 82.24% and lines 86.51%; all four gates exceed 80%. The earlier Qkit
figures below remain the initial audit checkpoint.

Qkit now pins the reviewed shared UI commit
`989d934c1cc8d957ff383934debf8ef083b6b6a4`, which delivers safe integer money
parsing, defensive storage URL decoding and image cleanup fixes to its
consumers. Its frozen install passes using pnpm 11.10.0 and an exact archive
build permission. This follows pnpm's
[Git dependency build controls](https://github.com/pnpm/pnpm.io/blob/main/blog/releases/10.26.md);
the permission grants only that reviewed dependency identity.

Publication PRs are Merqo #85, Paykit #121, Stockkit #100, Loopkit #143,
Printkit #28 and merqo-ui #45. Stockkit's CI passes all checks. Merqo and
Paykit's migration and pgTAP checks pass; README follow-up commits are being
published. Printkit's corrected database tests pass 38 assertions across three
suites. Loopkit's standalone CI needs the actual Merqo prerequisite schema;
its prepared workflow pins the reviewed Merqo commit rather than replacing
shared tables with permissive fixtures. Qkit publication verification continues.
These disposable CI databases do not establish production rollout, concurrency
isolation under load, physical printer behavior or authenticated cross-service
integration. No PR has been merged and no production migration has been applied.

## Initial local audit checkpoint

The scope is qkit, merqo, paykit, stockkit, loopkit, printkit and merqo-ui.
The fresh action review separates vendor fulfillment and its undo from payment
confirmation; completed unpaid orders retain explicit Paykit-backed settlement.
Its 195 focused tests, whole lint, strict types and formatting pass. The latest
full coverage run and secret-free isolated webpack build also pass after this
production change.
Passing tests and aggregate coverage do not certify that a product is
vulnerability-free. The final scoped path inventory contains 4,221 paths at its
checkpoint, including authored files and audit evidence. Production and
nonproduction content ledgers distinguish actual content reads, source changes,
copy provenance and structural artifact checks. Generated logs, lockfiles,
binary assets and audit outputs receive appropriate producer/provenance checks;
4,221 is not a count of manually read text files. Seven secret filenames are
intentionally excluded from content reads. Dependencies, caches, build output
and recordings are outside that scoped enumeration. Independent follow-up
reviews checked security boundaries, duplicate tests, current comments, README
contracts, hidden tooling copies and inventory gaps. They do not constitute two
complete manual reads of every file or establish live database authorization.
Final broad suites and full ESLint/TypeScript checks pass for Merqo, Paykit,
Stockkit and Printkit. Their secret-free isolated Next builds also pass using
webpack, curated source copies and placeholder environment values. This does
not establish the default Turbopack build or live integration behavior.
Qkit's final full suite passes 1,935 tests with two local-database tests skipped.
Coverage is 84.62% statements, 81.14% branches, 81.47% functions and 85.84% lines;
the authored service worker is explicitly collected and reaches 100% in all four
metrics. Whole lint, strict types and formatting pass. Subsequent test-only
assertion and cleanup improvements pass 98 root-owned and 107 agent-owned focused
tests without changing runtime source or test counts. An intervening run failed
coverage because it counted three vendored Tesseract scripts; those exact locked
third-party assets are excluded with byte-comparison provenance recorded.
No authored production module is excluded to reach the threshold. Its latest secret-free
isolated webpack build and rendered light login at mobile/desktop widths also pass; database
and authenticated cross-service behavior remain unverified. Merqo-ui's complete
coverage, lint, type and package-build checks pass.

Loopkit's latest final suite passes 1,453 tests across 210 files with all four
coverage metrics above 80%, including the later test deduplication and eight
dispatcher cases. Its isolated webpack build also passes. Existing customer access now requires saved card
possession; owning-vendor recovery rotates credentials without resetting
progress. Qkit earn's alternate credential path is guarded separately. Exact
card cohorts replace the misleading overview destinations, and a scoped forget
control allows customers to switch on a shared browser. The new-enrollment race
and reciprocal-referral lock inversion found in the independent SQL pass have
staged repairs; their database concurrency behavior is still unverified.

Incoming and outgoing print results carry revision/attempt identity and use
conditional writes. Delayed results cannot settle a newly reclaimed attempt
under the tested application predicates. Physical printers, browser E2E and
firmware rollout remain separate verification. Printkit's missing installed UI
output was restored from its exact locked source revision, without replacing
that dependency with sibling source.

Docker Desktop's Linux engine remains unavailable. The latest disposable
validation snapshot contains 244 migrations and 41 rollback-only SQL test files;
none have been executed against that database. No existing database was reset.
Production dependency audits report zero advisories across all seven products;
the six applications retain a development-only braces advisory. The current
[official advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched release;
the audit metadata suggested a version unavailable at the registry checkpoint. The separate printer
bridge dependency tree also retains eight high findings propagated from braces;
runtime reachability has not been ruled out. No changes have been
committed, pushed, deployed or applied to a live database. Secret files were not
read.

The official Gitleaks 8.30.1 download was checksum-verified. Redacted scans of
all Git refs report zero findings across the seven repositories, with protected
dotenv and credential paths excluded. Curated allowed current files initially
produce 59 generic-key findings: an independent review reconstructs each match
as 58 ledger SHA-256 values and one literal SQL filename. All are metadata false
positives; original scanner exit codes remain recorded and no suppressions were
added. This is not a scan of intentionally excluded secret files or proof that
no credentials exist outside the allowed scope. Evidence is in
`2026-10-09-gitleaks-history-results.json`,
`2026-10-09-gitleaks-working-results.json` and
`2026-10-09-gitleaks-current-finding-classification.json`.

## Measured checkpoints

| Product  | Statements | Branches | Functions | Lines | Verification state                                                                                                                            |
| -------- | ---------: | -------: | --------: | ----: | --------------------------------------------------------------------------------------------------------------------------------------------- |
| qkit     |      84.62 |    81.14 |     81.47 | 85.84 | Final broad suite: 1,935 tests pass, two local DB tests skipped; whole lint/types/format and latest isolated webpack build pass               |
| paykit   |      92.44 |    86.20 |     84.50 | 92.53 | Final broad suite: 820 tests pass; full ESLint and TypeScript pass; SQL runtime validation pending                                            |
| merqo    |      87.72 |    84.83 |     84.51 | 87.77 | Final broad suite: 729 tests pass; full ESLint and TypeScript pass; SQL runtime validation pending                                            |
| stockkit |      90.35 |    83.01 |     85.43 | 91.53 | Final broad suite: 462 tests pass; full formatting, ESLint and TypeScript pass; SQL runtime validation pending                                |
| loopkit  |      85.77 |    82.71 |     82.14 | 86.82 | Latest full suite: 1,453 tests pass; dispatcher coverage and deduplication included; SQL concurrency validation pending                       |
| printkit |      87.76 |    82.22 |     82.80 | 89.24 | Final broad suite: 705 tests pass after assertion improvements and deduplication; full formatting, lint and types pass; isolated build passes |
| merqo-ui |      97.92 |    92.78 |     96.73 | 98.35 | Latest full coverage, strict lint, types and package build pass                                                                               |

Target: at least 80% for all four metrics over production source, including untested
modules. Retained modules must not be excluded merely to reach the target.
Blanket index-file exclusions have been removed so authored dispatchers and utilities
count toward the final denominator. Earlier checkpoints can therefore differ from
the final required measurements.
Independent review has produced additional fixes. File inventories distinguish
classification from actual content review; authored inventory gaps have been
closed at the final join, with generated and protected-path limits recorded. A passing aggregate threshold does not mean every file has 80%
coverage or that database authorization has been tested.

Review guidance used templateCentral's stack-agnostic standards and comment
doctrine, the frontend-design and Impeccable guidance, and project verification,
security, migration and changelog skills. Supabase/RLS contracts were retained;
template auth/database replacements were not applied. Skill-creator guidance
scoped corrections to the Codex skill copies without changing hosted database
approval rules. README contracts and concise intent comments were checked against
current callers; existing hard lint gates cover inline and commented-out code.

Earlier October 8 qkit checkpoint: `pnpm check` passed; its broad V8 run passed explicit 80%
thresholds with 5,448/6,549 statements, 4,010/5,006 branches, 1,248/1,550
functions and 4,940/5,860 lines. No source exclusions or test skips were added.
`git diff --check` is clean. Build/live database validation has not been repeated
for this October 8 snapshot.

Qkit production dependency audit: no known vulnerabilities. Full audit: one high
development-only `braces` advisory (GHSA-vfj7-8cjw-p6xm). Earlier registry inspection
reported 3.0.3 as latest; audit metadata suggested unpublished 3.0.4, while the
official advisory lists no patched release. No unresolvable dependency override
was introduced.

## Qkit changes after the October 7 review

- Claim, undo and vendor-confirm actions verify Paykit's returned state before
  writing the local mirror. Seven reproduced races/response mismatches now pass;
  the 48 customer and 61 vendor payment-action tests pass. This does not make
  cross-service writes atomic or solve eventual reconciliation after a local
  write failure.
- Independent payment configuration and booking prefill calls run concurrently.
- Password reset displays an actionable error if the session lookup rejects,
  instead of leaving the form checking indefinitely.
- Invalid admin payment amounts stop the operation instead of becoming zero-cost
  grants or upgrades.
- Merqo vendor-status queries the matched vendor ID, avoiding false absence after
  the fleet exceeds the API row cap. Authorization, validation, rate limiting and
  upstream errors have endpoint regressions.
- Added tests for login/reset/OAuth, server cookie isolation, plan changes, admin
  reports and vendor support scoping, statistics entitlement filtering, customer
  review pagination, feedback token propagation and recent-order navigation.
- Vitest disables dotenv discovery. Reports include untested source; JSON summary
  output supports reproducible measurements. No coverage exclusions were added.

Supabase documents its default 1,000-row response limit and recommends pagination:
[Supabase select documentation](https://supabase.com/docs/reference/dart/select).
Single-vendor lookup uses an explicit ID filter rather than fetching a fleet.

## Cross-product findings under remediation

- Loopkit: privileged reward RPCs accepted caller-supplied reward state, and an
  internal stamp helper retained client execution rights. The owner prepared an
  additive migration and rollback-only pgTAP tests.
- Merqo: a SECURITY DEFINER metric emitter allowed clients to forge events trusted
  by Loopkit. A pending migration restricts execution to service-role callers;
  database-owner triggers remain able to emit events.
- Stockkit: stock movement insertion did not verify ownership of the referenced
  product. An additive RLS migration and regression are prepared. CSV formula
  handling and first-product desktop creation have application fixes.
- Paykit: checkout replay could mismatch vendor, amount or payment configuration;
  transition write errors could be presented as success. Application regressions
  pass. See the product report for remaining reconciliation and aggregation debt.

SQL migrations are **not applied or database-tested**: Docker's database daemon is
unavailable. Mocked/unit tests cannot validate RLS, grants, locking or transaction
behavior. This remains a release blocker for the database fixes.

Product reports: `../paykit/docs/paykit-audit-2026-10-08.md`,
`../merqo/docs/audit-2026-10-08.json`, and
`../stockkit/docs/audits/2026-10-08-stockkit-audit.md` (paths relative to qkit root).
