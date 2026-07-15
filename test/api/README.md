# api

## Purpose

Tests mirroring `src/app/api/`'s route structure — a pure organizational
folder (no test files of its own) that fans out into one subfolder per API
namespace.

## Contents

- `merqo/` — tests for `src/app/api/merqo/` (qkit's internal business-metrics
  feed, consumed by the Merqo umbrella product); see its own README.
- `v1/` — tests for `src/app/api/v1/` (the stable, versioned external API);
  see its own README.

## Connectivity

Each subfolder's path segment matches the corresponding route's path segment
under `src/app/api/` exactly, so a route at `src/app/api/<x>/<y>/route.ts` has
its test at `test/api/<x>/<y>/<name>.test.ts`.

## Parent

[test](../README.md)
