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
// Event vendors care about customization, not price — so the menu shows options
// (Milk: Oat/Regular/Soy on the hero item) and no prices. The first item is the
// customizable one; the rest are plain so the walk-in can one-tap "Add".
const ITEMS = [
  {
    name: "Flat White",
    group: "Milk",
    choices: ["Oat milk", "Regular", "Soy"],
  },
  { name: "Cold Brew" },
  { name: "Iced Mocha" },
];
const CUSTOMIZE_PICK = "Soy"; // beat 4: a non-default choice, to show selection
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
let popMs = 0; // when the live order lands — compose drops the chime here
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

/** Smooth-scroll a target to the vertical centre of the viewport, so the action
 *  is the focus instead of stuck at the screen edge (matters on the long menu
 *  form, where each new item card appears at the bottom). */
async function center(page, locator) {
  await locator
    .evaluate((el) =>
      el.scrollIntoView({ block: "center", behavior: "smooth" }),
    )
    .catch(() => {});
  await beat(280); // let the scroll settle before measuring/typing
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
  // Turbopack dev keeps an HMR socket open, so "load"/"networkidle" can hang —
  // navigations below use domcontentloaded. Be generous on first-compile waits.
  page.setDefaultNavigationTimeout(60000);
  page.setDefaultTimeout(45000);

  t0 = Date.now();

  // ── Beat 1: register + onboard ─────────────────────────────────────────────
  await step("Live in one step", async () => {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
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
    await beat(600);
  });

  // ── Beat 1.5: the built-in guided tour greets the new vendor ────────────────
  // On first landing the dashboard tour auto-pops. Walk it through to its own
  // conclusion (the last step says "go create your first booth →") instead of
  // cutting it off — so the move to booth setup next feels motivated, not an
  // abrupt jump. Resilient: if it never appears (already seen), just move on.
  await step("A guided tour, built in", async () => {
    const pop = page.locator(".driver-popover.qkit-tour");
    try {
      await pop.waitFor({ state: "visible", timeout: 8000 });
    } catch {
      return;
    }
    const nextBtn = page.locator(".driver-popover-next-btn");
    // Up to 5 steps (3 on the phone viewport); the final "Next" is "Done".
    for (let i = 0; i < 5; i++) {
      await beat(680); // hold each step long enough to read (caption reinforces)
      if (!(await nextBtn.isVisible().catch(() => false))) break;
      await glideClick(page, nextBtn);
    }
    // In case a step had no Next (shouldn't happen), make sure it's closed.
    if (await pop.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
    }
    await pop.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    await beat(450); // brief breath on the dashboard before heading to setup
  });

  // ── Beat 2: create the booth + menu (names + customization, no prices) ──────
  let boothId;
  await step("Add your menu & options", async () => {
    await glideClick(
      page,
      page.getByRole("link", { name: /Add your first booth/ }),
    );
    await page.waitForURL(/\/dashboard\/booths\/new/, { timeout: 15000 });
    await beat(400);
    await slowType(page, page.locator("#booth-name"), STALL);

    for (const it of ITEMS) {
      // Use the *bottom* "Add item" button (present once there's ≥1 item) so the
      // view stays put — clicking the top header button jumps it back up. With 0
      // items there's only the top one, so .last() resolves to it.
      await glideClick(
        page,
        page.getByRole("button", { name: /Add item/ }).last(),
      );
      await beat(150);
      const card = page.locator("div.bg-card", { hasText: "Available" }).last();
      // New item cards append at the bottom of the form — pull the card up to
      // the centre so the typing is the focus, not stuck at the screen edge.
      await center(page, card.getByPlaceholder("Item name"));
      await slowType(page, card.getByPlaceholder("Item name"), it.name, 45);

      // The hero item shows off customization — the event-vendor selling point
      // (size, milk, add-ons), not price.
      if (it.group) {
        await glideClick(
          page,
          card.getByRole("button", { name: /Customization/ }),
        );
        await beat(250);
        await glideClick(
          page,
          card.getByRole("button", { name: /Add option group/ }),
        );
        await beat(200);
        await center(page, card.getByPlaceholder(/Group name/));
        await slowType(page, card.getByPlaceholder(/Group name/), it.group, 40);
        const choices = card.getByPlaceholder(/^Choice/);
        await slowType(page, choices.first(), it.choices[0], 40);
        for (let ci = 1; ci < it.choices.length; ci++) {
          await glideClick(
            page,
            card.getByRole("button", { name: /Add choice/ }),
          );
          await beat(120);
          await choices.nth(ci).fill(it.choices[ci]);
          await beat(170);
        }
        await beat(300);
      }
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
  // We're on the booths list — click the card's QR button so the cursor leads
  // into the transition, rather than teleporting to the QR URL.
  await step("Customers scan this", async () => {
    await beat(400);
    await glideClick(page, page.getByRole("link", { name: /Booth QR code/i }));
    await page.waitForURL(new RegExp(`/dashboard/booths/${boothId}/qr`), {
      timeout: 15000,
    });
    await beat(1600);
  });

  // ── Beat 4: the customer customizes + orders from their phone ───────────────
  await step("They customize & order", async () => {
    await page.goto(`${BASE}/order/${boothId}`, {
      waitUntil: "domcontentloaded",
    });
    await beat(800);
    // The customizable item shows "Customize" → opens the options sheet.
    await glideClick(page, page.getByRole("button", { name: "Customize" }));
    await beat(700); // sheet slides up
    // Pick a non-default milk so the selection visibly changes, then add.
    await glideClick(page, page.getByRole("button", { name: CUSTOMIZE_PICK }));
    await beat(500);
    await glideClick(page, page.getByRole("button", { name: /Add to order/ }));
    await beat(600);
    await slowType(page, page.locator("#customerName"), CUSTOMER);
    await glideClick(page, page.getByRole("button", { name: /Place order/ }));
    await page.waitForURL(new RegExp(`/order/${boothId}/\\d+`), {
      timeout: 15000,
    });
    await beat(1000);
  });

  // ── Beat 5: the vendor sees it land live, then marks it ready ───────────────
  await step("You see every order live", async () => {
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await beat(600);
    await beat(1500); // board settles, showing Priya's order

    // Turn the new-order sound on — the bell goes active and the tap unlocks
    // audio. (Playwright records no audio, so the chime itself is mixed in by
    // compose.mjs at the moment the order lands.)
    await glideClick(page, page.getByTitle(/New-order sound/));
    await beat(300);

    // A walk-in orders from a second (un-recorded) phone — the ticket pops in
    // live on the board through the real realtime subscription.
    const bg = await browser.newContext({ viewport: VIEWPORT });
    const bgPage = await bg.newPage();
    await bgPage.goto(`${BASE}/order/${boothId}`, {
      waitUntil: "domcontentloaded",
    });
    await bgPage.getByRole("button", { name: "Add" }).first().click();
    await bgPage.locator("#customerName").fill(WALK_IN);
    await bgPage.getByRole("button", { name: /Place order/ }).click();
    await bgPage.waitForURL(new RegExp(`/order/${boothId}/\\d+`), {
      timeout: 15000,
    });

    // Wait for the second card to arrive on the recorded board, then advance it.
    // Exact match avoids the toast ("New order #0002 · Marcus"); take the card.
    await page
      .getByText(WALK_IN, { exact: true })
      .first()
      .waitFor({ timeout: 15000 });
    popMs = now(); // the live order just landed — chime goes here
    await beat(900);
    await glideClick(
      page,
      page.getByRole("button", { name: "Mark Ready" }).first(),
    );
    await beat(1100);
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
    JSON.stringify(
      { video: videoFile, viewport: VIEWPORT, popMs, steps },
      null,
      2,
    ),
  );

  console.log(`\n✓ Recorded ${videoFile}`);
  console.log(`✓ ${steps.length} captioned beats → steps.json`);
  console.log(`Next: node scripts/demo/compose.mjs\n`);
}

main().catch((err) => {
  console.error("\n✗ Recording failed:", err.message);
  process.exit(1);
});
