# Vendor UI and business-logic review, 2026-10-07

## Scope and evidence

Reviewed vendor/admin action boundaries, the live order board and its hooks,
walk-up/cart and menu-import flows, order cards, payment-proof rendering,
analytics queries and aggregation, and shared business utilities. Applied the
existing frontend-design guidance without changing the visual design. Read the
repository AGENTS.md. No secrets, environment files, dependency implementations,
or build artifacts were read for this review.

The inventory below records every scoped path and its purpose. Inventory and
import-graph coverage do not mean every rendering branch was manually exercised.
The behavioral findings have direct source evidence and targeted regressions;
other UI paths received source/import/test-surface inspection. No browser,
screen-reader, or real Supabase integration session was run by this reviewer.
The coordinating agent owns final suite, coverage, formatting, lint, typecheck,
dependency audit, and database verification results.

## Findings and repairs

| Priority | Finding and original evidence                                                                                                                                                                                                               | Disposition                                                                                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | `src/app/admin/actions.ts:246`: service-role update of shared support messages restricted only by UUID, unlike qkit-scoped reads. A qkit administrator could resolve another kit's known message.                                           | Add `kit_slug=qkit` update predicate and boundary regression.                                                                                                                                                                         |
| P1       | `src/hooks/use-realtime-orders.ts:34`: reconnect fetched active rows but retained every locally active row absent from the snapshot. Orders completed while disconnected stayed active. First subscription skipped reconciliation entirely. | Reconcile initial and subsequent subscriptions, remove stale active rows, retain terminal history, protect in-flight realtime changes and obsolete requests. Fresh-eyes review also required unknown UPDATE upsert and keyset paging. |
| P2       | `src/lib/reorder.ts:94`: persisted/reordered carts restored the base price but omitted current option surcharges. The server charged the correct amount while the displayed cart was lower.                                                 | Recompute option deltas with the shared cart helper; test both priced and unpriced base items.                                                                                                                                        |
| P2       | `src/app/dashboard/walkup-order-dialog.tsx:124`: previous booth/opening's asynchronous menu could overwrite the current selection. A rejected submit at line 233 never reset the pending flag.                                              | Ignore obsolete responses, surface rejected menu requests, reset submit in finally, preserve cart on uncertain submission.                                                                                                            |
| P2       | `src/lib/menu-csv.ts:232`: export quoted multiline descriptions, then import split every physical line before quote parsing.                                                                                                                | Parse complete quoted records; cover LF, CRLF, and CR roundtrips.                                                                                                                                                                     |
| P2       | `src/lib/stats.ts:350`: concatenating group and choice merged distinct pairs such as AB/C and A/BC.                                                                                                                                         | Use a JSON tuple key and assert separate counts.                                                                                                                                                                                      |
| P2       | `src/components/payment-proof-viewer.tsx:65`: substring amount match accepted $15.50 for expected $5.50; the UI described a screenshot as paid. OCR workers leaked on recognition failure and continued after closing.                      | Whole monetary-token matching, amount-only wording, and worker cleanup with rejection/unmount regressions.                                                                                                                            |
| P2       | `src/app/dashboard/stats/queries.ts:15,45,95`: unpaged order reads silently truncated range, lifetime, and event aggregates at the API cap.                                                                                                 | Coordinating agent owns pagination fix and tests.                                                                                                                                                                                     |
| P2       | Range/sort button state was communicated by color alone in `realtime-order-board.tsx:920`, `stats-controls.tsx:58`, and `completed-orders-list.tsx:119`; booth selectors lacked programmatic labels.                                        | Add pressed state and selector names without visual changes.                                                                                                                                                                          |

Supabase documents its default 1,000-row API response maximum and pagination
mechanism in [the official select reference](https://supabase.com/docs/reference/javascript/v1/select)
and [range reference](https://supabase.com/docs/reference/javascript/using-modifiers-range).

## Remaining limitations and follow-up priorities

- **P1: cross-service payment/order race.** `order-actions.ts` checks payment on
  read in `cancelOrder` but updates by status alone. `confirmOrderPayment` calls
  paykit before updating the local mirror, guarded by payment state alone. A
  concurrent cancel and external confirmation can leave cancelled plus paid.
  Local compare-and-set predicates alone cannot make the paykit operation and
  Postgres transaction atomic. A reconciliation/compensation contract needs a
  dedicated design and integration test; do not claim this is fixed.
- **P2: admin plan/payment ledger concurrency.** `admin/actions.ts:49-79` reads
  the current plan, changes it, then inserts a payment separately. Two calls can
  both read free and both insert ledger rows. The comment promising double-click
  idempotency is stronger than the implementation. A transactional RPC or
  idempotency key is needed. Existing sequential tests do not prove concurrency.
- **P2: expiry/count refresh.** `dashboard/page.tsx:93,131` computes cups-today
  and daily number baselines at page load. The board does not reset those props
  at Singapore midnight. Long-running event tablets can display yesterday's
  baseline/count. Scheduling a new-day refresh needs a clock-boundary test.
- **P2: read failures and partial review samples.** Several admin and stats
  queries discard error objects and substitute empty arrays. Event reviews
  intersect event order keys with the latest 500 reviews overall, so old events
  can appear review-free once enough later reviews exist. Label bounded samples
  and fetch by event membership in the database where totals are promised.
- **P3: notification/action latency.** `order-actions.ts:112-141` awaits two
  audit writes, a preferences read and a notification after committing the
  transition. Failure is best effort but latency is on the action's critical
  path. Batch audit writes or use supported post-response work while preserving
  durability expectations. Sweep loops await one audit insert per order.
- **P3: timer/work growth.** `use-polling.ts:28` permits overlapping slow ticks
  and does not handle rejected callbacks; `use-printer-status.ts:73` polls hidden
  tabs, and every order card has a 30-second clock. Realtime terminal history is
  retained for the mounted shift to support undo/overtaken indicators. Profile
  long sessions before introducing virtualization or a shared clock.
- **P3: delayed realtime payloads.** The snapshot merger keeps the newer
  `updated_at`, but the realtime event reducer still accepts every valid payload.
  A delayed old event following a newer snapshot could regress local state.
  A timestamp-ordering guard needs a regression proving equal-timestamp and
  deletion behavior before changing that contract.
- **P3: menu CSV spreadsheet formulas.** Both `menu-csv.ts:6` and
  `sales-summary.ts:82` escape CSV syntax but do not neutralize leading spreadsheet
  formulas. Menu names are vendor-authored and imports require that vendor's
  interaction; this is not arbitrary server code execution. Define an explicit
  spreadsheet-safe export policy that preserves import roundtrips before changing
  content silently.
- **P3: broad component responsibility.** The live board and order card are each
  about 1,000 lines and combine timers, mutation orchestration and rendering.
  Extracting a narrowly tested mutation/timer hook would reduce coupling when
  these paths next change; a review alone does not justify a wholesale rewrite.

## Necessity, DRY, and scope decisions

- Keep the small adapters around `@merqo/ui`: they preserve qkit's existing API,
  image policy, navigation semantics, and tour integration. Thin adapters are not
  evidence of unnecessary abstraction.
- Keep customer and walk-up forms separate at orchestration level: customer
  persistence, access tokens, navigation and notifications differ. Share pure
  cart/price/stock operations, as the surcharge repair does.
- Keep the explicit 500-order completed-history limit: the UI discloses it and
  applies local pagination. It is different from silently truncated totals.
- The coordinating agent's import graph found `components/ui/avatar.tsx` as the
  only unreferenced application module and owns its removal. No other file is a
  justified deletion candidate solely because it is short or only used once.
- `hooks/README.md` still described the removed `use-money-field.ts` after its
  migration to the shared UI package; that stale documentation entry was removed.
- No new framework, generalized repository abstraction, component library, or
  cosmetics were warranted by these findings.

## Coverage assessment

Existing tests cover much pure logic and component happy-path behavior. Added
tests target real missed cases: reconnect absence, hydration gap, realtime events
arriving during snapshots, stale menu responses, async failure recovery, monetary
token boundaries, worker resource cleanup, CSV roundtrips, option-key collisions,
and restored-cart option pricing. None of these prove live RLS or cross-kit
atomicity. Remaining high-value tests are concurrent cancel/confirm and plan
ledger writes, midnight refresh, offset/keyset membership changes, complete event
review history, keyboard operation, and real screen-reader announcement checks.

## Scoped file inventory

The following mechanically enumerated inventory supplements the targeted source
review. Purpose labels come from the source filename and exported declarations;
test files are retained as regression coverage and README files as local contracts.

| Path                                                                   | Purpose                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/app/admin/actions.test.ts`                                        | Regression coverage                                                                  |
| `src/app/admin/actions.ts`                                             | setVendorPlan, grantPass, resolvePurchaseRequest, resolveSupportMessage              |
| `src/app/admin/activation-funnel.tsx`                                  | ActivationFunnelView                                                                 |
| `src/app/admin/admin-nav.tsx`                                          | AdminNav                                                                             |
| `src/app/admin/audit-log.dom.test.tsx`                                 | Regression coverage                                                                  |
| `src/app/admin/audit-log.tsx`                                          | AdminAuditLog                                                                        |
| `src/app/admin/banner-form.dom.test.tsx`                               | Regression coverage                                                                  |
| `src/app/admin/banner-form.tsx`                                        | BannerForm                                                                           |
| `src/app/admin/feedback/page.tsx`                                      | revalidate, AdminFeedbackPage                                                        |
| `src/app/admin/feedback/README.md`                                     | Local module contract and connectivity                                               |
| `src/app/admin/layout.tsx`                                             | AdminLayout                                                                          |
| `src/app/admin/not-found.tsx`                                          | AdminNotFound                                                                        |
| `src/app/admin/page.tsx`                                               | revalidate, AdminPage                                                                |
| `src/app/admin/pricing-section.dom.test.tsx`                           | Regression coverage                                                                  |
| `src/app/admin/pricing-section.tsx`                                    | PricingSection                                                                       |
| `src/app/admin/README.md`                                              | Local module contract and connectivity                                               |
| `src/app/admin/resolve-message-button.tsx`                             | ResolveMessageButton                                                                 |
| `src/app/admin/resolve-request-button.tsx`                             | ResolveRequestButton                                                                 |
| `src/app/admin/stat.tsx`                                               | Stat                                                                                 |
| `src/app/admin/stuck-orders-section.dom.test.tsx`                      | Regression coverage                                                                  |
| `src/app/admin/stuck-orders-section.tsx`                               | StuckOrdersSection                                                                   |
| `src/app/admin/vendor-list.tsx`                                        | VendorListItem, VendorList                                                           |
| `src/app/admin/vendor-manage.tsx`                                      | AdminVendorRow, VendorManage                                                         |
| `src/app/admin/vendor-status.tsx`                                      | StatusChip                                                                           |
| `src/app/admin/vendors/[id]/page.tsx`                                  | revalidate, AdminVendorDetailPage                                                    |
| `src/app/admin/vendors/[id]/README.md`                                 | Local module contract and connectivity                                               |
| `src/app/admin/vendors/page.tsx`                                       | revalidate, AdminVendorsPage                                                         |
| `src/app/admin/vendors/README.md`                                      | Local module contract and connectivity                                               |
| `src/app/dashboard/booths/[boothId]/menu/page.tsx`                     | revalidate, BoothMenuPage                                                            |
| `src/app/dashboard/booths/[boothId]/menu/README.md`                    | Local module contract and connectivity                                               |
| `src/app/dashboard/booths/[boothId]/page.tsx`                          | revalidate, EditBoothPage                                                            |
| `src/app/dashboard/booths/[boothId]/qr/booth-qr-poster.tsx`            | BoothQrPoster                                                                        |
| `src/app/dashboard/booths/[boothId]/qr/page.tsx`                       | revalidate, BoothQrPage                                                              |
| `src/app/dashboard/booths/[boothId]/qr/README.md`                      | Local module contract and connectivity                                               |
| `src/app/dashboard/booths/[boothId]/qr/regenerate-button.dom.test.tsx` | Regression coverage                                                                  |
| `src/app/dashboard/booths/[boothId]/qr/regenerate-button.tsx`          | RegenerateButton                                                                     |
| `src/app/dashboard/booths/[boothId]/README.md`                         | Local module contract and connectivity                                               |
| `src/app/dashboard/booths/actions.test.ts`                             | Regression coverage                                                                  |
| `src/app/dashboard/booths/actions.ts`                                  | deleteBooth, regenerateShortCode, saveBooth, saveMenuItems                           |
| `src/app/dashboard/booths/booking-status-section.dom.test.tsx`         | Regression coverage                                                                  |
| `src/app/dashboard/booths/booking-status-section.tsx`                  | BookingStatusSection                                                                 |
| `src/app/dashboard/booths/booth-form.dom.test.tsx`                     | Regression coverage                                                                  |
| `src/app/dashboard/booths/booth-form.images.dom.test.tsx`              | Regression coverage                                                                  |
| `src/app/dashboard/booths/booth-form.tsx`                              | BoothForm                                                                            |
| `src/app/dashboard/booths/booth-list.dom.test.tsx`                     | Regression coverage                                                                  |
| `src/app/dashboard/booths/booth-list.tsx`                              | BoothList                                                                            |
| `src/app/dashboard/booths/close-booth-control.dom.test.tsx`            | Regression coverage                                                                  |
| `src/app/dashboard/booths/close-booth-control.tsx`                     | CloseBoothControl                                                                    |
| `src/app/dashboard/booths/menu-editor.dom.test.tsx`                    | Regression coverage                                                                  |
| `src/app/dashboard/booths/menu-editor.tsx`                             | reorderMenuItems, moveItemToGroup, resolveItemDrop, reorderCategories                |
| `src/app/dashboard/booths/menu-manager.dom.test.tsx`                   | Regression coverage                                                                  |
| `src/app/dashboard/booths/menu-manager.images.dom.test.tsx`            | Regression coverage                                                                  |
| `src/app/dashboard/booths/menu-manager.tsx`                            | MenuManager                                                                          |
| `src/app/dashboard/booths/new/page.dom.test.tsx`                       | Regression coverage                                                                  |
| `src/app/dashboard/booths/new/page.tsx`                                | revalidate, NewBoothPage                                                             |
| `src/app/dashboard/booths/new/README.md`                               | Local module contract and connectivity                                               |
| `src/app/dashboard/booths/option-groups-editor.dom.test.tsx`           | Regression coverage                                                                  |
| `src/app/dashboard/booths/option-groups-editor.tsx`                    | OptionGroupsEditor                                                                   |
| `src/app/dashboard/booths/page.tsx`                                    | revalidate, BoothsPage                                                               |
| `src/app/dashboard/booths/payment-section.dom.test.tsx`                | Regression coverage                                                                  |
| `src/app/dashboard/booths/payment-section.tsx`                         | PaymentSection                                                                       |
| `src/app/dashboard/booths/printer-status.dom.test.tsx`                 | Regression coverage                                                                  |
| `src/app/dashboard/booths/printer-status.tsx`                          | PrinterStatus                                                                        |
| `src/app/dashboard/booths/printing-section.dom.test.tsx`               | Regression coverage                                                                  |
| `src/app/dashboard/booths/printing-section.tsx`                        | PrintingSection                                                                      |
| `src/app/dashboard/booths/README.md`                                   | Local module contract and connectivity                                               |
| `src/app/dashboard/booths/social-links-section.dom.test.tsx`           | Regression coverage                                                                  |
| `src/app/dashboard/booths/social-links-section.tsx`                    | SocialLinksSection                                                                   |
| `src/app/dashboard/booths/sweep-unsaved-uploads.test.ts`               | Regression coverage                                                                  |
| `src/app/dashboard/booths/sweep-unsaved-uploads.ts`                    | sweepUnsavedUploads                                                                  |
| `src/app/dashboard/booths/working-hours-editor.tsx`                    | WorkingHoursEditor                                                                   |
| `src/app/dashboard/completed/completed-orders-list.dom.test.tsx`       | Regression coverage                                                                  |
| `src/app/dashboard/completed/completed-orders-list.tsx`                | CompletedOrdersList                                                                  |
| `src/app/dashboard/completed/page.tsx`                                 | revalidate, CompletedOrdersPage                                                      |
| `src/app/dashboard/completed/README.md`                                | Local module contract and connectivity                                               |
| `src/app/dashboard/dashboard-nav.dom.test.tsx`                         | Regression coverage                                                                  |
| `src/app/dashboard/dashboard-nav.tsx`                                  | DashboardNav                                                                         |
| `src/app/dashboard/feedback/page.tsx`                                  | revalidate, DashboardFeedbackPage                                                    |
| `src/app/dashboard/feedback/README.md`                                 | Local module contract and connectivity                                               |
| `src/app/dashboard/layout.dom.test.tsx`                                | Regression coverage                                                                  |
| `src/app/dashboard/layout.tsx`                                         | DashboardLayout                                                                      |
| `src/app/dashboard/loading.tsx`                                        | Loading                                                                              |
| `src/app/dashboard/not-found.tsx`                                      | DashboardNotFound                                                                    |
| `src/app/dashboard/order-actions.test.ts`                              | Regression coverage                                                                  |
| `src/app/dashboard/order-actions.ts`                                   | advanceOrder, revertOrderAdvance, confirmPaymentAndStart, revertPaymentAndStart      |
| `src/app/dashboard/page.tsx`                                           | revalidate, DashboardPage                                                            |
| `src/app/dashboard/plan/page.dom.test.tsx`                             | Regression coverage                                                                  |
| `src/app/dashboard/plan/page.tsx`                                      | revalidate, PlanPage                                                                 |
| `src/app/dashboard/plan/pass-countdown.tsx`                            | PassCountdown                                                                        |
| `src/app/dashboard/plan/README.md`                                     | Local module contract and connectivity                                               |
| `src/app/dashboard/plan/upgrade-cta.tsx`                               | UpgradeCta                                                                           |
| `src/app/dashboard/profile/actions.test.ts`                            | Regression coverage                                                                  |
| `src/app/dashboard/profile/actions.ts`                                 | updateStallName, updateSocialLinks                                                   |
| `src/app/dashboard/profile/page.tsx`                                   | revalidate, ProfilePage                                                              |
| `src/app/dashboard/profile/profile-form.avatar.dom.test.tsx`           | Regression coverage                                                                  |
| `src/app/dashboard/profile/profile-form.dom.test.tsx`                  | Regression coverage                                                                  |
| `src/app/dashboard/profile/profile-form.tsx`                           | ProfileForm                                                                          |
| `src/app/dashboard/profile/README.md`                                  | Local module contract and connectivity                                               |
| `src/app/dashboard/proof-actions.test.ts`                              | Regression coverage                                                                  |
| `src/app/dashboard/proof-actions.ts`                                   | getProofPhotoUrl, findDuplicateProofOrder                                            |
| `src/app/dashboard/README.md`                                          | Local module contract and connectivity                                               |
| `src/app/dashboard/realtime-order-board.dom.test.tsx`                  | Regression coverage                                                                  |
| `src/app/dashboard/realtime-order-board.tsx`                           | RealtimeOrderBoard                                                                   |
| `src/app/dashboard/settings/actions.ts`                                | updateBoardSettings                                                                  |
| `src/app/dashboard/settings/page.tsx`                                  | revalidate, SettingsPage                                                             |
| `src/app/dashboard/settings/README.md`                                 | Local module contract and connectivity                                               |
| `src/app/dashboard/settings/settings-form.dom.test.tsx`                | Regression coverage                                                                  |
| `src/app/dashboard/settings/settings-form.tsx`                         | SettingsForm                                                                         |
| `src/app/dashboard/stats/actions.test.ts`                              | Regression coverage                                                                  |
| `src/app/dashboard/stats/actions.ts`                                   | renameEvent                                                                          |
| `src/app/dashboard/stats/busy-heatmap.tsx`                             | BusyHeatmap                                                                          |
| `src/app/dashboard/stats/chart-format.test.ts`                         | Regression coverage                                                                  |
| `src/app/dashboard/stats/chart-format.ts`                              | RANGE_LABEL, rangeCaption, hourLabel, fmtWait                                        |
| `src/app/dashboard/stats/event-stats-view.tsx`                         | EventStatsView                                                                       |
| `src/app/dashboard/stats/events-panel.tsx`                             | EventsPanel                                                                          |
| `src/app/dashboard/stats/export-button.tsx`                            | ExportButton                                                                         |
| `src/app/dashboard/stats/kpi-row.tsx`                                  | StatTile, KpiRow                                                                     |
| `src/app/dashboard/stats/margin-table.tsx`                             | MarginTable                                                                          |
| `src/app/dashboard/stats/options-breakdown.tsx`                        | OptionsBreakdown                                                                     |
| `src/app/dashboard/stats/page.tsx`                                     | revalidate, StatsPage                                                                |
| `src/app/dashboard/stats/queries.test.ts`                              | Regression coverage                                                                  |
| `src/app/dashboard/stats/queries.ts`                                   | fetchOrders, fetchAllTimeTotals, fetchReviewRows, fetchEventReviewRows               |
| `src/app/dashboard/stats/README.md`                                    | Local module contract and connectivity                                               |
| `src/app/dashboard/stats/reviews-card.tsx`                             | ReviewsCard                                                                          |
| `src/app/dashboard/stats/service-speed-chart.tsx`                      | ServiceSpeedChart                                                                    |
| `src/app/dashboard/stats/stat-breakdown.tsx`                           | BreakdownRow, StatBreakdownTile                                                      |
| `src/app/dashboard/stats/stats-components.dom.test.tsx`                | Regression coverage                                                                  |
| `src/app/dashboard/stats/stats-controls.tsx`                           | StatsControls                                                                        |
| `src/app/dashboard/stats/stats-view.tsx`                               | StatsView                                                                            |
| `src/app/dashboard/stats/top-items.tsx`                                | TopItems                                                                             |
| `src/app/dashboard/stats/trend-chart.tsx`                              | TrendChart                                                                           |
| `src/app/dashboard/tour-actions.test.ts`                               | Regression coverage                                                                  |
| `src/app/dashboard/tour-actions.ts`                                    | markTourSeen                                                                         |
| `src/app/dashboard/walkup-actions.test.ts`                             | Regression coverage                                                                  |
| `src/app/dashboard/walkup-actions.ts`                                  | placeWalkupOrder                                                                     |
| `src/app/dashboard/walkup-menu-actions.test.ts`                        | Regression coverage                                                                  |
| `src/app/dashboard/walkup-menu-actions.ts`                             | getWalkupMenu                                                                        |
| `src/app/dashboard/walkup-order-dialog.dom.test.tsx`                   | Regression coverage                                                                  |
| `src/app/dashboard/walkup-order-dialog.tsx`                            | WalkupOrderDialog                                                                    |
| `src/components/allergen-badges.tsx`                                   | AllergenBadges                                                                       |
| `src/components/dashboard-tour.dom.test.tsx`                           | Regression coverage                                                                  |
| `src/components/dashboard-tour.tsx`                                    | DashboardTour                                                                        |
| `src/components/featured-booths.dom.test.tsx`                          | Regression coverage                                                                  |
| `src/components/featured-booths.tsx`                                   | FeaturedBooth, FeaturedBooths                                                        |
| `src/components/feedback-form.tsx`                                     | FeedbackForm                                                                         |
| `src/components/hero-preview-carousel.dom.test.tsx`                    | Regression coverage                                                                  |
| `src/components/hero-preview-carousel.tsx`                             | HeroPreviewCarousel                                                                  |
| `src/components/item-customizer.dom.test.tsx`                          | Regression coverage                                                                  |
| `src/components/item-customizer.tsx`                                   | ItemCustomizer                                                                       |
| `src/components/landing-board.dom.test.tsx`                            | Regression coverage                                                                  |
| `src/components/landing-board.tsx`                                     | LandingBoardData, LandingBoard                                                       |
| `src/components/landing-boards.ts`                                     | LANDING_BOARDS                                                                       |
| `src/components/landing-cta.tsx`                                       | LandingCta                                                                           |
| `src/components/landing-ticket.dom.test.tsx`                           | Regression coverage                                                                  |
| `src/components/landing-ticket.tsx`                                    | TicketOption, TicketLine, LandingTicketData, LandingTicket                           |
| `src/components/landing/footer.test.tsx`                               | Regression coverage                                                                  |
| `src/components/landing/footer.tsx`                                    | Footer                                                                               |
| `src/components/landing/nav.test.tsx`                                  | Regression coverage                                                                  |
| `src/components/landing/nav.tsx`                                       | Nav                                                                                  |
| `src/components/landing/README.md`                                     | Local module contract and connectivity                                               |
| `src/components/landing/wordmark.tsx`                                  | Wordmark                                                                             |
| `src/components/maintenance-banner.dom.test.tsx`                       | Regression coverage                                                                  |
| `src/components/maintenance-banner.tsx`                                | MaintenanceBanner                                                                    |
| `src/components/media-image.tsx`                                       | MediaImage                                                                           |
| `src/components/order-card.dom.test.tsx`                               | Regression coverage                                                                  |
| `src/components/order-card.tsx`                                        | OrderCard                                                                            |
| `src/components/order-status-badge.tsx`                                | OrderStatusBadge                                                                     |
| `src/components/order/expired-code.dom.test.tsx`                       | Regression coverage                                                                  |
| `src/components/order/expired-code.tsx`                                | ExpiredCode                                                                          |
| `src/components/order/order-form.dom.test.tsx`                         | Regression coverage                                                                  |
| `src/components/order/order-form.tsx`                                  | OrderForm                                                                            |
| `src/components/order/README.md`                                       | Local module contract and connectivity                                               |
| `src/components/order/recent-orders.tsx`                               | RecentOrders                                                                         |
| `src/components/paginated.tsx`                                         | Paginated                                                                            |
| `src/components/payment-proof-viewer.dom.test.tsx`                     | Regression coverage                                                                  |
| `src/components/payment-proof-viewer.tsx`                              | PaymentProofViewer                                                                   |
| `src/components/pro-lock.tsx`                                          | ProLock                                                                              |
| `src/components/providers.tsx`                                         | Providers                                                                            |
| `src/components/README.md`                                             | Local module contract and connectivity                                               |
| `src/components/reorder-button.tsx`                                    | ReorderButton                                                                        |
| `src/components/service-worker-registrar.tsx`                          | ServiceWorkerRegistrar                                                               |
| `src/components/social-links-row.dom.test.tsx`                         | Regression coverage                                                                  |
| `src/components/social-links-row.tsx`                                  | SocialLinksRow                                                                       |
| `src/components/ticket-section.dom.test.tsx`                           | Regression coverage                                                                  |
| `src/components/ticket-section.tsx`                                    | Section                                                                              |
| `src/components/ticket.tsx`                                            | Ticket                                                                               |
| `src/components/tour-steps.test.ts`                                    | Regression coverage                                                                  |
| `src/components/tour-steps.ts`                                         | TourStep, ordersTourSteps, boothsTourSteps                                           |
| `src/components/ui/alert-dialog.tsx`                                   | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/button.tsx`                                         | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/checkbox.tsx`                                       | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/dialog.tsx`                                         | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/dropdown-menu.tsx`                                  | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/input-group.tsx`                                    | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/input.tsx`                                          | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/label.tsx`                                          | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/popover.tsx`                                        | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/radio-group.tsx`                                    | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/README.md`                                          | Local module contract and connectivity                                               |
| `src/components/ui/select.tsx`                                         | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/sheet.tsx`                                          | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/switch.tsx`                                         | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/tabs.tsx`                                           | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/textarea.tsx`                                       | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/toggle-group.tsx`                                   | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/toggle.tsx`                                         | Shared CLI-managed accessible UI primitive                                           |
| `src/components/ui/tooltip.tsx`                                        | Shared CLI-managed accessible UI primitive                                           |
| `src/components/zoomable-image.tsx`                                    | ZoomableImage                                                                        |
| `src/hooks/README.md`                                                  | Local module contract and connectivity                                               |
| `src/hooks/use-async-action.test.tsx`                                  | Regression coverage                                                                  |
| `src/hooks/use-async-action.ts`                                        | useAsyncAction                                                                       |
| `src/hooks/use-now.dom.test.tsx`                                       | Regression coverage                                                                  |
| `src/hooks/use-now.ts`                                                 | useNow                                                                               |
| `src/hooks/use-polling.test.tsx`                                       | Regression coverage                                                                  |
| `src/hooks/use-polling.ts`                                             | usePolling                                                                           |
| `src/hooks/use-printer-status.ts`                                      | PrinterSummary, PrinterStatusView, usePrinterStatus                                  |
| `src/hooks/use-realtime-orders.test.tsx`                               | Regression coverage                                                                  |
| `src/hooks/use-realtime-orders.ts`                                     | RealtimeStatus, useRealtimeOrders                                                    |
| `src/lib/action-result.ts`                                             | ActionResult                                                                         |
| `src/lib/admin-stats.test.ts`                                          | Regression coverage                                                                  |
| `src/lib/admin-stats.ts`                                               | VendorRowLite, EventRowLite, VendorSummary, EventSummary                             |
| `src/lib/admin-vendor-health.test.ts`                                  | Regression coverage                                                                  |
| `src/lib/admin-vendor-health.ts`                                       | VendorStatus, VendorLite, BoothLite, OrderLite                                       |
| `src/lib/admin-vendor-names.test.ts`                                   | Regression coverage                                                                  |
| `src/lib/admin-vendor-names.ts`                                        | vendorStallNames                                                                     |
| `src/lib/admin.test.ts`                                                | Regression coverage                                                                  |
| `src/lib/admin.ts`                                                     | isAdmin, requireAdmin                                                                |
| `src/lib/allergen-icons.ts`                                            | ALLERGEN_ICONS                                                                       |
| `src/lib/audit.ts`                                                     | AuditEntry, OrderStatusEventEntry, recordAudit, recordOrderStatusEvent               |
| `src/lib/booth-color.test.ts`                                          | Regression coverage                                                                  |
| `src/lib/booth-color.ts`                                               | boothColor                                                                           |
| `src/lib/booth-images.test.ts`                                         | Regression coverage                                                                  |
| `src/lib/booth-images.ts`                                              | boothImagePaths, orphanedImagePaths, failedSaveUploadPaths, UNSAVED_UPLOAD_GRACE_MS  |
| `src/lib/brand-icon.tsx`                                               | BRAND_EMBER, BRAND_OAT, brandIcon                                                    |
| `src/lib/carousel.test.ts`                                             | Regression coverage                                                                  |
| `src/lib/carousel.ts`                                                  | nearestIndex                                                                         |
| `src/lib/cart-storage.test.ts`                                         | Regression coverage                                                                  |
| `src/lib/cart-storage.ts`                                              | saveCart, loadCart, clearCart                                                        |
| `src/lib/cart.test.ts`                                                 | Regression coverage                                                                  |
| `src/lib/cart.ts`                                                      | cartKey, cartTotal, sumOptionDeltas                                                  |
| `src/lib/events.test.ts`                                               | Regression coverage                                                                  |
| `src/lib/events.ts`                                                    | EventLicense, eventLabel                                                             |
| `src/lib/hash.test.ts`                                                 | Regression coverage                                                                  |
| `src/lib/hash.ts`                                                      | hashBuffer                                                                           |
| `src/lib/hours-editor.test.ts`                                         | Regression coverage                                                                  |
| `src/lib/hours-editor.ts`                                              | WEEKDAY_KEYS, DEFAULT_WINDOW, emptyWeek, dailyHours                                  |
| `src/lib/hours.test.ts`                                                | Regression coverage                                                                  |
| `src/lib/hours.ts`                                                     | DayWindow, BoothHours, isBoothOpen, nextOpenLabel                                    |
| `src/lib/image-upload-adapter.remove.test.ts`                          | Regression coverage                                                                  |
| `src/lib/image-upload-adapter.test.ts`                                 | Regression coverage                                                                  |
| `src/lib/image-upload-adapter.ts`                                      | uploadQkitImage, removeReplacedAvatar, removeUnsavedImages                           |
| `src/lib/legal-gate.test.ts`                                           | Regression coverage                                                                  |
| `src/lib/legal-gate.ts`                                                | checkLegalAcceptance, requireCurrentLegalAcceptance                                  |
| `src/lib/menu-csv.test.ts`                                             | Regression coverage                                                                  |
| `src/lib/menu-csv.ts`                                                  | menuItemsToCsv, menuCsvTemplate, CsvChoiceRow, CsvMenuRow                            |
| `src/lib/menu-sections.test.ts`                                        | Regression coverage                                                                  |
| `src/lib/menu-sections.ts`                                             | MenuSection, groupByCategory                                                         |
| `src/lib/nps.test.ts`                                                  | Regression coverage                                                                  |
| `src/lib/nps.ts`                                                       | NpsBreakdown, npsBreakdown                                                           |
| `src/lib/order-alerts.test.ts`                                         | Regression coverage                                                                  |
| `src/lib/order-alerts.ts`                                              | isNotifySupported, notifyPermission, requestNotifyPermission, fireReadyNotification  |
| `src/lib/orders.test.ts`                                               | Regression coverage                                                                  |
| `src/lib/orders.ts`                                                    | BOARD_ORDER_COLUMNS, TERMINAL_STATUSES, isTerminal, ADVANCE                          |
| `src/lib/plan.test.ts`                                                 | Regression coverage                                                                  |
| `src/lib/plan.ts`                                                      | Tier, Entitlement, ENTITLEMENTS, normalizePlan                                       |
| `src/lib/platform-settings.ts`                                         | PlatformSettingsConfig, DEFAULT_PLATFORM_SETTINGS                                    |
| `src/lib/pricing.ts`                                                   | PricingConfig, DEFAULT_PRICING                                                       |
| `src/lib/README.md`                                                    | Local module contract and connectivity                                               |
| `src/lib/realtime-orders.test.ts`                                      | Regression coverage                                                                  |
| `src/lib/realtime-orders.ts`                                           | RealtimeOrderEvent, RawOrderChange, parseRealtimeOrderEvent, applyRealtimeOrderEvent |
| `src/lib/recent-orders.test.ts`                                        | Regression coverage                                                                  |
| `src/lib/recent-orders.ts`                                             | RecentOrder, getRecentOrders, getRecentOrdersForBooth, addRecentOrder                |
| `src/lib/reorder-handoff.test.ts`                                      | Regression coverage                                                                  |
| `src/lib/reorder-handoff.ts`                                           | ReorderSeed, stashReorder, isValidLine, takeReorder                                  |
| `src/lib/reorder.test.ts`                                              | Regression coverage                                                                  |
| `src/lib/reorder.ts`                                                   | ReorderLine, ReorderResult, reconcileReorder                                         |
| `src/lib/reviews.test.ts`                                              | Regression coverage                                                                  |
| `src/lib/reviews.ts`                                                   | ReviewRow, ReviewSummary, summarizeReviews, BoothReviews                             |
| `src/lib/sales-summary.test.ts`                                        | Regression coverage                                                                  |
| `src/lib/sales-summary.ts`                                             | SalesSummaryV1, toSalesSummaryV1, salesSummaryToCsv                                  |
| `src/lib/stats.test.ts`                                                | Regression coverage                                                                  |
| `src/lib/stats.ts`                                                     | bucketPlan, StatsOrder, TopItem, HourBucket                                          |
| `src/lib/stock.test.ts`                                                | Regression coverage                                                                  |
| `src/lib/stock.ts`                                                     | Remaining, parseRemaining, remainingFor                                              |
| `src/lib/stuck-orders.test.ts`                                         | Regression coverage                                                                  |
| `src/lib/stuck-orders.ts`                                              | STUCK_THRESHOLD_MS, OrderStatusEventLite, OrderForStatusSince, statusSinceByOrder    |
| `src/lib/tour-ids.test.ts`                                             | Regression coverage                                                                  |
| `src/lib/tour-ids.ts`                                                  | TOUR_IDS, TourId, tourIdSchema                                                       |
| `src/lib/tz.test.ts`                                                   | Regression coverage                                                                  |
| `src/lib/tz.ts`                                                        | BOOTH_TZ, WeekdayKey, WEEKDAY_ORDER, WEEKDAY_LABELS                                  |
| `src/lib/utils.test.ts`                                                | Regression coverage                                                                  |
| `src/lib/utils.ts`                                                     | cn, FORM_LABEL_CLASS, FORM_ERROR_CLASS, MS_PER_HOUR                                  |
| `src/app/apple-icon.tsx`                                               | size, contentType, AppleIcon                                                         |
| `src/app/error.tsx`                                                    | ErrorPage                                                                            |
| `src/app/global-error.tsx`                                             | GlobalError                                                                          |
| `src/app/globals.css`                                                  | Theme, layout, motion and print styles                                               |
| `src/app/icon.tsx`                                                     | size, contentType, Icon                                                              |
| `src/app/layout.tsx`                                                   | metadata, viewport, RootLayout                                                       |
| `src/app/manifest.ts`                                                  | manifest                                                                             |
| `src/app/not-found.tsx`                                                | NotFound                                                                             |
| `src/app/page.tsx`                                                     | revalidate, LandingPage                                                              |
| `src/app/README.md`                                                    | Local module contract and connectivity                                               |
