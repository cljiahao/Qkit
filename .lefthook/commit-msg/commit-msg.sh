#!/usr/bin/env bash
# lefthook "scripts:" entry point for the commit-msg hook.
# Delegates to ../commit-msg.sh (the canonical gate script). This indirection
# exists because lefthook's `commands:`/`run:` template substitution (`{1}`)
# mis-quotes on native Windows when the message-file path contains a space
# (evilmartians/lefthook#551, #1167) — this repo's checkout path itself has a
# space ("Merqo Business"). lefthook's `scripts:` convention execs this file
# directly with the message-file path as a real argv element ($1), bypassing
# the broken shell-string templating entirely.
set -euo pipefail
# lefthook passes the message-file path unquoted, so on this checkout (whose
# path contains a space: ".../Merqo Business/...") it arrives word-split
# across $1 $2 ... instead of as one argument. Rejoin with a single space to
# reconstruct the original path before handing it to the real gate script.
exec bash "$(dirname "$0")/../commit-msg.sh" "$*"
