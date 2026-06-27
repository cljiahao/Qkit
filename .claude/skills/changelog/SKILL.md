---
name: changelog
description: Append a Keep-a-Changelog entry under [Unreleased] in CHANGELOG.md.
allowed-tools: "Read(CHANGELOG.md), Edit(CHANGELOG.md)"
argument-hint: "[Added|Changed|Fixed|Removed] <summary>"
---

Add a one-line entry to `CHANGELOG.md` under `## [Unreleased]`.

1. Read `CHANGELOG.md`.
2. Under `## [Unreleased]`, find or create the matching subsection
   (`### Added` / `### Changed` / `### Fixed` / `### Removed` / `### Security`).
3. Add a concise bullet — what changed and why it matters, not the file list.

Follow Keep a Changelog (https://keepachangelog.com). Group by type, newest at the
top of `[Unreleased]`. Do not invent a version/date — releases cut `[Unreleased]`
into a dated version separately.
