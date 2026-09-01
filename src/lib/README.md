# lib

## Purpose

Framework-agnostic business logic for qkit: order/booth/entitlement rules, stats
and margin aggregation, the Zod schemas that validate every server-action/form
boundary, and the DB type mirror. Kept free of React and Next.js so it is
unit-testable (and Stryker-mutation-tested) without a DOM or a live database;
`paykit/`, `printkit/`, and `supabase/` are the subfolders that do carry I/O
concerns (the paykit and printkit HTTP clients, and the Supabase client
factories, respectively).

## Contents

- `action-result.ts` — `ActionResult<T>` discriminated union
  (`{success:true}&T | {success:false,error}`) returned by every Server Action.
- `admin-stats.ts` — `activationFunnel` (signed-up → booth → order → Pro,
  distinct-vendor counts), `latestActivePassByVendor` (per-vendor live-license
  expiry map), `summarizeVendors`/`summarizeEvents` (plan/signup and event-type
  rollups) for the `/admin` overview.
- `admin-stats.test.ts` — unit tests for the above four aggregation functions.
- `admin-vendor-health.ts` — `vendorStatus`/`buildVendorHealth`: classifies each
  vendor into a banded `VendorStatus` (`attention`/`expiring`/`stuck`/`quiet`/
  `new`/`healthy`, first-match-wins) plus `statusRank` (triage sort key) and
  `passHoursLeft`; deliberately not a synthetic numeric score.
- `admin-vendor-health.test.ts` — tests status classification rules and the
  health-map rollup.
- `admin-vendor-names.ts` — `vendorStallNames(supabase, vendorIds)`: resolves
  each vendor id's stall name from `merqo.vendor_profile` (via
  `getOrCreateVendorProfile`), one RPC per unique id run in parallel —
  admin-only, low-traffic call sites, no batch-read RPC exists on the merqo
  side.
- `admin-vendor-names.test.ts` — tests parallel resolution, dedup of repeated
  ids into a single call each, and the empty-list no-op.
- `admin.ts` — `isAdmin(userId)` (row-presence check against the `admins`
  table) and `requireAdmin()`, the `/admin` route/action gate that 404s (not
  403s, to avoid revealing the route) signed-out or non-admin users.
- `admin.test.ts` — tests the admin gate's 404-on-unauthorized behavior.
- `booth-access.ts` — `servableBoothIds`/`isBoothPaused`: which of a vendor's
  active booths are customer-servable under their entitlement (unlimited plans
  serve all; free serves only the oldest `maxBooths`), mirroring the
  `booth_servable` SQL function so DB and dashboard agree.
- `booth-access.test.ts` — tests serveability under free vs. unlimited
  entitlements and the "paused" classification.
- `booth-code.ts` — `orderPath(code)`: builds the `/o/{code}` customer entry
  URL from a booth's short code.
- `booth-code.test.ts` — tests URL encoding of the order path.
- `booth-color.ts` — `boothColor(boothId)`: deterministic hash into an 8-color
  oklch palette (`BOOTH_COLORS`) so a booth's accent dot is stable without a DB
  column.
- `booth-color.test.ts` — tests hash stability/distribution.
- `booth-images.ts` — `storagePathFromPublicUrl`, `boothImagePaths`,
  `orphanedImagePaths`: extract in-bucket storage paths from booth-images
  public URLs and diff before/after booth state to find storage objects safe to
  delete after an image swap or booth deletion.
- `booth-images.test.ts` — tests URL parsing and orphan-path diffing.
- `brand-icon.tsx` — `brandIcon(size)` React element plus `BRAND_EMBER`/
  `BRAND_OAT` color constants; renders the "Q" app mark for `ImageResponse`-
  generated favicon/manifest/apple-touch icons.
- `carousel.ts` — `nearestIndex(scrollLeft, boardWidth, count)`: clamped
  nearest-board-index calculation for a horizontally-scrolling carousel.
- `carousel.test.ts` — tests clamping and the non-positive-width edge case.
- `cart-storage.ts` — `saveCart`/`loadCart`/`clearCart`: persists the
  in-progress customer cart to `sessionStorage` (keyed `qkit:cart:{boothId}`)
  as compact `ReorderLine`s, validated on read via `isValidLine`; best-effort
  (silently no-ops without `window` or on quota/private-mode errors).
- `cart-storage.test.ts` — tests save/load/clear round-tripping and malformed
  or missing storage.
- `cart.ts` — `cartKey(menuItemId, options)` (stable dedup key sorted by
  option group so selection order doesn't matter) and `cartTotal`.
- `cart.test.ts` — tests cart-key stability and total summation.
- `env.ts` — `publicEnv`: fail-fast validated `NEXT_PUBLIC_SUPABASE_URL`/
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, client-safe (no secrets), read via
  literal `process.env.NEXT_PUBLIC_*` so Next.js still inlines them at build.
- `events.ts` — `eventLabel(license)`: display name for a paid pass/event
  (vendor's own label, or a dated default like "Pass · 7 Jun").
- `events.test.ts` — tests label fallback and whitespace-only-label handling.
- `hours-editor.ts` — pure state transitions behind the working-hours editor:
  `WEEKDAY_KEYS`, `DEFAULT_WINDOW`, `emptyWeek`, `dailyHours`, `weekFromDaily`,
  `dailyFromWeek` — the daily↔weekly conversions, kept out of the component so
  they're unit-testable without a DOM.
- `hours-editor.test.ts` — tests the daily/weekly conversion helpers.
- `hours.ts` — `BoothHours`/`DayWindow` types and `isBoothOpen`/
  `nextOpenLabel`: SGT wall-clock open/closed logic including overnight
  windows (`eveningCovers`/`morningCarry` carry a Fri 22:00–02:00 shift past
  midnight).
- `hours.test.ts` — tests daily/weekly/overnight open-closed logic and the
  "Opens …" label.
- `image-resize.ts` — `resizeToWebp(file, maxDim, quality)`: browser-only
  Canvas resize + WebP re-encode before upload (EXIF-orientation-aware),
  falling back to the original file on any decode/encode failure.
- `image-upload-adapter.ts` — `uploadQkitImage`: `@merqo/ui`'s `ImageUploader`
  `onUpload` backend — writes the already-resized blob to the `booth-images`
  Supabase Storage bucket at the path the component built
  (`${pathPrefix}/${uuid}.${ext}`, `pathPrefix` set to the vendor id at each
  call site) and resolves the public URL; throws on a storage error so
  `ImageUploader` surfaces it via its own `onError`. A plain function, not a
  factory — every call site's vendor id is already baked into `path` by the
  time `onUpload` runs, so there's nothing left to close over.
- `image-upload-adapter.test.ts` — tests a successful upload/public-URL
  round trip and that a storage error propagates as a rejection.
- `menu-csv.ts` — `menuItemsToCsv(items)`/`csvToMenuItems(text)`: the
  qkit-side of the menu-manager's CSV bulk export/import (`name,description,
price,available`, dollars not cents for spreadsheet readability). A
  hand-rolled RFC4180-shaped encode/decode (quoted fields, embedded
  commas/quotes) rather than a new dependency — 4 fixed columns didn't
  justify one; does not handle a literal newline inside a quoted field.
  `csvToMenuItems` always treats the first line as the header (skipped) and
  returns one `CsvMenuRow` per remaining line — a row with no name or an
  unparseable/negative price comes back with `error` set instead of being
  silently dropped, so `menu-manager.tsx`'s import preview can surface it.
- `menu-csv.test.ts` — round-trip encode/decode (including a
  comma-containing description through the quoting path), header skipping,
  missing-name/invalid-price/negative-price row errors, blank-price-is-not-
  an-error, the `available` default (true unless the cell is exactly
  `false`), and empty/header-only input.
- `menu-sections.ts` — `groupByCategory(items, categories)`: pure grouping
  of a booth's `menu_items` under its `menu_categories` (booth's own order),
  bucketing any missing/unmatched category id into "Other", always last, and
  dropping empty sections — used by `OrderForm` to render the customer menu
  grouped once a booth has 2+ non-empty sections.
- `menu-sections.test.ts` — tests category-order grouping, the Other bucket,
  empty-section dropping, and the no-categories-defined case.
- `merqo-auth.ts` — `bearerOk`/`provisionBearerOk`: constant-time bearer-token
  checks against `MERQO_METRICS_SECRET`/`MERQO_PROVISION_SECRET` respectively
  — deliberately separate secrets, since leaking the routine metrics-polling
  one must not also grant the tenant-provisioning write. `listAllAuthUsers`
  (page-1-only, 1000-user cap, logs if that ceiling is hit so pagination gaps
  don't fail invisibly) and `findAuthUserByEmail` — shared auth-user lookup
  helpers for the merqo cross-kit admin flows.
- `merqo-customer-notify.ts` — `mintCustomerConnectToken(vendorId, kitSlug,
notifyRef)`/`notifyCustomer(vendorId, notifyRef, message)`/
  `notifyVendor(vendorId, message)`: server-only HTTP client for merqo's
  `POST /api/merqo/customer-connect-token`/`POST /api/merqo/notify-customer`/
  `POST /api/merqo/notify-vendor` endpoints (bearer `MERQO_CUSTOMER_SECRET`,
  `AbortSignal.timeout(3000)`) — the first **kit → merqo** HTTP direction in
  this codebase (every other cross-kit call flows merqo → kit).
  `notifyVendor` is the Phase A2 replacement for qkit's own now-retired
  Telegram bot (`placeOrder`'s vendor order-alert call — see
  `docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`).
  All three fail closed: `mintCustomerConnectToken` returns `null` on any
  non-2xx/timeout/network error, `notifyCustomer`/`notifyVendor` catch + log
  and never throw, same fail-closed philosophy as `fetchEarnConfig` in
  `earn-link.tsx`.
- `merqo-customer-notify.test.ts` — tests the request body/header shape for
  all three calls and the fail-closed/never-throw behavior on non-2xx,
  timeout, and network-error cases.
- `merqo-downgrade-request.ts` — `resolveDowngradeOutcome(hasVendorRow,
currentPlan)`: pure decision (`not_found`/`already_free`/`downgrade`) for the
  admin downgrade-vendor action.
- `merqo-downgrade-request.test.ts` — tests the three outcome branches.
- `merqo-metrics.ts` — `computeMerqoMetrics`: qkit's own business metrics
  (revenue/GMV, active vendors, weekly order deltas, signups, plan mix,
  pending upgrade requests, activation funnel) built on top of
  `admin-stats.ts`'s `summarizeVendors`/`activationFunnel`.
- `merqo-metrics.test.ts` — tests the metrics aggregation against synthetic
  vendor/booth/order/payment fixtures.
- `merqo-support.ts` — `submitSupportMessage`: cross-schema RPC wrapper
  calling merqo's `submit_support_message` (`supabase.schema("merqo").rpc(...)`)
  so a vendor's Get-help message lands in the shared cross-kit
  `merqo.support_messages` inbox — qkit's own local `support_messages`
  table was dropped (migration `0073`) once every reader/writer converged.
- `merqo-upgrade-request.ts` — `resolveUpgradeOutcome(hasVendorRow,
hasPendingRequest)`: pure decision (`not_found`/`already_pending`/`create`)
  for the admin/vendor upgrade-to-Pro request flow.
- `merqo-upgrade-request.test.ts` — tests the three outcome branches.
- `merqo-vendor-activity.ts` — `computeVendorActivity(vendor, booths, orders,
passExpiresAt, hasOpenMessage, nowMs)`: pure aggregation behind `GET
/api/merqo/vendor-activity` — orders/revenue (30d) and booth counts, plus a
  `status` delegated to `admin-vendor-health.ts`'s `buildVendorHealth` so it
  matches the admin console's own triage rather than re-deriving it.
- `merqo-vendor-activity.test.ts` — tests the 30d order/revenue rollup, the
  zeroed-fresh-vendor case, and that an open message/expiring pass surface
  the same `attention`/`expiring` statuses the admin console shows.
- `merqo-vendor-profile.ts` — `getOrCreateVendorProfile`/`upsertVendorProfile`:
  cross-schema helper calling merqo's `get_or_create_vendor_profile`/
  `upsert_vendor_profile` RPCs (`supabase.schema("merqo").rpc(...)`) so
  stall name + social links read/write against the shared
  `merqo.vendor_profile` table instead of the stale `qkit.vendors` columns.
- `merqo-vendor-profile.test.ts` — tests the RPC call shape (schema/function
  name, args) and that a Postgres error surfaces as a thrown `Error` with the
  underlying message.
- `merqo-vendor-status.ts` — `resolveVendorStatus(email, authUsers, vendors)`:
  two-step email → auth user → vendor plan lookup (vendors has no email
  column) for admin vendor search.
- `merqo-vendor-status.test.ts` — tests the email-to-vendor resolution,
  including no-match cases.
- `nps.ts` — `npsBreakdown(scores)`: Net Promoter Score classification
  (promoters 9-10 / passives 7-8 / detractors 0-6) and the -100..100 score.
- `nps.test.ts` — tests the breakdown math and the empty-responses case.
- `order-alerts.ts` — customer/vendor "order ready"/"new order" alerting:
  `isNotifySupported`/`notifyPermission`/`requestNotifyPermission`,
  `fireReadyNotification`/`fireNewOrderNotification` (service-worker
  `showNotification` with a page-level `Notification` fallback),
  `unlockAudio` + `playReadyChime`/`playSound` (a shared, gesture-unlocked
  `AudioContext` playing one of five square-wave presets — chime/bell/ding/
  horn/triple — via WebAudio oscillators).
- `order-alerts.test.ts` — tests permission gating, notification dispatch
  fallback, and sound-preset scheduling against mocked WebAudio/Notification
  APIs.
- `orders.ts` — order-board core: `BOARD_ORDER_COLUMNS` (explicit column list
  excluding `access_token`), `TERMINAL_STATUSES`/`isTerminal`, `ADVANCE` (legal
  forward-status map + button label), `orderAgeTone`/`elapsedMinutes`/
  `elapsedLabel`, `buildAdvancePatch` (status transition patch, auto-confirming
  payment on completion), `sortActiveOrders` (vendor-board display sort,
  status-agnostic by design — a bumped order leads, then every order by
  `created_at`; takes an `AgeSortOrder`, `"earliest"` default or `"latest"`),
  `ordersAheadOf` (the separate, status-aware kitchen-priority queue used
  for the customer-facing wait estimate), `estimateLabel`/`estimateRangeLabel`
  (point vs. range "X-Y min" customer wait-estimate labels — the range form
  is what the order-status page actually renders, on the theory that an
  unmet precise promise erodes trust more than an upfront-honest range),
  `queuePositionLabel` (the no-time-data fallback, "N orders ahead of you"),
  `orderProgressIndex` (customer 3-segment progress bar), `displayOrderNumber`
  (board_settings.daily_order_number_reset's display-only "position among
  today's orders" number — pure arithmetic on the immutable `order_number`/
  `created_at` relative to a caller-supplied baseline, never a live recount;
  zero-padded to 3 digits like a ticket counter ("003"), growing past that
  rather than truncating; falls back to the real number when there's no
  baseline).
- `orders.test.ts` — tests status transitions, patch-building (including the
  payment auto-confirm-on-complete rule), sorting, age/label formatting, and
  `displayOrderNumber`'s baseline arithmetic, 3-digit padding/growth, and
  real-number fallbacks.
- `paykit/` — server-only HTTP client for paykit's `/api/v1/*` checkout API
  (vendor config upsert + full read-back, checkout create/claim/unclaim/
  confirm/status); see its own README. Replaced the local PayNow QR builder
  and payment-method adapter registry that used to live at `payments/`
  (deleted in the paykit cutover).
- `plan.test.ts` — tests entitlement resolution across plan/pass/pro
  combinations and the `canAdd*`/`canHaveOptionGroups` gates.
- `plan.ts` — `Entitlement`/`Tier` model (`FREE`/`PASS`/`PRO` presets),
  `getEntitlement` (resolves a vendor's effective entitlement from
  `plan`+license expiry), `normalizePlan`, `canAddBooth`, `canAddMenuItem`,
  `canHaveOptionGroups`.
- `platform-settings.ts` — `PlatformSettingsConfig` type and
  `DEFAULT_PLATFORM_SETTINGS` (banner off): the fail-safe fallback when the
  `platform_settings` row can't be read, so a read failure never shows a
  stale/wrong banner to every visitor.
- `printkit/` — server-only HTTP client for printkit's job-creation API
  (`createPrintJob`, the only endpoint today); see its own README. Unlike
  `paykit/`, an unset `NEXT_PUBLIC_PRINTKIT_URL` has no fallback host — it
  fails closed rather than guessing a deployment.
- `pricing.ts` — `PricingConfig` type and `DEFAULT_PRICING` (zeroed fallback
  when the `pricing` row is unreadable, e.g. pre-migration).
- `qkit-printkit-auth.ts` — `printkitCallbackBearerOk`: constant-time bearer
  check against `PRINTKIT_CALLBACK_SECRET` for `POST
/api/printkit/print-status` — a plain shared secret, no `kit_slug:` prefix
  (mirrors `merqo-auth.ts`'s `bearerOk`, not `paykit/client.ts`'s outbound
  `qkit:<secret>` convention), since printkit has exactly one caller
  registered for this endpoint.
- `qkit-printkit-auth.test.ts` — tests the unset-secret, missing-header,
  mismatched-secret, and matching-secret cases.
- `rate-limit.ts` — `clientIp(headers)` (best-effort, spoofable fairness key —
  not an authz signal) and `rateLimit(supabase, key, limit, windowSeconds)`,
  which calls the `check_rate_limit` RPC and fails OPEN (with a logged error)
  on limiter failure so a degraded limiter never blocks real customers.
- `rate-limit.test.ts` — tests the fail-open behavior and IP extraction.
- `realtime-orders.ts` — `parseRealtimeOrderEvent`/`applyRealtimeOrderEvent`:
  validates untrusted Supabase Realtime payloads via `orderRowSchema`, strips
  `access_token` before it reaches client state (Postgres replication
  broadcasts full rows regardless of REST column selection), and folds
  DELETE/INSERT/UPDATE events into the board's order list.
- `realtime-orders.test.ts` — tests payload validation (rejecting malformed
  events) and the fold logic for each event type.
- `recent-orders.ts` — `getRecentOrders`/`getRecentOrdersForBooth`/
  `addRecentOrder`: customer order history in `localStorage`
  (`qkit:recent-orders`, capped at 10), since unauthenticated customers have no
  server-side link between a device and its orders.
- `recent-orders.test.ts` — tests read/write validation, dedup-by-order, and
  the MAX-10 cap.
- `reorder-handoff.ts` — `stashReorder`/`takeReorder`/`isValidLine`: one-shot
  `sessionStorage` handoff (`qkit:reorder:{boothId}`) from the status page or
  recent-orders list back into the booth menu; read-once (cleared immediately
  on read).
- `reorder-handoff.test.ts` — tests stash/take round-tripping, one-shot
  consumption, and line validation.
- `reorder.ts` — `reconcileReorder(lines, menuItems, remaining)`: rebuilds a
  past order's lines against the CURRENT menu (fresh name/price), drops lines
  whose item/options no longer exist or that are out of stock, merges
  duplicates by `cartKey`, and clamps quantities to live remaining stock.
- `reorder.test.ts` — tests reconciliation against removed items, changed
  options, unavailable items, and stock-capped quantities.
- `reviews.ts` — `summarizeReviews`/`groupReviewsByBooth`: aggregates
  customer order-feedback rows into a per-vendor rating distribution, average,
  and recent-comments list, split per booth.
- `reviews.test.ts` — tests distribution/average math and per-booth grouping.
- `sales-summary.ts` — `SalesSummaryV1` (the FROZEN, versioned, snake_case
  external contract returned by `/api/v1/sales/summary`), `toSalesSummaryV1`
  (maps the internal `StatsSummary`), `salesSummaryToCsv`.
- `sales-summary.test.ts` — tests the v1 mapping and CSV serialization
  (including cell-quoting of values containing commas/quotes/newlines).
- `schemas.ts` — the Zod schema library for every form/action/JSONB boundary:
  `loginSchema`, `vendorSchema`, `menuItemFormSchema`/`menuItemSchema`,
  `optionGroupSchema`/`sanitizeOptionGroups`, `boothHoursSchema`/
  `parseBoothHours`, `paymentConfigSchema` (discriminated union over
  pointer/paynow/stripe with cross-field `.superRefine` rules — validates the
  vendor-submitted config before `dashboard/booths/actions.ts` forwards it to
  paykit; `booths.payment` itself now stores only a `{kind}` marker, so
  there's no longer a `parsePaymentConfig` DB-read counterpart), `placeOrderSchema`, `orderRowSchema`/
  `parseRealtimeOrderEvent`'s dependency, `parseOrderRef` (validates the
  boothId/orderNumber/token triple every customer order action receives),
  `feedbackSchema`, `supportMessageSchema`, `profileNameSchema`/
  `displayNameSchema`/`passwordChangeSchema`, `boardSettingsSchema` (now also
  `daily_order_number_reset: boolean` and `default_prep_minutes:
1-60|null`, migration 0062; `show_wait_estimate: boolean`, migration 0068;
  `customer_telegram_notify_enabled: z.boolean().default(true)`, 2026-08-16 —
  a vendor-side opt-out for `advanceOrder`'s customer Telegram "order ready"
  ping, `.default(true)` so every pre-existing `board_settings` row, which
  predates this key, keeps notifying exactly as before — no migration, this
  is a JSONB column key not a SQL column),
  `pricingFormSchema`/`grantPassSchema`,
  `parseMenuItems`/`parseOrderItems`, `menuCategorySchema`/
  `menuCategoriesSchema`/`parseMenuCategories` (booth's ordered
  `{id, label}` menu sections, migration 0066 — schema/types only, no UI
  yet). `boothFormSchema` also carries `walkup_default: z.boolean()
.default(false)` (migration 0080, event-mode setup — makes the live board
  auto-open walk-up order entry for that booth) alongside
  `requires_arrival_confirm`. `boothFormSchema` no longer carries
  `menu_items` (2026-09-01, the menu-manager split) — that column is now
  owned exclusively by `menuItemsInputSchema` (`z.array(menuItemFormSchema)`),
  the input schema for `dashboard/booths/actions.ts`'s new `saveMenuItems`,
  so `saveBooth` never reads or writes it and the two actions can't clobber
  each other with stale client state.
- `schemas.test.ts` — the largest test file in `lib/`: validates every schema
  above, including the payment-config cross-field rules (xor of UEN/mobile,
  pointer requiring a link or QR) and the tolerant vs. strict read/write
  boundary distinction.
- `stats.ts` — `computeStats(orders, topN)`: the core stats/margin engine —
  revenue, AOV, cancellation/refund/fulfilment rates, per-item revenue/cost/
  profit aggregation (`topItems`), hourly and day×hour (SGT) buckets,
  `optionBreakdown`, `grossMargin` (only computed when at least one item
  carries a cost); also `windowSeries`/`waitSeries` (bucketed trend/wait-time
  series), `avgWaitSeconds`, `peakThroughput`, `pctChange`,
  `estimateWaitSeconds` (recent-average × orders-ahead customer wait
  estimate, null below `minSample`; takes an optional
  `fallbackAvgSecondsPerOrder` — board_settings.default_prep_minutes × 60 —
  used only below that sample size, so a vendor's manual estimate never
  overrides real, trusted data), `currentPrepEstimate` (same threshold gate
  as `estimateWaitSeconds`, but returns the recent average in minutes plus
  the raw sample count/`minSample` instead of multiplying by orders-ahead —
  a vendor-facing "here's what's live right now" label for the Settings
  page, not part of any customer-facing wait calculation).
- `stats.test.ts` — tests bucketing, margin computation, refund detection,
  fulfilment-rate math, the trend/wait series against synthetic orders,
  `estimateWaitSeconds`'s fallback (used below the sample size, ignored once
  real data meets it, null when neither is available), and
  `currentPrepEstimate`'s below/at/custom-sample-size cases and its
  sample-met-but-no-usable-wait-data null case.
- `stock.ts` — `parseRemaining`/`remainingFor`: parses the
  `booth_remaining_stock` JSONB RPC result into a typed per-item remaining-
  count map (Postgres is authoritative; this just reports it to the cart UI).
- `stock.test.ts` — tests parsing of malformed/partial remaining-stock data.
- `stuck-orders.ts` — `statusSinceByOrder(orders, events)`: maps each order to
  when it entered its CURRENT status — the latest matching
  `order_status_events` row's `created_at` (migration 0078), or the order's
  own `created_at` when there's no event yet (an order that's never
  advanced past its initial placement, or a stale/mismatched latest event —
  `recordOrderStatusEvent`, `src/lib/audit.ts`, is best-effort and can
  silently fail). `findStuckOrders(orders, nowMs)`: non-terminal orders
  (`@/lib/orders`'s `isTerminal`) sitting past `STUCK_THRESHOLD_MS` (30 min)
  in their current status, longest-stuck first — the `/admin` overview's
  "Stuck orders" stat + list (`admin/stuck-orders-section.tsx`).
- `stuck-orders.test.ts` — tests the events-vs-created_at fallback
  (no events, a matching latest event, a mismatched/stale latest event, and
  events belonging to other orders) and threshold/terminal-status flagging
  across all four non-terminal statuses plus sort order.
- `supabase/` — the three Supabase client factories (browser/server/service-
  role) plus entitlement/user/vendor read helpers; see its own README.
- `types.ts` — the hand-maintained mirror of the `qkit` Postgres schema: core
  domain types (`OrderStatus`, `OrderSource` — `"qr"` | `"walkup"`, migration
  0060 — `Plan`, `PaymentConfig`, `MenuItem`, `CartItem`,
  `OrderItem`, `BoardSettings`/`DEFAULT_BOARD_SETTINGS` — now also
  `daily_order_number_reset`/`default_prep_minutes`, migration 0062), and the
  full `Database["qkit"]` `Tables`/`Functions`/`Enums` shape (vendors, admins,
  admin_audit, events, licenses, payments, pricing, feedback,
  purchase_requests, support_messages, booths — now also `walkup_default:
boolean`, migration 0080 — orders, booth_item_sold —
  `vendor_telegram`/`telegram_link_tokens` from migration 0076 were dropped
  again in migration 0077, Phase A2's retirement of qkit's own Telegram bot;
  RPCs
  `next_order_number`, `booth_remaining_stock`, `booth_servable`,
  `check_rate_limit`, `place_order`, `place_walkup_order` (now with `p_paid`,
  migration 0061), `get_booth_for_order`, `regenerate_short_code`,
  `submit_feedback`, `set_license_label`, `gen_short_code`) plus derived
  row-type aliases (`Vendor`, `Booth`, `Order`, `BoardOrder` = `Order` minus
  `access_token`, `License`, `Pricing`, `Payment`, `Feedback`, `Admin`,
  `AdminAudit`). Must be kept in sync with `supabase/migrations/` by hand (or
  via `supabase gen types typescript`).
- `tz.ts` — Singapore-only wall-clock helpers built on cached
  `Intl.DateTimeFormat` instances: `sgtHour`/`sgtMinutes`/`sgtWeekday`,
  `WEEKDAY_ORDER`/`WEEKDAY_LABELS`, display formatters `shortDay`/
  `sgtClock`/`sgtWeekdayTime`/`shortDateTime`, and `sgtStartOfDayIso` (the UTC
  instant for SGT midnight of a given moment — the query boundary for
  "today" in SGT, e.g. the daily order-number reset baseline and the
  completed-orders page's default "Today" filter) — always formats/computes
  in `Asia/Singapore`, never server UTC or the browser's tz, to stay
  hydration-safe.
- `tz.test.ts` — tests hour/weekday extraction, each display formatter
  against fixed ISO instants, and `sgtStartOfDayIso`'s day-boundary rollover.
- `utils.ts` — `cn` (clsx + tailwind-merge), shared form style constants
  (`FORM_LABEL_CLASS`, `FORM_ERROR_CLASS`), `MS_PER_HOUR`/`MS_PER_DAY`,
  `formatPrice`, `centsToDollarString`, `parseDollarsToCents` (keystroke-level
  validation for money inputs), `orderHasPricing`, `count` (pluralized noun),
  `formatOptions`, `menuItemActionLabel` (a menu item's add/customize button
  label — sold out / customize / add — shared by the customer order form and
  the vendor's walk-up order dialog).
- `utils.test.ts` — tests price formatting, dollar-string parsing edge cases,
  and pluralization.

## Connectivity

`supabase/` provides the client factories (`createClient`/`createServerClient`/
`createServiceClient`) that every Server Action, Route Handler, and Server
Component in `src/app/` depends on for data access; `paykit/` provides the
HTTP client the customer checkout flow (order-status `page.tsx`,
`payment-actions.ts`) and the vendor "quick add PayNow" form
(`dashboard/booths/actions.ts`) both call through. Nearly every other module
here is pure (no DB, no React, no
`Date.now()` — clocks/`now` are passed as arguments) so it is directly
unit-tested and covered by `pnpm test:mutation` (Stryker, scoped to `src/lib`).
`types.ts` is the DB type mirror imported almost everywhere for row shapes;
`schemas.ts` is the Zod boundary imported by every Server Action and form in
`src/app/` plus by `realtime-orders.ts` (which validates untrusted Realtime
payloads via `orderRowSchema`) and `reorder-handoff.ts`/`cart-storage.ts`
(which validate `sessionStorage` reads via `isValidLine`). `orders.ts`'s
`BOARD_ORDER_COLUMNS` is shared between the dashboard's server query and
`src/hooks/use-realtime-orders.ts`'s resync query so both stay in sync.
`stats.ts` feeds `sales-summary.ts` (the frozen `/api/v1/sales/summary`
contract) and the admin/vendor stats dashboards. `stuck-orders.ts` feeds the
`/admin` overview's "Stuck orders" stat + `StuckOrdersSection` list. `plan.ts`'s `Entitlement`
feeds `booth-access.ts`'s serveability calculation, mirroring the
`booth_servable` SQL function in `supabase/migrations/`.

## Parent

[src](../README.md)
