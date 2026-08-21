# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Cleaned up the dashboard onboarding tour copy (`src/components/tour-steps.ts`):
  removed em dashes and the trailing arrow from the desktop step text, and
  added a small inline "example order" preview card to the first step (new
  `.tour-example` CSS in `src/app/globals.css`) so a new vendor can see what
  a real order looks like before any orders exist.

### Added

- Event-mode setup flow for event-cart/pop-up vendors: a new `booths
.walkup_default` flag (migration 0080) makes walk-up order entry the
  booth's default way orders get created, instead of opt-in per order.
  Toggle it from the booth form ("Default to walk-up order entry"); when
  on, the live order board auto-opens the walk-up dialog on load instead of
  the QR/menu-first presentation. A new "Set up for an event" entry point
  (`/dashboard/booths/new?mode=event`, alongside "Add your first booth" on
  the empty-board state) pre-checks the toggle and links out to
  `/dashboard/plan` to buy an event pass — reusing the existing pass
  entitlement and walk-up order entry rather than duplicating either.
  Every existing booth defaults to `false`; QR ordering is unaffected.
- Manual Light/Dark/System theme control in the account menu (`@merqo/ui`
  v0.18.0's built-in `AccountMenu` theme switcher), replacing the previous
  OS-only automatic dark mode. `src/app/layout.tsx` now wraps `Providers` in
  next-themes' own `ThemeProvider` (`attribute="class"`, `defaultTheme=
"system"`, `enableSystem`, `disableTransitionOnChange`) instead of the old
  hand-rolled `beforeInteractive` `<Script>` that toggled `.dark` from
  `prefers-color-scheme`; `globals.css`'s existing `.dark` palette is
  unchanged. New `next-themes` dependency (pinned `0.4.6`).
- Vendor-level opt-out for the customer Telegram "order ready" notification:
  a new `customer_telegram_notify_enabled` key on `board_settings`
  (`.default(true)` — every pre-existing vendor row keeps notifying exactly
  as before), a switch next to "Auto-clear after" in dashboard settings, and
  a gate in `advanceOrder` that skips the `notifyCustomer` call only when a
  vendor has explicitly turned it off. A brand-preference control, not a
  consent gate — the customer's own Telegram-connect consent (merqo's,
  see "Customer Telegram connect" below) is untouched.
- Bumped `@merqo/ui` to v0.16.0 and migrated `/dashboard/plan`'s Free/Pass/Pro
  feature-comparison grid onto the new shared `PlanComparisonTable` component,
  replacing the local `FEATURES`-rendering JSX and `Cell` check/dash helper —
  same visible output (column order, check/dash rendering, row order),
  different render path. The shared component (`tiers`/`rows` props, a
  computed `gridTemplateColumns` inline style rather than a Tailwind
  arbitrary-value class) also supports loopkit's 2-tier Free/Pro grid and its
  string-valued cells, for that repo's own separate follow-up migration.
- Customer Telegram connect (Phase B+D): a "Get notified on Telegram" button
  on the order-status page while an order is still waiting (`!isTerminal`
  and not yet `ready`), calling merqo's new `POST
/api/merqo/customer-connect-token`; `advanceOrder`'s `ready` transition
  now fires merqo's `POST /api/merqo/notify-customer` (`notify_ref` mode,
  `` `qkit:${order.id}` ``). No new qkit table or webhook — the customer's
  connection lives entirely in `merqo.customers`, owned by merqo. New
  `src/lib/merqo-customer-notify.ts` HTTP client (bearer
  `MERQO_CUSTOMER_SECRET`) — the first kit → merqo HTTP direction in this
  codebase; fails closed/never throws on either call, so a merqo outage
  never breaks the order-status page or changes `advanceOrder`'s own
  result.
- Telegram order alerts (Phase A): a vendor links Telegram once via a
  deep-link QR in dashboard settings, then gets a message on every new
  order as a redundant channel alongside the live order board. New
  `qkit.vendor_telegram`/`qkit.telegram_link_tokens` tables (migration
  0076), a signature-verified webhook route
  (`/api/telegram/webhook`, `X-Telegram-Bot-Api-Secret-Token`), and a
  fire-and-forget alert wired into `placeOrder` — a failed or missing
  Telegram link never affects order placement itself.
- Optional "Phone number (optional)" field on the customer checkout form,
  next to the name field. When a customer provides one, `place_order`/
  `place_walkup_order` link the order to the shared `merqo.customers` table
  (cross-kit customer identity) so a repeat customer can eventually be
  recognized across kits for the same vendor — genuinely optional, never
  required, and skipped entirely (no merqo write at all) when left blank.
- Bumped `@merqo/ui` to v0.14.0 and switched `DashboardNav`'s `switchKits`
  prop to call the new centralized `getSwitchKits("qkit")` helper instead
  of a locally hardcoded array, so a future new kit only needs adding to
  `@merqo/ui`'s `KIT_FAMILY` registry, not to every kit's own nav wrapper.
  No behavior change — same three sibling kits (loopkit, paykit, stockkit)
  with the same URLs.
- Adopted `@merqo/ui` v0.13.0's `switchKits` prop on `DashboardNav`: the
  account menu now has a "Switch products" submenu listing the three other
  live kits (loopkit, paykit, stockkit), letting a signed-in vendor jump
  straight to another kit's dashboard — SSO via the shared `.merqo.io`
  cookie already signs them in there too, so this is purely an in-product
  navigation affordance, no new backend.

### Fixed

- Cards were visually indistinguishable from the page background in light
  mode — the Market Ochre rebrand set `--card`/`--popover` to the exact
  same OKLCH value as `--background`. Restored a distinct, lighter card
  treatment in light mode (`src/app/globals.css`); dark mode already
  differentiated the two, and got a further brightness bump for better
  contrast.

### Removed

- **qkit's own Telegram bot (Phase A)** — retired the same day it shipped,
  in favor of merqo's shared Telegram bot (Phase A2). Deleted
  `src/app/api/telegram/webhook/`, `src/lib/telegram.ts`, the dashboard
  settings "Connect Telegram" section (`telegram-section.tsx`/
  `telegram-actions.ts`), and the `qkit.vendor_telegram`/
  `qkit.telegram_link_tokens` tables (migration `0077` drops what `0076`
  created); dropped `TELEGRAM_BOT_TOKEN`/`TELEGRAM_BOT_USERNAME`/
  `TELEGRAM_WEBHOOK_SECRET` from `.env.example`. `placeOrder`'s vendor
  order-alert keeps its name/call site but now calls merqo's
  `POST /api/merqo/notify-vendor` (`notifyVendor` in
  `src/lib/merqo-customer-notify.ts`) instead of running a local bot.
  **Any vendor who'd already linked qkit's own bot must reconnect once via
  merqo's `/profile` page** — a Telegram `chat_id` is scoped to a
  (bot, user) pair, so the old link is meaningless under a different bot.
  This is an expected, already-approved consequence of the retirement, not
  a regression.

### Changed

- Second-pass frontend-design/impeccable critique, hunting for what the
  first pass missed: the app's dark theme (a full `.dark` palette in
  `globals.css`, contrast-audited as recently as the previous entry) was
  completely unreachable — no theme toggle and no OS-preference detection
  ever applied the `.dark` class, so every `dark:`-variant style in the
  codebase was dead code and vendors got the light theme regardless of
  their device setting, including at night-market events. Root layout now
  applies `.dark` from `prefers-color-scheme` via a `beforeInteractive`
  script (no FOUC) and keeps listening for a live day→night switch. Also
  found the payment-status badge and its "Mark as paid"/"Confirm payment
  received" buttons (`order-card.tsx`, plus the identical duplicated map
  in the landing hero's `landing-ticket.tsx`) using raw `bg-blue-600`/
  `bg-emerald-600` Tailwind colors with no dark-mode pairing, instead of
  this project's own `--status-*` design-token convention — replaced with
  new `--status-payment-claimed`/`--status-payment-confirmed` tokens
  (light + dark). And the global 404 page's copy ("Scan the booth's QR
  code again to start a fresh order") was shown even when a vendor or
  admin hit a stale link inside `/dashboard` or `/admin` (e.g. a deleted
  booth's edit page) — added segment-scoped `not-found.tsx` pages with
  vendor/admin-appropriate copy for those two trees.
- Design pass from a completed frontend-design/impeccable critique: the
  dashboard toolbar's "New order" button is now the visually primary action,
  matching its usage frequency in queue-heavy event mode; removed the
  confusing "The pass" eyebrow above the order board heading (read as a
  plan-tier label, not load-bearing copy); MOAT and pricing cards now use
  the Ticket motif consistently with How-it-works instead of drifting to
  plain bordered divs; the order card's number/name (the most-scanned
  element) is no longer wrapped in a dashed "empty state" border, with the
  bump affordance moved to its own icon chip so reading and acting are
  visually distinct; and the landing trust strip now uses a perforated
  ticket-stub treatment instead of generic pill badges.
- **Bumped `@merqo/ui` to v0.10.0** and wired its new optional
  `LinkComponent` prop (`next/link`'s `Link`) into `dashboard-nav.tsx`'s
  `<DashboardNav>` call site. Previously `DashboardNav`/`AccountMenu` hardcoded
  a plain `<a>` for internal nav, forcing a full page reload on every click —
  root-caused elsewhere in the family as the reason an onboarding tour's
  nav-link spotlight step could abort an unawaited "mark tour seen" write
  mid-flight, so the tour kept re-triggering. `DashboardNav` forwards
  `LinkComponent` down to its composed `AccountMenu` internally, and qkit has
  no standalone `AccountMenu` usage, so this one wiring point covers both.

- **Payments now route through paykit**, the Merqo family's shared payment
  kit, instead of qkit's own local PayNow/QR code. Vendors' "quick add
  PayNow" section now saves to paykit's vendor-scoped config instead of
  writing the full config to `booths.payment`; the customer checkout panel,
  "I've paid" claim, and the vendor's "Confirm payment" tap now all call
  paykit's checkout/claim/confirm API (new `src/lib/paykit/client.ts`) —
  same rendered QR/link/image experience as before. New env vars
  `PAYKIT_KIT_SECRET`/`NEXT_PUBLIC_PAYKIT_URL`. This is a local-only cutover
  for now: paykit hasn't minted a production bearer key for qkit yet, so
  `PAYKIT_KIT_SECRET` ships unset and every payment call degrades to a clear
  error until that key exists. One deliberate feature drop: the customer's
  "Tapped by mistake? Undo" (unclaim) button is gone — paykit has no
  endpoint to reverse a claim.

### Removed

- **`src/lib/payments/`** (the local EMVCo PayNow QR builder and
  pointer/PayNow/Stripe render-adapter) — dead code once the paykit cutover
  above moved checkout rendering to paykit's API.

### Added

- **"Save QR image" on the customer order page's payment panel**, plus
  clearer same-device PayNow instructions. A QR checkout previously had no
  reliable way for the customer to hand the code to a banking app on the
  _same_ phone it's displayed on — this renders the on-screen QR to a PNG
  (`qr-image.ts`'s `renderSvgToPngBlob`) with a real quiet-zone border baked
  in (not just the on-screen wrapper padding, which isn't part of what gets
  rasterized) and shares it via the Web Share API where available, falling
  back to a direct download, with copy pointing the customer at "scan it
  from your photos" in their banking app.
- **`/api/merqo/vendor-provision` endpoint** for Merqo hub push-provisioning —
  lets a vendor one-click-activate qkit from the Merqo dashboard (creates a
  free-tier `vendors` row and seeds the shared vendor profile), guarded by a
  separate `MERQO_PROVISION_SECRET` bearer check (`provisionBearerOk`) since
  it's a write capability, not the read-only metrics secret the sibling
  routes share.
- **"Show wait-time estimate" toggle** on `/dashboard/settings` (default on).
  Off makes the customer status page always show only the queue-position
  label ("2 orders ahead of you"), never a minute guess, regardless of how
  much real order history the booth has — the backup prep-time input
  disables itself while this is off since it would have no effect either
  way (migration `0068`).
- **Arrival confirmation ("hold prep until the customer arrives")**: a new
  per-booth setting, meant for items made fresh per order (ice cream is the
  motivating case), that holds a new order back instead of starting prep
  the moment it's placed. With it on, the customer's order-status page shows
  a big "I'm here, start my order" button; prep only starts once they tap
  it, or a vendor starts it manually from the board. Off by default, and
  walk-up (counter-entered) orders are never held, since there's no
  "customer arrives later" for those.
- **Ready orders now auto-clear after a timeout.** A ticket marked "ready"
  that nobody collects used to sit on the live board forever until a vendor
  manually marked it picked up. Vendors can now set an auto-clear timeout
  (1 to 60 minutes, default 3, or turned off entirely) on the board
  settings page; a forgotten ready order past that timeout completes on its
  own so it stops cluttering the active queue.
- **Restore to ready**, for when the auto-clear above fires too eagerly. On
  the completed-orders history page, an order the auto-clear timeout closed
  (not one a vendor closed by hand) now shows a "Restore to ready" button
  that puts it right back on the live board.
- **Completed-orders history**: the live board drops a ticket the moment
  it's marked picked up, which is right for the active queue but left no
  way to pull it back up. A new `/dashboard/completed` page shows a
  paginated (12/page), newest-first history of a vendor's completed orders
  (capped at the most recent 500) — the same read-only ticket, no action
  buttons since a completed order is terminal.
- **Rotatable booth QR short code**: each booth's QR encodes a short
  `/o/{code}` URL backed by a vendor-rotatable 12-char code. A **Regenerate QR**
  button (behind a booth-naming confirmation) mints a new code, instantly
  invalidating every previously printed/saved link — shutting out stale or
  malicious repeat orders from past events. An unresolved code shows a
  "code expired" screen; the live order-status page stays valid mid-session.
  The short URL (~34 chars vs ~95) scans faster and prints smaller.
  (Supersedes the interim `access_token`/`?k=` model within this unreleased
  cycle — migrations `0027`–`0031`.)
- **Guided onboarding tour**: a short, skippable dashboard tour (driver.js)
  auto-runs once on a new vendor's first visit — spotlighting the live order
  board and the Booths/Stats/Plan landmarks, ending on a "create your first
  booth" nudge. A floating **?** button replays it anytime. Responsive (5 steps
  desktop / 3 mobile). "Seen" is tracked server-side per vendor
  (`vendors.tour_seen_at`, migration `0023`) so it doesn't re-nag across
  devices.
- One-tap **reorder**: customers can repeat a past order from the order-status
  page or their recent-orders list; the cart is rebuilt against the live menu
  (current prices, removed/changed items skipped). Recent-orders list collapses
  to 3 with "Show all".
- **Per-event permanent stats**: a paid pass (license) can be named after the
  event day and its full stats stay viewable forever — ungated, since it was
  paid for (migration `0020` + `set_license_label` RPC).
- **Customer reviews for vendors**: a "Customer reviews" card on `/dashboard/stats`
  shows average rating, distribution, and recent comments **split per booth**,
  each comment timestamped, with "show more" paging (RLS now lets a vendor read
  their own booths' customer feedback). Per-event stats include that event's
  reviews, and a prominent "Feedback" nav button surfaces the qkit feedback page.
- AI harness governance: `docs/constitution.md` (inviolable rules — RLS-is-authz,
  service-role server-only, Zod boundaries, deny-rules-are-a-guardrail).
- Project skills `/security-scan` (local gitleaks + `pnpm audit`) and `/changelog`;
  scoped `allowed-tools` on all project skills.
- pgTAP RLS isolation test (`supabase/tests/rls.test.sql`, run via
  `supabase test db`) — asserts a vendor cannot read or mutate another's data.
- **Refunds reporting.** A confirmed-paid order that's later cancelled is now
  reported as a refund (following the standard gross / refunds / net accounting
  model) instead of silently vanishing from revenue — surfaced on the stats KPI
  band, the `SalesSummaryV1` API, and the CSV export.
- **Vendor social & website links**: vendors can add a website URL plus
  Instagram/Facebook/TikTok links on their profile page — applied by default
  to every booth they own, with an optional per-booth override on that
  booth's own edit page. Shown to customers on the order-status page footer,
  after they've placed an order. Free tier, no plan gate
  (`vendors.social_links`/`booths.social_links`, migration `0052`).
- **Social links also shown on a closed booth's menu page**, inside the
  "not taking orders" banner, so a customer who lands on a closed booth can
  still reach the vendor to ask why instead of hitting a dead end
  (`get_booth_for_order` now resolves and returns `social_links`, migration
  `0053`).

### Security

- **Customer reviews can no longer be forged for a booth you never ordered
  from.** `submit_feedback` accepted a 1-5★ rating against any `booth_id` +
  `order_number` with no proof of an order (the only throttle was a spoofable,
  fail-open per-IP limit), so a booth's public rating could be review-bombed at
  scale. Customer feedback now carries the order's per-order access token, and
  the RPC rejects any review whose `(booth_id, order_number, access_token)`
  doesn't match a real order — the same unguessable token the status page
  already requires. Vendor feedback (stamped from the signed-in id) is
  unchanged. (Migration `0048`.)
- **Closed 7 open high-severity Dependabot alerts**, all transitive
  dev/build-tool dependencies (via eslint/vitest/stryker/next's own postcss
  pipeline), none reachable from runtime app code: `postcss` (path traversal
  in source-map auto-loading), `fast-uri` (host confusion via IDN/backslash,
  2 advisories), `js-yaml` (quadratic-CPU DoS via YAML merge-key chains),
  and `brace-expansion` (exponential-time DoS, 3 separate vulnerable major
  lines). Force-patched via `pnpm-workspace.yaml` overrides, same pattern
  already used for postcss/undici/vite/qs/sharp.

### Fixed

- Browser-tab title now uses the cross-kit "Name | Tagline" Title Case
  format: "Qkit | Live Queueing" (was "qkit: live queueing"). PWA-chrome
  title updated to match.
- `.husky/lib/pre-commit.sh` used `xargs -d '\n'`, a GNU-only flag not
  supported by BSD xargs (macOS default) — broke every local commit
  touching staged .ts/.tsx/.js/.mjs/.cjs or .json/.md/.css files. Swapped
  for portable `tr '\n' '\0' | xargs -0`.
- **`docs/constitution.md` renamed to `docs/CONSTITUTION.md`** to match
  templateCentral's canonical convention (and every other harness reference
  to it — `AGENTS.md`, `.claude/settings.json`, `.claude/hooks/*`). The
  lowercase filename was a local deviation; `protect-files.sh`'s ask-gate and
  `session-context.sh`'s re-injection now point at the correct case again.
- **Double-spaced button labels ("New order", "Booths · 3/5 open").**
  Both buttons split their label across several elements (an icon, plain
  text, a couple of responsive-hide spans) as direct children of a flex
  container with `gap-2` — the gap applies between every child, so it added
  extra space between words on top of the literal spaces already in the
  text, on the live order board's "New order" and booth-status buttons.
  Each label is now one child instead of several, so the gap only fires
  once, between the icon and the label.
- **Profile page's two-column layout desynced under a tall card.** A raw
  CSS grid tracks row height to its tallest cell, so once "Social &
  website" outgrew "Stall name," every row after it started late in both
  columns, leaving a visible gap under the shorter cards below. Switched to
  two independent stacking columns — the same fix already applied to the
  board-settings page.
- **A free item in an otherwise-priced order showed "$0.00" instead of
  "Free"**, on both the customer order-status page and the vendor live
  board/completed-orders card. Two layers: the UI's price column was gated
  on the order having _any_ priced item, not on the line itself; and
  underneath that, `place_order` coalesced an unset menu-item price to `0`
  and always stored `price_cents` on the order snapshot, so the "genuinely
  free" vs "explicitly $0.00" distinction was already gone by the time the
  order was placed — the UI fix alone had nothing to key off. `place_order`
  now omits `price_cents` entirely for an unset price (migration `0055`),
  mirroring how `cost_cents` already worked.
- **Price/Cost menu-item fields on the booth edit form truncated their own
  placeholder** ("Price (optiona…") — narrowed to "Price (opt.)"/"Cost
  (opt.)" and widened the field slightly.
- **Social link icons now show each platform's real logo and brand color**
  instead of generic Lucide glyphs (TikTok was a plain music-note icon, not
  the TikTok mark). Instagram/Facebook/TikTok now render via Simple Icons
  (`@icons-pack/react-simple-icons`) on a fixed light chip so the marks stay
  legible in dark mode too; used on both the vendor profile form and every
  customer-facing social row.
- **Vendor stats reviews scale with your own data, not the whole platform.** The
  reviews query leaned on RLS alone to scope to your booths and had no
  `feedback(booth_id)` index, so it walked platform-wide customer feedback each
  stats load. It now filters `.in("booth_id", …)` against a new
  `feedback(booth_id, created_at DESC)` index (migration `0049`), and the 500-row
  cap applies to your reviews instead of silently dropping yours past the
  platform's newest 500.
- **More of the UI respects reduced-motion and screen readers.** Under
  `prefers-reduced-motion` the always-on `animate-ping`/`pulse`/`spin` utilities
  (the live board's pulsing "active" dot, skeleton shimmers, spinners) now stop
  looping instead of running for a whole shift. Added missing accessible names:
  the working-hours time inputs (per weekday "opens"/"closes"), the support and
  feedback textareas, the support category radiogroup, and the order-card age
  chip now announces its overdue/aging state instead of conveying it by colour
  alone.
- **The landing page no longer overflows sideways on mobile.** The hero
  order-chit carousel's scroll track had no width constraint, so as a grid child
  (`min-width: auto`) it reported its full four-board width as its minimum and
  stretched the whole document past the viewport — the page rendered ~744px wide
  on a 375px phone, letting you pinch-zoom out and throwing every section's width
  off. Constraining the track with `min-w-0` / `w-full` lets it clip and scroll
  as intended; the document now matches the viewport exactly.
- **Dashboard nav reads clearly on a phone.** The burger and the account avatar
  used to sit crammed together on the right as two look-alike icon buttons. They
  now split to opposite ends — navigation burger far left, account far right
  (the standard hamburger-left / account-right mobile pattern) — with the avatar
  staying visible at every width since it's a high-frequency action. The hero
  order-chit carousel also tightens its padding on small screens and gives its
  dots a comfortable touch target.
- **Subscription revenue isn't double-counted** when an admin re-submits (or
  double-clicks) an already-Pro vendor — the payment is recorded only on a real
  free→Pro transition.
- **Entitlement drift closed.** The booth-create gate (`can_create_booth`)
  checked a license's `expires_at` but not `valid_from`, while serveability
  (`booth_servable`) checked both — so a vendor with a **future-dated** pass
  could create extra booths that then couldn't serve. Both now share one
  `vendor_entitled()` predicate. (Migration 0038.)
- **The anonymous ordering funnel survives an auth outage.** The session
  middleware resolved the user on every request, so a Supabase auth hiccup could
  500 the public `/o` / `/order` pages that need no login. It now resolves the
  user only on protected routes (and degrades to a `/login` redirect instead of
  a 500 if auth is unreachable) — the customer funnel skips the auth round-trip
  entirely.
- **The payment QR now has a fallback** when the image can't load (flaky wifi)
  instead of leaving the customer stuck with no way to pay.
- **Input bounds:** menu prices/costs are capped (a forged price can't overflow
  the order total), the cart is capped at 50 lines, and the status page
  validates its route params — matching the database-side guards.
- **Backend read errors no longer masquerade as empty/expired states.** A DB
  error while placing an order, resolving a booth code, or loading the vendor
  board is now logged and shown honestly — a distinct "try again" screen for a
  code that failed to resolve (instead of "QR expired", which looped a customer
  whose code was valid), and a retry banner on the dashboard (instead of a
  cheery empty "All clear" board that hid in-flight orders).
- **Accessibility:** the customer's live order-status and payment states are
  screen-reader live regions (announces "ready for pickup" / "payment
  confirmed"), and menu option choices expose radio/checkbox semantics instead
  of conveying selection by colour alone.
- **Order-board actions guard against concurrent status changes.** Advance,
  cancel, and confirm-payment updated an order by id using the status they had
  read — so a cancel racing an advance-to-completed could resurrect a cancelled
  order back into revenue and stock. Each update now also matches on the
  read status/payment_status; a concurrent change makes it a no-op and the
  action reports "Order changed — please refresh." rather than clobbering.
- **Dead customer order links resurrected.** Phase A moved the customer entry
  route to `/o/{short_code}` and removed `/order/{boothId}`, but the vendor
  "Copy order link" button, the reorder button, and the status page's "Order
  again" link still pointed at the removed route (404). The copy-link now yields
  the canonical `/o/{short_code}`, and a redirect shim at `/order/{boothId}`
  resolves a booth's current code and forwards to `/o/{code}` — also rescuing any
  previously printed/shared `/order/{boothId}` link. Reorder still seeds the cart
  (its sessionStorage handoff is booth-keyed and survives the redirect).
- **Stock oversell race in `place_order` closed.** The stock gate read remaining
  stock and passed _before_ acquiring the per-booth `order_seq` lock (the sold
  counter is bumped only in an AFTER-INSERT trigger), so two concurrent last-unit
  orders could both pass and oversell. The gate now runs after the lock —
  serializing concurrent orders on a booth — and checks the same pooled,
  clamped quantities the counter applies (one shared `order_item_quantities()`
  rule, replacing three subtly-different clamps). Migration `0034`.
- **Gross margin no longer reads 100% for every no-cost vendor.** `place_order`
  wrote `cost_cents: 0` for every item, even ones with no cost set, so the margin
  stats treated the cost as "present" and reported `profit == revenue` (100%
  margin) on the dashboard, the `SalesSummaryV1.gross_margin` API field, and the
  CSV export. It now omits `cost_cents` for a no-cost item (a genuine cost of 0
  is preserved and still counts). Migration `0033`.
- **`/api/v1/sales/summary` fails loud on a DB read error.** It discarded the
  Supabase `error` on both reads, so a transient failure returned a `200` with
  `{revenue: 0, …}` — a downstream consumer would silently under-invoice. It now
  logs and returns `503` on either read error.

### Security

- **Booth-image storage hardened.** The `booth-images` bucket now enforces a
  size cap and an image-only MIME allowlist at the bucket (previously only the
  client checked), and replacing/removing an image or deleting a booth now
  reclaims the orphaned storage objects instead of leaking them.
- **Vendors can no longer self-escalate to Pro.** `vendors_self_update` was
  row-scoped with no column limit, so a vendor could `UPDATE vendors SET
plan='pro'` on their own row via a direct PostgREST call — a free→pro
  escalation. Column-level `UPDATE(plan)` is now revoked from `anon` +
  `authenticated`; only the admin action (service role) writes `plan`. Same
  migration adds the missing `WITH CHECK` to the `vendors`, `booths`, and
  `purchase_requests` UPDATE policies (a policy with only `USING` doesn't
  constrain the result row, so an update could move a row out of the caller's
  ownership — e.g. re-point a booth to another vendor). Migration `0035`.
- **Order-path hardening extended to the `authenticated` role.** Phase A closed
  the customer write path for `anon` only, but sign-up is open — so any logged-in
  JWT still bypassed all of it: the permissive `orders_public_insert` /
  `booths_public_read` / `feedback_public_insert` policies had no `TO` clause
  (they applied to `authenticated` too) and the Phase-A `REVOKE`s named only
  `anon`. A logged-in vendor could forge orders, read **every** servable booth's
  `cost_cents` + `short_code` cross-vendor, forge competitor reviews, and burn
  any booth's `order_seq`. Migration `0033` drops the three dead permissive
  policies, revokes the direct grants from **both** roles, routes public feedback
  through a new `submit_feedback` `SECURITY DEFINER` RPC (re-derives `vendor_id`
  from the caller's own session), and hardens `place_order` against the
  direct-RPC path that skips the server action: re-derives each item name from
  the stored menu, validates + caps chosen options against the item's option
  groups, rejects an all-zero-quantity cart, caps the line count, and carries a
  booth-scoped flood guard inside the RPC. pgTAP asserts every path is denied to
  a non-owner `authenticated` session.
- **Customer order path enforced in Postgres, not just the app.** Previously the
  public anon key could POST directly to PostgREST and bypass every app-layer
  guard (rate limit, servability, stock, cost snapshot) and read private booth
  columns (`cost_cents`, the QR token). Now two `SECURITY DEFINER` RPCs are the
  only public surface — `get_booth_for_order` (returns a public-safe projection,
  never `cost_cents`/`short_code`) and `place_order` (atomic, server-priced,
  idempotent) — and direct anon `SELECT booths` / `INSERT orders` /
  `EXECUTE next_order_number` are revoked. `place_order` re-prices from the
  stored menu (forged client prices can't survive) and dedupes on an idempotency
  key (no double-order on flaky Wi-Fi). pgTAP encodes the contract.
- **Vendor order path enforced in Postgres too.** The order board mutated orders
  directly from the browser, guarded only by an `orders_vendor_update` policy
  that had `USING` but no `WITH CHECK` and no column restriction — so a tampered
  vendor session (or a direct PostgREST call with the vendor JWT) could forge
  `total_cents`/`items`, rewrite `order_number`/`customer_name`, or re-point an
  order to another booth. Now the three mutations go through validated server
  actions (`advanceOrder`/`confirmOrderPayment`/`cancelOrder`), the update policy
  carries a `WITH CHECK` (result row must still be the vendor's), and a
  `BEFORE UPDATE` trigger freezes the financial/identity columns (`booth_id`,
  `order_number`, `customer_name`, `items`, `total_cents`, `created_at`,
  `idempotency_key`, `payment_method_kind`) — a vendor UPDATE may only move the
  state machine. Migration `0032`; pgTAP encodes the freeze + `WITH CHECK`.
- CI security scanning (`.github/workflows/security.yml`): gitleaks v3 secret
  scan, CodeQL (javascript-typescript, security-extended), and a `pnpm audit`
  high/critical gate.
- `.github/dependabot.yml`: security-updates only (npm + github-actions);
  version-update PRs disabled (`open-pull-requests-limit: 0`).
- Removed `axios` — an unused production dependency carrying a high-severity
  `form-data` advisory (GHSA-hmw2-7cc7-3qxx). Production `pnpm audit` is clean at
  the high gate. The audit gate runs `--prod` (shipped code); a full audit runs
  informationally (dev-toolchain transitive vulns tracked by Dependabot).

### Changed

- Migrated git hooks from lefthook to husky — lefthook's unsigned
  `lefthook.exe` is unconditionally blocked by Windows Smart App Control on
  this machine; husky has no native binary. Same checks, same rigor.
- **Profile page column order**: column 1 is stall name → profile picture →
  change password; column 2 is display name → social links (was social
  links above display name). Meant as the standard profile-page order
  across every kit, not just qkit.
- **Completed-orders history now defaults to "Today"** instead of "All
  time" — a vendor lands on today's picked-up orders instead of scrolling
  through their entire history first. The cutoff comes from a server-
  computed SGT day-start rather than each device's own local clock, so it
  can't drift by hours if the vendor's browser timezone differs from the
  server's.
- **Daily order-number reset now defaults on, for every vendor, and the
  display number is zero-padded to 3 digits.** The board and customer
  status page show a small daily-reset ticket number (e.g. #003, was a bare
  "3") instead of the permanent one (#0847) by default now, matching how
  event/pop-up food-booth counters commonly number orders — previously off
  by default (migration `0067`, applied to existing vendors too, not just
  new ones). Grows past 3 digits rather than truncating on a heavy day, same
  never-shrink convention as the permanent number's own padding. Display-
  only: the real, permanent `order_number` is unaffected either way, and a
  vendor can still turn it off from `/dashboard/settings`.
- **Brand name standardized to lowercase `qkit`** across prose, UI copy, aria-labels,
  and docs (was inconsistently "QKit"/"Qkit" in ~87 files) — matches the sibling
  kits (`loopkit`) and the Merqo dashboard's kit registry. The navbar/hero/footer
  logo mark keeps its stylized two-tone "QKit" wordmark (unchanged, intentional —
  a visual mark, not prose). The footer now also credits "a Merqo kit".
- **Performance:** the customer status page fetches its order + booth in one
  round-trip instead of two; the dashboard's auth + vendor lookups are memoized
  per request (a layout + page no longer double-fetch); the DB rate limiter is
  indexed and sweeps only occasionally instead of on every call; and the two
  customer pollers share one visibility-aware hook.
- **Removed `pino`** (+ `pino-pretty`) — an unused dependency (26 packages
  pruned). A root `global-error` boundary now renders a styled page when the
  root layout itself throws.
- **CI** now applies every migration and runs the pgTAP RLS suite, and runs a
  production `next build`, on each push/PR.
- Mobile "order ready" alerts now work. Sound: a single shared, gesture-unlocked
  AudioContext (reused, await-resumed) replaces the per-call context that stayed
  silent on iOS/Android; the customer page always shows an "Alert me" tap so
  audio unlocks even on iOS Safari (no Notification API). Notifications: shown via
  a minimal static service worker (`registration.showNotification` — the page-
  level constructor is illegal on Android Chrome), fixing Android. The app is now
  an installable PWA (`manifest.ts` `display: standalone` + generated icons), so
  iOS notifications work once added to the home screen.
- Vendor image uploads are resized + re-encoded to **WebP in the browser** before
  upload (banner ≤1600px, product ≤1000px) so storage and load stay fast; source
  cap raised to 15 MB since we compress. Accepted formats (JPEG/PNG/WebP) are now
  stated on both uploaders. The customize sheet shows the item photo at the top.
- Mobile dashboard nav collapses behind a **burger menu** (the bar overflowed on
  phones); the vendor NPS form is now an even 0–10 scale that fits any width.
- Customer menu photos are **tap-to-enlarge** (fullscreen lightbox, Esc/tap to
  close) with a subtle corner expand icon + zoom-in cursor as the affordance.
- "Get a pass" / "Go monthly" now file an in-product **upgrade request** to the
  admin (migration `0021` + `purchase_requests`) instead of opening a `mailto:`
  to a personal inbox. The admin Overview shows a pending-requests inbox with a
  Resolve action; granting a pass/Pro auto-resolves the vendor's request.
- Pagination everywhere (new reusable `Paginated`): admin tables (vendors, audit
  log, per-vendor CSAT) get prev/next pages; feeds (recent orders, reviews, NPS
  notes) get "Show more / Show less". Every expander now collapses back. Per 2026
  UX consensus (pagination for tables, load-more for feeds).
- Reorder lives only on the order page (not the recent-orders list): the list
  shows no items to reorder _from_, and this also removes the inconsistency where
  only orders placed after the snapshot feature had a reorder button.
- Admin revamp: tabbed into **Overview · Vendors · Feedback** (vendors moved to
  their own tab). Cards adopt qkit's ticket/receipt motif (perforated hero,
  Space Mono figures, staggered reveal). Overview adds a **GMV** card (customer
  spend flowing through booths — the marketplace's throughput). Admin **feedback**
  drops the raw per-order customer feed (vendor-facing); it tracks **vendor NPS**,
  an **aggregate platform CSAT**, and a **per-vendor CSAT breakdown** (worst-rated
  first) to surface ordering-quality issues — scores only, no raw reviews.
- Vendor → qkit feedback is **NPS** (0–10 "recommend qkit?") instead of 1–5
  stars (migration `0019` adds the `nps` column).
- Fixed the stats/admin trend chart: dated X-axis (was a hidden index) and an
  uncut Y-axis (was clipped by a negative margin + 28px width).
- Permissions are now max-privilege: bare-tool `allow` so routine work doesn't
  prompt, with a `deny` list scoped to secret reads/edits and irreversible git/fs
  ops (force-push, hard reset, `rm -rf`, history rewrite). `.env.example` is the
  only whitelisted env file.
- De-branded docs layout: `docs/superpowers/{specs,plans}` → `docs/{specs,plans}`.
- Upgraded Next.js 15 → 16.2.7 (Turbopack). Renamed `src/middleware.ts` →
  `src/proxy.ts` (`export proxy`); switched the `check` script from `next lint`
  (removed in 16) to the ESLint CLI with `eslint-config-next`'s flat config.

## [0.1.0] - 2026-06-05

### Added

- Supabase email/password auth — login and register (creates the vendor row).
- Database schema (`supabase/migrations/0001_initial_schema.sql`): `vendors`,
  `booths` (JSONB `menu_items`), `orders` (JSONB `items`, `order_status` enum),
  with `updated_at` trigger.
- Row Level Security: vendors see/edit only their own booths and orders; active
  booths are publicly readable; anyone may place an order.
- Supabase realtime publication on `orders`.
- Vendor dashboard (`/dashboard`) — realtime order board; tap a card to advance
  status; auth-guarded via `src/middleware.ts`.
- Customer ordering page (`/order/[boothId]`) — menu, cart, and `placeOrder`
  server action with order-number generation.
- Live order status page (`/order/[boothId]/[orderNumber]`) with a realtime
  status poller (reads via the service-role client).
- shadcn/ui (new-york) primitives; `cn` / `formatPrice` / `genOrderNumber` utils
  with tests.
- AI harness: `AGENTS.md`, `.claude/` (settings hooks, project skills, verify
  gate, manifest), `vitest.config.ts`.

### Changed

- Upgraded `@supabase/ssr` 0.6 → 0.10 for `@supabase/supabase-js` 2.107 type
  compatibility (older ssr made every typed query resolve to `never`).

[Unreleased]: https://github.com/cljiahao/qkit/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/cljiahao/qkit/releases/tag/v0.1.0
