# security-scan

## Purpose

Skill that runs a local secret scan (gitleaks) + dependency audit before push.

## Contents

- `SKILL.md` — defines the `security-scan` skill (`allowed-tools: Bash(gitleaks *), Bash(npx gitleaks *), Bash(pnpm *)`). Runs the same checks CI runs, locally: (1) `gitleaks detect --no-banner` (committed history) and `gitleaks protect --staged --no-banner` (staged-but-uncommitted changes — the actual pre-push window `detect` alone misses), falling back to `npx gitleaks` if the binary isn't installed; (2) `pnpm audit --prod --audit-level=high` as the hard gate (production deps only — a hit must be fixed by bumping or dropping the dep); (3) `pnpm audit --audit-level=high` including devDeps, informational only (devDep vulns are tracked via Dependabot instead). Explicitly warns: never commit a real secret just to test a finding.

## Connectivity

Mirrors the checks in `.github/workflows/security.yml` (gitleaks + `pnpm audit`) so they can be run locally before pushing, catching secrets/vuln issues before CI does.

## Parent

[skills](../README.md)
