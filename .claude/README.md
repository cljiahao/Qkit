# .claude

## Purpose

The Claude Code agent harness for this project: hooks, project skills, and the harness manifest that records what templateCentral seeded.

## Contents

- `harness.json`
- `hooks/`
- `settings.json`
- `skills/`

## Connectivity

`settings.json` wires the hook commands (described in `AGENTS.md`'s "AI Harness" section) and the `skills/` slash commands together; `hooks/` holds the scripts those hook entries invoke. `harness.json` records which files templateCentral seeded and their origin hashes, used to detect drift against newer templateCentral versions.

## Parent

[qkit](../README.md)
