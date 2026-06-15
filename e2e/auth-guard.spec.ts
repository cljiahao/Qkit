import { test, expect } from "@playwright/test";

// Exercises src/proxy.ts → updateSession: no Supabase data needed, just a
// booting app. An anonymous visitor must be bounced to /login from the
// vendor-only areas. This is the integration check the mocked unit tests
// can't make (middleware + Supabase session run for real here).
test.describe("auth guard", () => {
  test("redirects anonymous /dashboard to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("redirects anonymous /onboarding to /login", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/login$/);
  });
});
