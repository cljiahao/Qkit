---
name: security-scan
description: Run the local security suite (secret scan + dependency audit) before pushing.
allowed-tools: "Bash(gitleaks *), Bash(pnpm *), Bash(npx *)"
---

Run the same security checks CI runs, locally, before you push.

1. **Secrets** — `gitleaks detect --no-banner` (scans tracked + staged history).
   If `gitleaks` isn't installed: `npx gitleaks detect --no-banner`.
2. **Dependencies** — `pnpm audit --audit-level=high` (fails on high/critical).

Report findings. Never commit a real secret to "test" a finding — `.env*` (except
`.env.example`) is git-ignored for this reason. A high/critical audit hit means
bump the dep (Dependabot will also open a security PR) — do not suppress it.
