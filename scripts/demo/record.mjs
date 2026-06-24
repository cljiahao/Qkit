// QKit demo recorder — drives the REAL app against a LOCAL Supabase, records a
// vertical (9:16) phone-viewport walkthrough, and emits steps.json (caption +
// timing per beat) for compose.mjs to burn in.
//
// Prereqs: local Supabase up + migrations applied + `pnpm dev` running, and the
// demo account wiped (scripts/demo/reset.sql). See scripts/demo/README.md.
//
// Run: node scripts/demo/record.mjs
// Out: scripts/demo/out/<video>.webm + scripts/demo/out/steps.json
//
// Selectors are pinned to the current app (login/onboarding/booth-form/menu-
// editor/order-form/order-card). If a beat times out, the app markup moved —
// fix the locator, not the timeout.

import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");

// Fixed demo identity — must match scripts/demo/reset.sql.
const EMAIL = "demo-cart@qkit.local";
const PASSWORD = "demo-password-123";
const STALL = "Sunrise Coffee Cart";
const ITEMS = [
  { name: "Flat White", price: "5.50" },
  { name: "Cold Brew", price: "6.00" },
  { name: "Mocha", price: "6.50" },
];
const CUSTOMER = "Priya"; // beat 4 (recorded, on-camera order)
const WALK_IN = "Marcus"; // beat 5 (background order → live pop)

const VIEWPORT = { width: 390, height: 844 }; // ~9:16, iPhone-ish

// ── Fake cursor ──────────────────────────────────────────────────────────────
// Playwright's real clicks are invisible + instant. Inject a dot that follows
// mousemove, then drive mouse.move(...,{steps}) so it glides before each click.
const CURSOR_SCRIPT = `
  (() => {
    const add = () => {
      if (document.getElementById('__demo_cursor')) return;
      const c = document.createElement('div');
      c.id = '__demo_cursor';
      Object.assign(c.style, {
        position: 'fixed', left: '0', top: '0', zIndex: '2147483647',
        width: '20px', height: '20px', marginLeft: '-10px', marginTop: '-10px',
        borderRadius: '50%', background: 'rgba(30,30,30,0.30)',
        border: '2px solid rgba(255,255,255,0.95)',
        boxShadow: '0 1px 5px rgba(0,0,0,0.45)', pointerEvents: 'none',
        transition: 'width .08s ease, height .08s ease',
      });
      document.body.appendChild(c);
      window.addEventListener('mousemove', (e) => {
        c.style.left = e.clientX + 'px';
        c.style.top = e.clientY + 'px';
      }, { passive: true });
      window.addEventListener('mousedown', () => { c.style.width = '13px'; c.style.height = '13px'; });
      window.addEventListener('mouseup', () => { c.style.width = '20px'; c.style.height = '20px'; });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
    else add();
  })();
`;

// ── Pacing + timeline ────────────────────────────────────────────────────────
const steps = [];
let t0 = 0;
const now = () => Date.now() - t0;
const beat = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wrap a narrative beat: records {caption, startMs, endMs} for compose.mjs. */
async function step(caption, fn) {
  const startMs = now();
  await fn();
  steps.push({ caption, startMs, endMs: now() });
}

/** Glide the cursor to an element's centre, then click it (visible motion). */
async function glideClick(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps: 24,
    });
    await beat(180);
  }
  await locator.click();
}

/** Click a field, then type it character-by-character for a human cadence. */
async function slowType(page, locator, text, perCharMs = 55) {
  await glideClick(page, locator);
  await locator.pressSequentially(text, { delay: perCharMs });
  await beat(220);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    recordVideo: { dir: OUT, size: VIEWPORT },
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();

  t0 = Date.now();

  // ── Beat 1: register + onboard ─────────────────────────────────────────────
  await step("Live in one step", async () => {
    await page.goto(`${BASE}/login`);
    await beat(600);
    await glideClick(
      page,
      page.getByRole("button", { name: "Create an account" }),
    );
    await beat(300);
    await slowType(page, page.locator("#email"), EMAIL);
    await slowType(page, page.locator("#password"), PASSWORD);
    await glideClick(
      page,
      page.getByRole("button", { name: "Create account" }),
    );
    // enable_confirmations=false → session granted → /dashboard → /onboarding.
    await page.waitForURL(/\/onboarding/, { timeout: 15000 });
    await beat(500);
    await slowType(page, page.locator("#name"), STALL);
    await glideClick(page, page.getByRole("button", { name: /Open my stall/ }));
    await page.waitForURL(/\/dashboard$/, { timeout: 15000 });
    await beat(900);
  });

  // ── Beat 2: create the booth + menu ────────────────────────────────────────
  let boothId;
  await step("Add your menu", async () => {
    await glideClick(
      page,
      page.getByRole("link", { name: /Add your first booth/ }),
    );
    await page.waitForURL(/\/dashboard\/booths\/new/, { timeout: 15000 });
    await beat(400);
    await slowType(page, page.locator("#booth-name"), STALL);

    for (const it of ITEMS) {
      await glideClick(
        page,
        page.getByRole("button", { name: /Add item/ }).first(),
      );
      await beat(150);
      const card = page.locator("div.bg-card", { hasText: "Available" }).last();
      await slowType(page, card.getByPlaceholder("Item name"), it.name, 45);
      await slowType(
        page,
        card.getByPlaceholder("Price (optional)"),
        it.price,
        45,
      );
    }
    await beat(300);
    await glideClick(page, page.getByRole("button", { name: /Save booth/ }));
    await page.waitForURL(/\/dashboard\/booths$/, { timeout: 15000 });
    await beat(700);

    // Capture the new booth's id from its list link for beats 3-5.
    const hrefs = await page
      .locator('a[href*="/dashboard/booths/"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    const match = hrefs
      .map((h) => h && h.match(/\/dashboard\/booths\/([0-9a-f-]{36})/i))
      .find(Boolean);
    if (!match) throw new Error("Could not find the new booth id in the list.");
    boothId = match[1];
  });

  // ── Beat 3: the QR customers scan ──────────────────────────────────────────
  await step("Customers scan this", async () => {
    await page.goto(`${BASE}/dashboard/booths/${boothId}/qr`);
    await page.waitForLoadState("networkidle");
    await beat(2200);
  });

  // ── Beat 4: the customer orders from their phone ───────────────────────────
  await step("They order from their phone", async () => {
    await page.goto(`${BASE}/order/${boothId}`);
    await beat(800);
    // Plain items (no option groups) → an "Add" button each.
    await glideClick(page, page.getByRole("button", { name: "Add" }).first());
    await beat(400);
    await slowType(page, page.locator("#customerName"), CUSTOMER);
    await glideClick(page, page.getByRole("button", { name: /Place order/ }));
    await page.waitForURL(new RegExp(`/order/${boothId}/\\d+`), {
      timeout: 15000,
    });
    await beat(1400);
  });

  // ── Beat 5: the vendor sees it land live, then marks it ready ───────────────
  await step("You see every order live", async () => {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState("networkidle");
    await beat(1500); // board settles, showing Priya's order

    // A walk-in orders from a second (un-recorded) phone — the ticket pops in
    // live on the board through the real realtime subscription.
    const bg = await browser.newContext({ viewport: VIEWPORT });
    const bgPage = await bg.newPage();
    await bgPage.goto(`${BASE}/order/${boothId}`);
    await bgPage.getByRole("button", { name: "Add" }).first().click();
    await bgPage.locator("#customerName").fill(WALK_IN);
    await bgPage.getByRole("button", { name: /Place order/ }).click();
    await bgPage.waitForURL(new RegExp(`/order/${boothId}/\\d+`), {
      timeout: 15000,
    });

    // Wait for the second card to arrive on the recorded board, then advance it.
    await page.getByText(WALK_IN).waitFor({ timeout: 15000 });
    await beat(1200);
    await glideClick(
      page,
      page.getByRole("button", { name: "Mark Ready" }).first(),
    );
    await beat(1800);
    await bg.close();
  });

  // Finish — flush the video + timeline.
  await context.close();
  await browser.close();

  const videoFile = fs
    .readdirSync(OUT)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => ({ f, t: fs.statSync(path.join(OUT, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0]?.f;

  fs.writeFileSync(
    path.join(OUT, "steps.json"),
    JSON.stringify({ video: videoFile, viewport: VIEWPORT, steps }, null, 2),
  );

  console.log(`\n✓ Recorded ${videoFile}`);
  console.log(`✓ ${steps.length} captioned beats → steps.json`);
  console.log(`Next: node scripts/demo/compose.mjs\n`);
}

main().catch((err) => {
  console.error("\n✗ Recording failed:", err.message);
  process.exit(1);
});
