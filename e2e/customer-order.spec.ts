import { test, expect } from "@playwright/test";

// Full customer lifecycle against real Supabase + RLS:
// open booth → customize a drink → place order → land on the live status page.
// REQUIRES the coffee-cart seed (supabase/seed/coffee-cart.sql) — this is the
// "Kopitiam Cart" booth it creates.
const BOOTH = "c0ffee01-0000-4000-8000-000000000001";

// Order entry is reached via the booth's short_code (order-path hardening).
// Fixed test-only code the seed pins on the booth's short_code column. Keep
// in sync with the `short_code` value in supabase/seed/coffee-cart.sql and
// with e2e/order-code.spec.ts (no shared fixtures module exists yet for e2e/).
const CODE = "e2eKopitiam01";

test("customer places an order and reaches the live status page", async ({
  page,
}) => {
  await page.goto(`/o/${CODE}`);

  // Menu rendered (seed drinks all carry option groups → "Customize").
  const customize = page.getByRole("button", { name: "Customize" }).first();
  await expect(customize).toBeVisible();

  // Single-select option groups pre-select their first choice, so confirming
  // straight away is a valid order.
  await customize.click();
  await page.getByRole("button", { name: "Add to order" }).click();

  // The sticky bar is a checkout trigger, not a direct submit — it opens a
  // bottom sheet holding the name field and the real submit.
  await page.getByRole("button", { name: /Continue/ }).click();
  const checkout = page.getByRole("dialog");
  await checkout.getByLabel("Your name").fill("Ada");
  await checkout.getByRole("button", { name: /Place order/ }).click();

  // Payment-required orders defer their order number until payment is
  // claimed (migration 0087), so placing the order lands on /pay first,
  // not the numbered status page.
  await expect(page).toHaveURL(new RegExp(`/order/${BOOTH}/pay\\?t=`));
  await expect(page.getByText(/scan with your paynow/i)).toBeVisible();

  // 1x1 PNG — claimPayment requires a photo; the browser's real Canvas
  // decodes it fine for the client-side resize step.
  await page.locator("#payment-proof").setInputFiles({
    name: "proof.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVQI12P4DwABAQEAG7buVgAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await page.getByRole("button", { name: /i've paid/i }).click();

  // Claiming succeeds — the order gets its number here and lands on the
  // usual numbered status page, already showing "payment sent". The seeded
  // booth has no printer connected, so a new order starts 'pending' (needs
  // a vendor accept tap, migration 0086) rather than auto-starting.
  await expect(page).toHaveURL(new RegExp(`/order/${BOOTH}/\\d+\\?t=`));
  await expect(
    page.getByText(/the stall will start on it shortly/i),
  ).toBeVisible();
  await expect(page.getByText(/payment sent/i)).toBeVisible();
});
