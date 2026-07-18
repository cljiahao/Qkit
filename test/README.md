# test

## Purpose

Vitest tests that aren't colocated with their source: API route-handler tests
(mirroring `src/app/api/`'s folder structure) and one real-database
integration test that can't run as a fast colocated unit test.

## Contents

- `api/` — route-handler tests, one file per route, mirroring
  `src/app/api/`'s structure one-for-one; see its own README.
- `order-numbering.integration.test.ts` — integration test for migration
  `0008` (atomic per-booth order numbering). Hits a REAL Supabase instance,
  so it's opt-in (`describe.skipIf(!RUN_DB_TESTS)`, gated behind the
  `RUN_DB_TESTS` env var so the default `pnpm test` run doesn't fail when no
  local DB is up). Seeds a throwaway auth user → vendor → booth via the
  service-role client, fires 25 concurrent `next_order_number` RPC calls +
  order inserts (mirroring what `place_order` does internally), and asserts
  all 25 order numbers are distinct, sequential (`0001`..`0025`, no gaps),
  and that exactly 25 rows landed — proving the row-locked counter doesn't
  collide the way the pre-migration `COUNT(*)`-based numbering did. Reads
  `.env.local` itself (the repo has no dotenv dependency) and tears down its
  seeded data in `afterAll`.
- `setup.ts` — the global Vitest setup file: imports
  `@testing-library/jest-dom/vitest` matchers, polyfills
  `Element.prototype.hasPointerCapture`/`setPointerCapture`/
  `releasePointerCapture`/`scrollIntoView` as no-ops (jsdom doesn't
  implement the Pointer Events capture API — Radix popover-based
  primitives like `Select` call these on open/close/keyboard-nav and throw
  without a stand-in), and runs `cleanup()` from `@testing-library/react`
  after every test, but only when a DOM exists (component tests opt into
  `jsdom` via a `// @vitest-environment jsdom` docblock; plain
  node-environment `lib` tests would throw if this touched `document`
  unconditionally).

## Connectivity

`api/` mirrors `src/app/api/`'s structure one-for-one so each route handler
has a corresponding test file here rather than living next to the route
(keeping `src/app/api/` free of test files). `setup.ts` is wired in as
Vitest's global setup (see the Vitest config) and runs before/after every
test file in the project, including tests colocated elsewhere (e.g.
`src/lib/*.test.ts`, `src/hooks/*.test.tsx`).

## Parent

[qkit](../README.md)
