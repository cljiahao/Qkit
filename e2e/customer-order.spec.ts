import { test, expect } from "@playwright/test";

// Real Supabase checkout, payment claim and initial tracking; requires the coffee-cart seed.
const BOOTH = "c0ffee01-0000-4000-8000-000000000001";

// Must match the fixed test-only short code in the coffee-cart seed.
const CODE = "e2eKopitiam01";

test("customer places an order and reaches the live status page", async ({
  page,
}) => {
  await page.goto(`/o/${CODE}`);

  const customize = page.getByRole("button", { name: "Customize" }).first();
  await expect(customize).toBeVisible();

  // The first choices are preselected, so this customization is valid without extra picks.
  await customize.click();
  await page.getByRole("button", { name: "Add to order" }).click();

  await page.getByRole("button", { name: /Continue/ }).click();
  const checkout = page.getByRole("dialog");
  await checkout.getByLabel("Your name").fill("Ada");
  await checkout.getByRole("button", { name: /Place order/ }).click();

  // Payment-required orders have no number until payment is claimed.
  await expect(page).toHaveURL(new RegExp(`/order/${BOOTH}/pay\\?t=`));
  await expect(page.getByText(/scan with your paynow/i)).toBeVisible();

  // A valid PNG exercises the required proof upload and browser resize.
  await page.locator("#payment-proof").setInputFiles({
    name: "proof.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVQI12P4DwABAQEAG7buVgAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await page.getByRole("button", { name: /i've paid/i }).click();

  // The seed has no printer, so the claimed order still awaits vendor acceptance.
  await expect(page).toHaveURL(new RegExp(`/order/${BOOTH}/\\d+\\?t=`));
  await expect(
    page.getByText(/the stall will start on it shortly/i),
  ).toBeVisible();
  await expect(page.getByText(/payment sent/i)).toBeVisible();
});
