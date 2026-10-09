---
name: security-scan
description: Run the local security suite (secret scan + dependency audit) before pushing.
allowed-tools: "Bash(gitleaks *), Bash(pnpm *)"
---

Run the same security checks CI runs, locally, before you push.

1. **Secrets** — scan both committed history and what's staged for the push
   (`git` reads history only; it does NOT see staged-but-uncommitted changes —
   `protect --staged` does, which is the actual pre-push window):
   - `gitleaks git --redact --no-banner` — committed history.
   - `gitleaks protect --staged --redact --no-banner` — staged changes.
     If `gitleaks` is unavailable, report the scan as blocked. Install a verified binary from
     [the official releases](https://github.com/gitleaks/gitleaks/releases); do not substitute an npm package.
2. **Dependencies (gate)** — `pnpm audit --prod --audit-level=high`. This is the
   CI gate: production deps only (what ships). A hit here must be fixed — bump or
   drop the dep (an unused dep is dead attack surface; remove it).
3. **Dependencies (full)** — `pnpm audit --audit-level=high` for awareness, incl.
   devDeps. Don't block on these; the test-toolchain transitive vulns are tracked
   by Dependabot security PRs.

Report findings. Never commit a real secret to "test" a finding — `.env*` (except
`.env.example`) is git-ignored for this reason.
