# .husky

## Purpose

Git hooks managed by husky, paired with lint-staged for pre-commit formatting/linting (see `AGENTS.md` — this project uses husky, not templateCentral's default lefthook).

## Contents

- `_/`
- `pre-commit`

## Connectivity

`_/` is husky's own internal directory of git-hook shim scripts (auto-managed, not hand-edited); `pre-commit` is this project's actual hook script, invoked by those shims.

## Parent

[qkit](../README.md)
