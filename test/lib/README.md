# lib

## Purpose

Vitest unit tests for `src/lib/` modules that aren't colocated as
`src/lib/<name>.test.ts` (the usual convention — see e.g.
`src/lib/admin-stats.test.ts`).

## Contents

- `merqo-auth.test.ts` — tests `provisionBearerOk` from
  `src/lib/merqo-auth.ts` (the constant-time bearer-token guard for
  `POST /api/merqo/vendor-provision`, keyed on `MERQO_PROVISION_SECRET` —
  deliberately a different secret from the module's `bearerOk`, which gates
  the read-only metrics route on `MERQO_METRICS_SECRET`). Asserts: true on
  the correct provision secret; false when the bearer is missing, when the
  metrics secret is sent instead (the two secrets must not be
  interchangeable), or when `MERQO_PROVISION_SECRET` is unset.

## Connectivity

Tests `src/lib/merqo-auth.ts`, which
`src/app/api/merqo/vendor-provision/route.ts` calls to gate the
vendor-provisioning endpoint — see `test/api/merqo/README.md` for the
route-level test of that same endpoint.

## Parent

[test](../README.md)
