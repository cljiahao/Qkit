# .github

## Purpose

GitHub-specific configuration: CI/CD workflows and automated dependency updates.

## Contents

- `dependabot.yml` — configures Dependabot for two ecosystems (`npm` at `/`, `github-actions` at `/`), both on a weekly schedule with `open-pull-requests-limit: 0`. That limit deliberately disables routine version-update PRs (dropped as noise for a solo, direct-to-main project) while leaving Dependabot's security-advisory PRs (which ignore the limit) active.
- `workflows/` — the GitHub Actions pipeline definitions (`ci.yml`, `security.yml`).

## Connectivity

`workflows/` holds the GitHub Actions pipelines that run on push/PR; `dependabot.yml` configures automated dependency-update PRs (security-only in practice), independent of those workflows. Together they're this repo's whole CI/security surface — referenced from `AGENTS.md`'s "AI Harness" section ("CI security: `.github/workflows/security.yml`... and `.github/dependabot.yml`").

## Parent

[qkit](../README.md)
