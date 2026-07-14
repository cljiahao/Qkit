# lib

## Purpose

Framework-agnostic business logic for QKit: order/booth/entitlement rules, stats
and margin aggregation, the Zod schemas that validate every server-action/form
boundary, and the DB type mirror. Kept free of React and Next.js so it is
unit-testable (and Stryker-mutation-tested) without a DOM or a live database;
`payments/` and `supabase/` are the two subfolders that do carry I/O concerns
(payment-adapter logic and the Supabase client factories, respectively).

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
- `merqo-downgrade-request.ts` — `resolveDowngradeOutcome(hasVendorRow,
currentPlan)`: pure decision (`not_found`/`already_free`/`downgrade`) for the
  admin downgrade-vendor action.
- `merqo-downgrade-request.test.ts` — tests the three outcome branches.
- `merqo-metrics.ts` — `computeMerqoMetrics`: QKit's own business metrics
  (revenue/GMV, active vendors, weekly order deltas, signups, plan mix,
  pending upgrade requests, activation funnel) built on top of
  `admin-stats.ts`'s `summarizeVendors`/`activationFunnel`.
- `merqo-metrics.test.ts` — tests the metrics aggregation against synthetic
  vendor/booth/order/payment fixtures.
- `merqo-upgrade-request.ts` — `resolveUpgradeOutcome(hasVendorRow,
hasPendingRequest)`: pure decision (`not_found`/`already_pending`/`create`)
  for the admin/vendor upgrade-to-Pro request flow.
- `merqo-upgrade-request.test.ts` — tests the three outcome branches.
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
  payment on completion), `sortActiveOrders`, `orderProgressIndex` (customer
  3-segment progress bar).
- `orders.test.ts` — tests status transitions, patch-building (including the
  payment auto-confirm-on-complete rule), sorting, and age/label formatting.
- `payments/` — PayNow QR generation and the payment-method adapter registry
  (pointer/PayNow/Stripe-stub); see its own README.
- `plan.test.ts` — tests entitlement resolution across plan/pass/pro
  combinations and the `canAdd*`/`canHaveOptionGroups` gates.
- `plan.ts` — `Entitlement`/`Tier` model (`FREE`/`PASS`/`PRO` presets),
  `getEntitlement` (resolves a vendor's effective entitlement from
  `plan`+license expiry), `normalizePlan`, `canAddBooth`, `canAddMenuItem`,
  `canHaveOptionGroups`.
- `pricing.ts` — `PricingConfig` type and `DEFAULT_PRICING` (zeroed fallback
  when the `pricing` row is unreadable, e.g. pre-migration).
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
  pointer/paynow/stripe with cross-field `.superRefine` rules) and
  `parsePaymentConfig`, `placeOrderSchema`, `orderRowSchema`/
  `parseRealtimeOrderEvent`'s dependency, `parseOrderRef` (validates the
  boothId/orderNumber/token triple every customer order action receives),
  `feedbackSchema`, `supportMessageSchema`, `profileNameSchema`/
  `displayNameSchema`/`passwordChangeSchema`, `boardSettingsSchema`,
  `pricingFormSchema`/`grantPassSchema`, `parseMenuItems`/`parseOrderItems`.
- `schemas.test.ts` — the largest test file in `lib/`: validates every schema
  above, including the payment-config cross-field rules (xor of UEN/mobile,
  pointer requiring a link or QR) and the tolerant vs. strict read/write
  boundary distinction.
- `stats.ts` — `computeStats(orders, topN)`: the core stats/margin engine —
  revenue, AOV, cancellation/refund/fulfilment rates, per-item revenue/cost/
  profit aggregation (`topItems`), hourly and day×hour (SGT) buckets,
  `optionBreakdown`, `grossMargin` (only computed when at least one item
  carries a cost); also `windowSeries`/`waitSeries` (bucketed trend/wait-time
  series), `avgWaitSeconds`, `peakThroughput`, `pctChange`.
- `stats.test.ts` — tests bucketing, margin computation, refund detection,
  fulfilment-rate math, and the trend/wait series against synthetic orders.
- `stock.ts` — `parseRemaining`/`remainingFor`: parses the
  `booth_remaining_stock` JSONB RPC result into a typed per-item remaining-
  count map (Postgres is authoritative; this just reports it to the cart UI).
- `stock.test.ts` — tests parsing of malformed/partial remaining-stock data.
- `supabase/` — the three Supabase client factories (browser/server/service-
  role) plus entitlement/user/vendor read helpers; see its own README.
- `types.ts` — the hand-maintained mirror of the `qkit` Postgres schema: core
  domain types (`OrderStatus`, `Plan`, `PaymentConfig`, `MenuItem`, `CartItem`,
  `OrderItem`, `BoardSettings`/`DEFAULT_BOARD_SETTINGS`), and the full
  `Database["qkit"]` `Tables`/`Functions`/`Enums` shape (vendors, admins,
  admin_audit, events, licenses, payments, pricing, feedback,
  purchase_requests, support_messages, booths, orders, booth_item_sold; RPCs
  `next_order_number`, `booth_remaining_stock`, `booth_servable`,
  `check_rate_limit`, `place_order`, `get_booth_for_order`,
  `regenerate_short_code`, `submit_feedback`, `set_license_label`,
  `gen_short_code`) plus derived row-type aliases (`Vendor`, `Booth`, `Order`,
  `BoardOrder` = `Order` minus `access_token`, `License`, `Pricing`, `Payment`,
  `Feedback`, `Admin`, `AdminAudit`). Must be kept in sync with
  `supabase/migrations/` by hand (or via `supabase gen types typescript`).
- `tz.ts` — Singapore-only wall-clock helpers built on cached
  `Intl.DateTimeFormat` instances: `sgtHour`/`sgtMinutes`/`sgtWeekday`,
  `WEEKDAY_ORDER`/`WEEKDAY_LABELS`, and display formatters `shortDay`/
  `sgtClock`/`sgtWeekdayTime`/`shortDateTime` — always formats in
  `Asia/Singapore`, never server UTC or the browser's tz, to stay
  hydration-safe.
- `tz.test.ts` — tests hour/weekday extraction and each display formatter
  against fixed ISO instants.
- `utils.ts` — `cn` (clsx + tailwind-merge), shared form style constants
  (`FORM_LABEL_CLASS`, `FORM_ERROR_CLASS`), `MS_PER_HOUR`/`MS_PER_DAY`,
  `formatPrice`, `centsToDollarString`, `parseDollarsToCents` (keystroke-level
  validation for money inputs), `orderHasPricing`, `count` (pluralized noun),
  `formatOptions`.
- `utils.test.ts` — tests price formatting, dollar-string parsing edge cases,
  and pluralization.

## Connectivity

`supabase/` provides the client factories (`createClient`/`createServerClient`/
`createServiceClient`) that every Server Action, Route Handler, and Server
Component in `src/app/` depends on for data access; `payments/` provides the
adapter registry consumed by booth payment-config rendering and the PayNow QR
render path. Nearly every other module here is pure (no DB, no React, no
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
contract) and the admin/vendor stats dashboards. `plan.ts`'s `Entitlement`
feeds `booth-access.ts`'s serveability calculation, mirroring the
`booth_servable` SQL function in `supabase/migrations/`.

## Parent

[src](../README.md)
