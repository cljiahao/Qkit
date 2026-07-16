# .claude

## Purpose

The Claude Code agent harness for this project: hooks, project skills, and the harness manifest that records what templateCentral seeded.

## Contents

- `harness.json` — templateCentral drift-tracking manifest: records `templatecentral_version` (5.7.0), the stack adaptation note ("Next 16 + Supabase — not better-auth/Drizzle"), a running `review_note` log of what was/wasn't adopted from later templateCentral versions, `adoWiki`/`richReadme` (per-folder-README opt-ins from 5.10/5.11 — both explicit booleans, not left implicit), and `seeded_files` (per-file SHA-256 `origin_hash` for `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json`, `.claude/hooks/verify.sh`, and two `SKILL.md` files) used to detect drift against the upstream template.
- `hooks/` — shell scripts invoked by the hook commands wired in `settings.json` (currently just `verify.sh`).
- `settings.json` — the hook wiring (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `SessionStart`) plus the `permissions.allow/ask/deny` lists and `skillOverrides` that disable the templateCentral `add`/`scaffold`/`migrate` skills for this repo; see Connectivity below for what each hook actually runs.
- `skills/` — this project's slash-command skills (`changelog`, `next-verify`, `security-scan`, `supabase-migrate`).

## Connectivity

`settings.json` is the actual hook wiring (described narratively in `AGENTS.md`'s "AI Harness" section): `PreToolUse` blocks `Edit|Write` to secret-looking filenames (`.env*` except `.env.example`, `.pem`/`.key`/`.p12`/`.pfx`/`.secret`, `credentials.json`/`.netrc`/`.secrets`) and blocks any `Bash` command containing `--no-verify`; `UserPromptSubmit` pattern-matches prompt-injection phrases; `PostToolUse` runs incremental `tsc --noEmit` after every `Edit`/`Write` (feedback-only, always exits 0); `Stop` runs `pnpm test` and exits 2 with the failure tail if it fails (unless `stop_hook_active` is already set, to avoid a re-entry loop); `SessionStart` (on `startup|resume|compact`) re-injects the first 30 lines of `AGENTS.md` as routing context. `hooks/verify.sh` is a separate, manually-invoked verification gate (`pnpm build && pnpm check && pnpm test`) — not wired into any hook event itself. `skills/*/SKILL.md` are the slash commands Claude Code loads directly; `harness.json` is read by nothing at runtime, it's a human/agent-facing record for templateCentral re-sync reviews.

## Parent

[qkit](../README.md)
