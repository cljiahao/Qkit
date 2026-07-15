# Future Directions

Design seams built into this project for AI collaboration patterns that are not
yet activated. These are integration points, not features — nothing here runs
unless you build it.

## Meta-Harness

CI that validates this project's own harness: a job that builds the project and
asserts the output passes tests and lint.

**Seam:** `<!-- [[post-harness]] -->` in `AGENTS.md`.

## Trace-Driven Evolution

Capture agent decision traces across sessions, aggregate patterns, and use them
to improve conventions over time. Off by default.

**Seam:** add a disabled trace hook placeholder in `.claude/settings.json`.

## Environment Engineering

A reproducible environment so every agent session starts from the same known
state (devcontainers or Nix flakes with agent-specific overlays).

**Seam:** `devcontainer.json` if present.

---

_Seams from [templateCentral v4.0](https://github.com/cljiahao/templatecentral),
adapted for the qkit (Next 16 + Supabase) stack. None activated._
