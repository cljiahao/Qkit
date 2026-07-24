# hooks

## Purpose

The scripts `.claude/settings.json` wires to Claude Code lifecycle events —
the actual guardrail logic (secret/CI protection, commit hygiene, type
feedback, prompt-injection screening, skill-usage logging) behind the
harness.

## Contents

- `block-no-verify.sh` — PreToolUse(Bash): blocks `--no-verify`/`-n` on `git commit`, `LEFTHOOK=0`/`LEFTHOOK_EXCLUDE`/`core.hooksPath=` bypasses, direct commits to `main`, force-push to a protected branch, `git checkout/restore` on guard-layer files, and recursive-force `rm` on source directories; exit 2 blocks
- `post-edit-typecheck.sh` — PostToolUse(Edit\|Write), `.ts`/`.tsx` files only: runs incremental `tsc --noEmit` and surfaces the last 5 lines; feedback-only, never blocks
- `post-tool-failure.sh` — PostToolUseFailure: writes the failed tool's name/error to stderr so the model can self-correct; always exits 0
- `protect-files.sh` — PreToolUse(Edit\|Write): hard-blocks (exit 2) writes to `.env*` (except `.env.example`/`.env.default`), CI/CD pipeline files, secrets directories, and cert/credential files; asks for human approval on other protected files (AGENTS.md/CLAUDE.md, `docs/constitution.md`, `.claude/settings.json`, `.claude/hooks/*`, `.claude/agents/*`, `.mcp.json`, the harness manifest/verifier/regen scripts, `.claude/.harness-base/*`, `Dockerfile`, `lefthook.yml`/`.gitleaks.toml`, `.lefthook/*`)
- `session-context.sh` — SessionStart(startup\|resume\|clear\|compact): re-injects the first 30 lines of `AGENTS.md`, all of `docs/constitution.md` if present, and a fixed list of always-on invariants (secrets guard, quality gate, feature-branch rule, protected files, architecture boundaries)
- `skill-usage-log.sh` — PostToolUse(`Skill__.*`): appends a `timestamp\tskill-name` line to `.claude/skill-usage.log`; always exits 0; the data source for a future skill-usage audit
- `stop-checks.sh` — Stop: runs `pnpm test`; on failure, tails the last 20 lines to stderr and exits 2 to force a fix before the turn ends; short-circuits to exit 0 when `stop_hook_active` is true, avoiding a re-entry loop
- `subagent-stop.sh` — SubagentStop: if a subagent left uncommitted `.ts`/`.tsx` changes (working tree or staged), runs `tsc --noEmit` and exits 2 with the last 20 lines of errors, blocking a handback of broken code
- `user-prompt-guard.cjs` — UserPromptSubmit: OWASP LLM01 prompt-injection phrase guard (e.g. "ignore previous instructions") plus LLM02 credential-leak detection (AWS keys, GitHub PATs, Anthropic API keys, PEM private-key blocks, DB/broker URLs with embedded credentials); exit 2 blocks
- `verify.sh` — standalone verification gate (`pnpm build && pnpm check && pnpm test`); not wired to any event in `settings.json`, kept as a manual/on-demand full-suite gate

## Connectivity

Every script here is inert on its own — `.claude/settings.json` is what
binds a script to a lifecycle event (matcher + command), and that binding
is what makes it a "hook" rather than a loose shell script. Most scripts
read the tool-call JSON from stdin (via an inline Node one-liner) to pull
`tool_input.file_path`/`command`/`prompt`; exit code conventions are
consistent across the set — `exit 2` blocks/forces a fix (stderr surfaces
to the model), a `permissionDecision: "ask"` JSON payload on stdout with
`exit 0` requires human approval, plain `exit 0` allows. `verify-harness.sh`
(one level up, in `.claude/`) treats every script in this folder as part of
the integrity-checked enforcement layer.

## Parent

[.claude](../README.md)
