# changelog

## Purpose

Skill that appends a Keep-a-Changelog entry under `[Unreleased]` in `CHANGELOG.md`.

## Contents

- `SKILL.md` — defines the `changelog` skill (`allowed-tools: Read(CHANGELOG.md), Edit(CHANGELOG.md)`, `argument-hint: [Added|Changed|Fixed|Removed] <summary>`). Instructs the agent to read `CHANGELOG.md`, find or create the matching `### Added`/`### Changed`/`### Fixed`/`### Removed`/`### Security` subsection under `## [Unreleased]`, and add one concise bullet describing what changed and why — not a file list. Follows the keepachangelog.com convention; explicitly does not invent a version/date (that happens at release time, separately).

## Connectivity

Scoped by `allowed-tools` to touch only the root `CHANGELOG.md` — it cannot read or edit any other file. Invoked as `/changelog` (or model-triggered given its description) whenever a change should be recorded for the next release.

## Parent

[skills](../README.md)
