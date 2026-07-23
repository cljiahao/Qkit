# commit-msg

## Purpose

lefthook's `scripts:` entry point for the `commit-msg` git hook — a thin
Windows-quoting workaround, not the actual Conventional Commits logic.

## Contents

- `commit-msg.sh` — execs `../commit-msg.sh` (the real gate script) with the
  message-file path rejoined from lefthook's word-split `$*`, working around
  lefthook mis-quoting `{1}` template substitution when the checkout path
  contains a space (evilmartians/lefthook#551, #1167)

## Parent

[.lefthook](../README.md)
