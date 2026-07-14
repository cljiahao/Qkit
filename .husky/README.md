# .husky

## Purpose

Git hooks managed by husky, paired with lint-staged for pre-commit formatting/linting (see `AGENTS.md` — this project uses husky, not templateCentral's default lefthook).

## Contents

- `_/` — husky's own internal directory of git-hook shim scripts (auto-managed by the `husky` npm package via the `prepare` script in `package.json`, not hand-edited).
- `pre-commit` — this project's actual pre-commit hook: runs `npx lint-staged` (formats/lints staged files per the `lint-staged` config in `package.json` — `*.{ts,tsx,mjs}` gets `prettier --write` + `eslint --fix`, `*.{json,md,css}` gets `prettier --write`), then `node scripts/check-readme-freshness.mjs` (a repo-root `scripts/` check, run second so it can flag stale READMEs after formatting).

## Connectivity

`_/` is husky's own internal directory of git-hook shim scripts (auto-managed, not hand-edited); `pre-commit` is this project's actual hook script, invoked by those shims on every `git commit`. `package.json`'s `"prepare": "husky"` script installs/refreshes the `_/` shims whenever `pnpm install` runs.

## Parent

[qkit](../README.md)
