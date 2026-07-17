# meta

## Purpose

Cross-cutting project-management docs — roadmap, audit findings, and the consolidated task backlog — as distinct from the per-feature specs/plans in `docs/superpowers/`. These track _what to build/fix next and why_, not _how a shipped feature was designed_.

## Contents

- `2026-06-19-roadmap.md` — "qkit improvement roadmap — research-grounded": a deep-research-backed (SG/SEA market, 24/25 claims verified) phased roadmap confirming the "lightweight, app-free, per-event QR ordering" wedge against POS-integrated competitors (me&u, Klikit, Qashier, Koomi, HitPay, KPay, Rewardly), plus a pre-launch "Phase R" production-readiness pass and a quality bar for every phase.
- `2026-07-01-project-audit-findings.md` — "qkit Project Audit — Findings & Remediation Roadmap": findings from 5 parallel read-only area sweeps (src/lib, order/latency, dashboard/actions, DB/RLS/indexes, cross-cutting dedupe) plus adversarial verification; headline finding was that the customer write path was enforced only in the Next.js app layer, exploitable directly via PostgREST — findings are P0 (security) through P7 (config), each cited by `file:line`.
- `2026-07-02-audit-sweep-2-findings.md` — "qkit Audit — Sweep 2 (multi-axis) — Findings": a second, orthogonal-axis audit (trust-boundary, money invariant, concurrency/latency, type/dead/schema-drift, resilience/a11y/idempotency, dedupe) that found the Phase A fix only hardened the `anon` role, leaving identical holes open for `authenticated`, plus a margin bug and a dead route.
- `2026-07-02-master-task-registry.md` — "qkit — Master Task Registry (consolidated, 2026-07-02)": merges both audit sweeps plus a dependency/CVE scan and toolchain review into one prioritized, deduplicated backlog (P1 do-first through P3 worth-doing) with a progress-tracking section.
- `2026-07-17-manfred-feature-backlog.md` — "qkit — Manfred Feature Backlog": product-feature backlog (distinct in kind from the task registry's bug/tech-debt findings) from a vendor requirements session with design partner Manfred — scan-to-start queueing, unified queue board, one-tap vendor workflow, fat-finger close guard, PayNow-from-token-stack, physical token station, AI voice ordering. Source tables (ecosystem/problems/use-case priority) were lost in transcription — priority ordering here is an estimate pending re-derivation from the originals.
- `2026-07-17-phase1-manfred-pilot-job-board.md` — "qkit — Phase 1 Job Board: Manfred Pilot Readiness": PR-sized breakdown of Manfred's F1-F4 (booth close guard, unified queue board, one-tap workflow) plus a payment-hardening QA pass, grounded in a 4-repo ground-truth audit (`Merqo Business/docs/business/2026-07-17-merqo-roadmap.md`) that found most of the qkit-side roadmap phases already shipped. Flags F1 (scan-to-start) as needing its own brainstorming/design pass before PR-sizing — two open questions (status-enum reuse, physical scan mechanic) block a clean breakdown today.
- `2026-07-18-manfred-discovery-log.md` — "Manfred — Vendor Discovery Log": consolidated record of everything Manfred has told us (his input, not our response) — his business (weddings/corp events/shop, not one format), his positioning view (challenge Grab/foodpanda commission, not compete with POS), his human-interaction-first values, his own ice-cream-vendor market research, six concrete pain points in the order he raised them, his in-progress 3D-printed physical order-tab collaboration, and open threads still needing his direct input.

## Connectivity

Referenced from `AGENTS.md` ("Plan of record") alongside `docs/superpowers/plans/2026-06-05-qkit-core.md`. The master task registry consolidates and supersedes the two audit-findings docs as the actionable backlog; the roadmap is the earlier, higher-level planning document both audits were later run against. The Manfred feature backlog is a separate, parallel track — new product features from vendor input, not remediation of existing code. The Phase 1 job board turns that backlog into sequenced, mergeable PRs and is the current active work queue for the Manfred pilot.

**Higher-order view:** this folder is qkit's own detailed backlog. For how qkit's work fits alongside loopkit/paykit/merqo hub — cross-kit sequencing, latency/security between kits, domain/subscription decisions — see `Merqo Business/docs/business/2026-07-17-merqo-roadmap.md` (sibling registries: `paykit/docs/meta/2026-07-17-paykit-task-registry.md`, `merqo/docs/meta/2026-07-17-merqo-hub-task-registry.md`).

## Parent

[docs](../README.md)
