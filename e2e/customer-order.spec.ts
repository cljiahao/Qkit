import { test, expect } from "@playwright/test";

// Full customer lifecycle against real Supabase + RLS:
// open booth → customize a drink → place order → land on the live status page.
// REQUIRES the coffee-cart seed (supabase/seed/coffee-cart.sql) — this is the
// "Kopitiam Cart" booth it creates.
const BOOTH = "c0ffee01-0000-4000-8000-000000000001";

test("customer places an order and reaches the live status page", async ({
  page,
}) => {
  await page.goto(`/order/${BOOTH}`);

  // Menu rendered (seed drinks all carry option groups → "Customize").
  const customize = page.getByRole("button", { name: "Customize" }).first();
  await expect(customize).toBeVisible();

  // Single-select option groups pre-select their first choice, so confirming
  // straight away is a valid order.
  await customize.click();
  await page.getByRole("button", { name: "Add to order" }).click();

  await page.getByLabel("Your name").fill("Ada");
  await page.getByRole("button", { name: /Place order/ }).click();

  // Lands on /order/<booth>/<orderNumber> with the "preparing" message.
  await expect(page).toHaveURL(new RegExp(`/order/${BOOTH}/\\d+$`));
  await expect(page.getByText(/being prepared/i)).toBeVisible();
});
