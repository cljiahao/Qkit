import { defineConfig, devices } from "@playwright/test";

// E2E smoke layer. Deliberately small — a few critical-path flows against a
// REAL local Supabase, covering what the mocked unit/component tests cannot:
// RLS, the proxy.ts auth guard, and the full customer order lifecycle.
//
// Prerequisites to run (see AGENTS.md):
//   1. Docker running, `supabase start`
//   2. apply migrations + the coffee-cart seed
//   3. `pnpm test:e2e` (auto-starts `pnpm dev` via webServer below)
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // List for live console output; also emit an HTML report in CI so a failed
  // run has an uploadable artifact (see .github/workflows/ci.yml).
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
