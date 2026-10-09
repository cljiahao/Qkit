# Merqo products audit implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for product ownership and independent review. Complete each product's verification before reporting it clean.

**Goal:** Review and improve all six Merqo applications and the shared UI library, with at least 80% statement, branch, function and line coverage for each product's production source.

**Architecture:** Each product has a separate agent owner. Three agents run concurrently; the coordinator handles Qkit and cross-product contracts, then assigns Loopkit, Printkit and merqo-ui as slots become free. Reviewers rotate after implementation for a fresh pass.

**Tech stack:** Read each repository's current package/configuration; preserve its established Supabase architecture and framework conventions.

**Spec:** User request in this task, 2026-10-08, extending the October 7 Qkit audit to all Merqo products.

## Constraints

- Read each repository's AGENTS.md, relevant skills and binding docs before changes.
- Preserve pre-existing changes. Qkit starts on feat/ticket-redesign with edits to dashboard/page, realtime board and order card (including their tests); other seven-scope repositories start clean on main.
- No actual environment/credential reads, production service calls, commits, pushes or deployments. Do not run helpers that load real env files indirectly.
- Governance changes require a concrete proposal and explicit approval. Prior Qkit approval does not authorize other products' governance changes.
- Respect sibling-directory sandbox boundaries; use reviewed escalations for specific writes.
- Coverage includes untested production files. Exclude only genuine tests/types/generated assets. No blanket exclusions, skipped tests or assertions written solely to execute lines.
- Cap concurrent test workers to avoid overloading the shared host.

## Review focus

1. Cross-tenant and cross-product authority, service-role/RPC grants and token misuse.
2. Partial payment writes, retry/idempotency and concurrent state transitions.
3. Realtime disconnect/reconnect, stale requests, exception recovery and cleanup.
4. Reporting row caps, stock/loyalty arithmetic, time boundaries and untrusted input.
5. Public/component behavior absent from current tests; coverage changes must assert outcomes.

## Per-product tasks

For each of `qkit`, `merqo`, `paykit`, `loopkit`, `stockkit`, `printkit`, `merqo-ui`:

- [ ] Record current Git state and enumerate tracked files with roles, consumers and deletion candidates.
- [ ] Inspect test environment loading; run complete coverage baseline, record all four metrics and uncovered source.
- [ ] Trace auth, validation, SQL privileges, integration contracts and expensive work; verify uncertain practices from primary documentation.
- [ ] Reproduce concrete defects with regressions, implement narrow fixes and remove only demonstrated redundancy.
- [ ] Add meaningful boundary/component/route tests until all four aggregate metrics reach 80%; enforce thresholds in the product's test config.
- [ ] Update affected README/comment contracts and changelog; propose any protected changes separately.
- [ ] Run format/lint/typecheck, coverage and applicable build/security/integration checks; distinguish blocked checks from passing ones.
- [ ] Independent agent reviews the resulting diff and remaining trust boundaries; implement and verify justified corrections.
- [ ] Save per-product evidence/report and consolidate completion/coverage/risk matrix.

## Initial assignments

| Product  | Owner                     | Initial state                                                             |
| -------- | ------------------------- | ------------------------------------------------------------------------- |
| qkit     | coordinator               | October 7 audit merged into current tree; ticket-redesign edits preserved |
| paykit   | paykit_product_sweep      | active                                                                    |
| merqo    | merqo_product_sweep       | active                                                                    |
| stockkit | stockkit_product_sweep    | active                                                                    |
| loopkit  | separate agent, next wave | queued                                                                    |
| printkit | separate agent, next wave | queued                                                                    |
| merqo-ui | separate agent, next wave | queued                                                                    |

The qkit-payment-pickup and qkit-wt-verify directories are auxiliary checkouts,
not additional products. Their changes are outside the initial remediation scope.
