import { test, expect } from "@playwright/test";

// QR access token gates order entry (feat/booth-qr-token). REQUIRES the
// coffee-cart seed (supabase/seed/coffee-cart.sql) — this is the "Kopitiam
// Cart" booth id, same as customer-order.spec.ts.
const BOOTH = "c0ffee01-0000-4000-8000-000000000001";

// Fixed test-only token the seed pins on the booth's access_token column
// (overriding the gen_booth_token() CSPRNG default) so this spec can drive a
// deterministic `?k=` happy path without a DB client. Keep in sync with the
// `access_token` value in supabase/seed/coffee-cart.sql and with
// customer-order.spec.ts (no shared fixtures module exists yet for e2e/).
const TOKEN = "e2eKopitiamToken00000000";

test.describe("QR access token", () => {
  test("valid token renders the order page", async ({ page }) => {
    await page.goto(`/order/${BOOTH}?k=${TOKEN}`);
    await expect(page.getByText("Kopitiam Cart")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Customize" }).first(),
    ).toBeVisible();
    await expect(page.getByText(/this code expired/i)).not.toBeVisible();
  });

  test("bare link (no token) hard-blocks", async ({ page }) => {
    await page.goto(`/order/${BOOTH}`);
    await expect(page.getByText(/this code expired/i)).toBeVisible();
  });

  test("wrong token hard-blocks", async ({ page }) => {
    await page.goto(`/order/${BOOTH}?k=definitely-wrong`);
    await expect(page.getByText(/this code expired/i)).toBeVisible();
  });
});
