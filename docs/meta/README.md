# meta

## Purpose

Cross-cutting project-management docs — roadmap, audit findings, and the consolidated task backlog — as distinct from the per-feature specs/plans in `docs/superpowers/`. These track _what to build/fix next and why_, not _how a shipped feature was designed_.

## Contents

- `2026-06-19-roadmap.md` — "QKit improvement roadmap — research-grounded": a deep-research-backed (SG/SEA market, 24/25 claims verified) phased roadmap confirming the "lightweight, app-free, per-event QR ordering" wedge against POS-integrated competitors (me&u, Klikit, Qashier, Koomi, HitPay, KPay, Rewardly), plus a pre-launch "Phase R" production-readiness pass and a quality bar for every phase.
- `2026-07-01-project-audit-findings.md` — "QKit Project Audit — Findings & Remediation Roadmap": findings from 5 parallel read-only area sweeps (src/lib, order/latency, dashboard/actions, DB/RLS/indexes, cross-cutting dedupe) plus adversarial verification; headline finding was that the customer write path was enforced only in the Next.js app layer, exploitable directly via PostgREST — findings are P0 (security) through P7 (config), each cited by `file:line`.
- `2026-07-02-audit-sweep-2-findings.md` — "QKit Audit — Sweep 2 (multi-axis) — Findings": a second, orthogonal-axis audit (trust-boundary, money invariant, concurrency/latency, type/dead/schema-drift, resilience/a11y/idempotency, dedupe) that found the Phase A fix only hardened the `anon` role, leaving identical holes open for `authenticated`, plus a margin bug and a dead route.
- `2026-07-02-master-task-registry.md` — "QKit — Master Task Registry (consolidated, 2026-07-02)": merges both audit sweeps plus a dependency/CVE scan and toolchain review into one prioritized, deduplicated backlog (P1 do-first through P3 worth-doing) with a progress-tracking section.

## Connectivity

Referenced from `AGENTS.md` ("Plan of record") alongside `docs/superpowers/plans/2026-06-05-qkit-core.md`. The master task registry consolidates and supersedes the two audit-findings docs as the actionable backlog; the roadmap is the earlier, higher-level planning document both audits were later run against.

## Parent

[docs](../README.md)
