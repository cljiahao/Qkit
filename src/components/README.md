# components

## Purpose

Shared React components used across the vendor dashboard, the marketing
landing page, and the customer ordering flow — everything that isn't a raw
shadcn primitive (`ui/`) or ordering-flow-specific (`order/`).

## Contents

- `back-button.tsx` — `BackButton({ href, label })`: a ghost `Button` wrapping
  a `Link` with a leading arrow icon, used as consistent page-leave nav.
- `back-to-top.tsx` — `BackToTop()`: fixed bottom-right scroll-to-top button
  for the landing page, appears past `scrollY > 600`, respects
  `prefers-reduced-motion` for the scroll behavior.
- `dashboard-tour.tsx` — `DashboardTour({ seen })`: thin wiring around
  `@merqo/ui`'s `DashboardTour` — supplies qkit's own step content
  (`tour-steps.ts`, resolved lazily via `matchMedia` at tour-start time),
  `markTourSeen` as `onFirstSeen`, `/dashboard`-route detection, and
  `scopeClassName="qkit-tour"` for the popover theme. The tour mechanism
  itself (driver.js lifecycle, auto-run/replay timing, floating "?" replay
  button, popover styling) lives in the shared package.
- `dashboard-tour.dom.test.tsx` — RTL tests for the tour's auto-run,
  mark-seen, and cross-page replay behavior.
- `featured-booths.tsx` — `FeaturedBooths({ featured })`: renders a 3-up grid
  of vendor-approved testimonial quotes; renders nothing when the array is
  empty (no fabricated testimonials — `page.tsx` currently passes `[]`).
- `featured-booths.dom.test.tsx` — RTL test asserting the empty-array no-op.
- `feedback-form.tsx` — `FeedbackForm({ source, boothId, orderNumber, token,
prompt, metric })`: compact rating widget posting to
  `submitFeedback` (`@/app/actions/feedback`) — `metric="stars"` (1–5, used
  for customer order ratings) or `"nps"` (0–10 recommend score, vendor→qkit).
- `hero-preview-carousel.tsx` — `HeroPreviewCarousel()`: the landing hero's
  swipeable "live order board" carousel over `LANDING_BOARDS` — native
  scroll-snap plus pointer-drag and a 10s auto-advance timer (paused on
  interaction, skipped under reduced motion), decorative (`aria-hidden`).
- `hero-preview-carousel.dom.test.tsx` — RTL test for carousel dot
  navigation/active state.
- `item-customizer.tsx` — `ItemCustomizer({ item, onClose, onAdd })`: a
  bottom `Sheet` for picking a menu item's option groups (single-select via
  `ToggleGroup type="single"`, multi-select via `type="multiple"`, keyed by
  item id so switching items remounts with fresh default selections) before
  adding it to the cart. Shows a live running price delta (informational
  only — `place_order` re-derives the authoritative total server-side from
  the stored menu) and an always-visible allergen badge list (the item's
  fixed allergens unioned with every currently-selected choice's allergens,
  never behind an accordion — a safety signal, not optional complexity).
- `item-customizer.dom.test.tsx` — RTL tests for the running-total math
  (single-select replace vs. multi-select sum across groups) and the
  allergen badges (fixed vs. selection-derived, added/dropped on choice
  change).
- `landing-board.tsx` — `LandingBoard({ board })`: renders one "live order
  board" ticket container (title + active-count pulse badge) for the hero
  carousel, laying out its `LandingTicket`s in a 2-col grid.
- `landing-board.dom.test.tsx` — RTL test for `LandingBoard` rendering.
- `landing-boards.ts` — `LANDING_BOARDS`: static sample data for the 4 hero
  scenario boards (coffee cart, ice-cream cart, a payment-claim flow, a
  "rush" with aging/overdue tickets).
- `landing-cta.tsx` — `LandingCta({ href, children, variant, event })`: a
  landing-page call-to-action `Button`+`Link` that fires an optional
  analytics event (`logEvent`) on click before navigating.
- `landing/` — the sticky landing-page nav (`Nav`, composing `@merqo/ui`'s
  `LandingNav` shell) and the standalone wordmark used on the login page
  (`Wordmark`). See its own README.
- `landing-ticket.tsx` — `LandingTicket({ t })`: presentational "order chit"
  mirroring the real `OrderCard`'s visual language (status badge, payment
  badge, aging wash, perforated sections) for the landing hero — no server
  actions, purely decorative sample data.
- `landing-ticket.dom.test.tsx` — RTL test for `LandingTicket` rendering
  across status/payment/age combinations.
- `maintenance-banner.tsx` — `MaintenanceBanner({ enabled, message })`:
  site-wide informational banner rendered from the root layout (never blocks
  anything underneath); renders nothing when disabled or the message is
  blank, so a stray enabled-but-empty row never shows an empty bar to every
  visitor.
- `maintenance-banner.dom.test.tsx` — RTL tests for the enabled, disabled,
  and enabled-but-blank-message rendering branches.
- `media-image.tsx` — `MediaImage(props)`: `next/image` wrapper that marks
  `.svg` sources `unoptimized` (avoids needing the global
  `dangerouslyAllowSVG` flag) while raster uploads still get full
  optimization.
- `order/` — components specific to the customer ordering flow (menu/cart
  form, recent-orders list, expired-code screen). See its own README.
- `order-card.tsx` — `OrderCard({ order, displayNumber, boothName, agingMin,
overdueMin, onUndoWindowChange, showDate, undoMs, readyAutoClearMs, selectable,
selected, onToggleSelect })`: the
  vendor dashboard's live order ticket — status/payment badges (plus a
  "Walk-up" badge when `order.source === "walkup"`, staff-entered orders vs.
  the default QR-placed ones), an aging
  clock (`orderAgeTone`, ticks every 30s) moved to the footer beside the
  arrival timestamp (`sgtClock`, bare time — or `shortDateTime`, date+time,
  when `showDate` is set, for the completed-orders history list where every
  card isn't from today), expandable item options, and the advance/cancel/
  confirm-payment action buttons wired to `@/app/dashboard/order-actions`.
  Advancing (Mark Ready/Mark Picked Up) fires instantly — no confirm gate on
  a tapped-dozens-of-times-a-shift button — backed instead by an `undoMs`
  (default `DEFAULT_UNDO_MS`, 4s; vendor-configurable via
  `board_settings.undo_seconds * 1000`) undo window: the button becomes an
  Undo affordance with a left-to-right drain (`.undo-bar` in `globals.css`,
  duration set inline to match `undoMs`), and `onUndoWindowChange(orderId,
  active)` tells the board to keep a just-completed (terminal) order on the
  active grid for that window, since the realtime echo of the very write
  being offered for undo would otherwise filter the card off the board
  first. While `status === "ready"` and `readyAutoClearMs` is set
  (`board_settings.ready_auto_clear_min * 60_000`, vendor-configurable,
  `null` when the vendor hasn't turned auto-clear on), "Mark Picked Up"
  shows the same left-to-right drain (`.autoclear-bar`, reusing `.undo-bar`'s
  `undo-drain` keyframe) for the time left before `sweepReadyOrders`
  auto-completes it — set once (in an effect keyed on `ready_at`/`status`/
  `readyAutoClearMs`, not recomputed every poll tick) so it drains smoothly
  from a fixed duration instead of restarting on every re-render; purely
  display, the actual clearing stays server-side. `displayNumber` (optional,
  board_settings.daily_order_number_reset
  — see `displayOrderNumber` in `@/lib/orders`) overrides what's shown/
  referenced everywhere the card names "this order" by number — the
  name/number block itself, and both its own bump/cancel confirm dialogs —
  falling back to the real `order.order_number` when omitted (every call
  site except the live board itself, e.g. the completed-orders history list,
  which intentionally always shows the real, permanent number). The
  name/number block doubles as the bump trigger (chip-styled, confirm
  dialog, disabled once already bumped) instead of a separate icon button.
  In multi-booth view, a full-width banner above the header shows the booth
  name next to a `boothColor()` dot. One "attention wash" background at a
  time, prioritized overdue > payment-claimed > aging. A closed card whose
  `order.auto_completed` is true (the ready-order auto-clear sweep, not a
  vendor's own "Mark Picked Up" tap, completed it) shows a "Restore to
  ready" button calling `restoreAutoCompleted` — this is where the
  completed-orders history list's undo for a premature auto-clear lives —
  alongside a Cancel option (hidden once payment is confirmed, same as the
  live Cancel button) calling the same `cancelOrder`, since the sweep can
  beat a vendor's own cancel tap to it and the only other way to actually
  cancel that order would be restoring it to ready first. `selectable` (set
  by the board only for `preparing` orders while its own batch mark-ready
  mode is on) renders a `Checkbox` (`selected`, `onToggleSelect(order.id)`)
  next to the name/number block — selection state and the bulk `advanceOrder`
  call itself live on `RealtimeOrderBoard`, not here.
- `order-card.dom.test.tsx` — RTL tests for `OrderCard`'s status/payment
  transitions, action-button wiring, the `displayNumber` override, the
  walk-up origin badge, and the batch-select checkbox.
- `order-status-badge.tsx` — `OrderStatusBadge({ status })`: a colour-coded
  pill for each `OrderStatus` (pending/confirmed/preparing/ready/completed/
  cancelled), shared by the dashboard board and the customer status page.
- `paginated.tsx` — `Paginated({ children, pageSize, variant, label,
alwaysShowCount })`: client-side pager over pre-rendered rows —
  `variant="pager"` (prev/next + "x–y of N", for admin tables) or `"more"`
  (Load more / Show less, for feeds). `alwaysShowCount` (pager only) shows
  the "x–y of N" readout even when everything fits on one page — useful
  when the count itself is meaningful context (e.g. confirming a filtered
  list wasn't over-narrowed), not just page-count bookkeeping; prev/next
  buttons still only appear once there's more than one page. The visible
  rows sit in their own `className`-styled wrapper, separate from the
  prev/next or Load-more row — a grid `className` (e.g. the completed-orders
  page) lays out only the rows, not the pager controls.
- `pro-lock.tsx` — `ProLock({ feature, label })`: an inline upgrade nudge
  linking to `/dashboard/plan`, logging an `upgrade_cta` event tagged with
  the specific gated `feature` for funnel analysis.
- `providers.tsx` — `Providers({ children })`: app-wide client providers —
  Radix `TooltipProvider` and the `sonner` `Toaster`.
- `reorder-button.tsx` — `ReorderButton({ boothId, lines, customerName,
label })`: stashes a past order's lines via `stashReorder` and navigates to
  the booth's menu page, where `OrderForm` reconciles them against the live
  menu/stock.
- `service-worker-registrar.tsx` — `ServiceWorkerRegistrar()`: registers
  `/sw.js` (best-effort) so ready-order notifications can use
  `registration.showNotification` (required on Android Chrome) and the app
  is installable as a PWA.
- `social-icons.tsx` — `SOCIAL_LINK_FIELDS`: the shared vendor social-link
  field list (website/instagram/facebook/tiktok) — real brand marks via
  `@icons-pack/react-simple-icons` (`color="default"`, the platform's
  official color) for every field but `website`, which uses a generic
  Lucide `Globe`. Consumed by both `social-links-fields.tsx` (the edit form)
  and `social-links-row.tsx` (the read-only display).
- `social-links-fields.tsx` — `SocialLinksFields({ value, onChange,
idPrefix })`: the vendor profile/booth-edit form inputs for the four social
  fields, labeled with `social-icons.tsx`'s marks.
- `social-links-fields.dom.test.tsx` — RTL tests for `SocialLinksFields`.
- `social-links-row.tsx` — `SocialLinksRow({ links })`: read-only icon row
  of a vendor's set social links, each on a fixed light chip (not the page's
  theme background) so single-color marks like TikTok's stay legible in
  dark mode too; renders nothing when `links` is empty. Shown on the
  order-status page footer and on a closed booth's menu-page banner.
- `social-links-row.dom.test.tsx` — RTL tests for `SocialLinksRow`'s
  empty/partial-link rendering.
- `ticket-section.tsx` — `Section({ icon, eyebrow, title, description,
tooltip, children })`: thin local wrapper around `@merqo/ui`'s `Section`,
  passed the local `Ticket` shell via `wrapper` so the header/icon/eyebrow/
  title/tooltip rendering is shared while the "ticket card" paper visual
  (scalloped edge, icon chip, spacing) stays qkit-specific. Used by
  settings/profile/booth-form pages. `tooltip` (optional) renders an
  `InfoTooltip` next to the title for detail that doesn't need to be visible
  by default — used by the settings page's Notifications card for its
  iOS/Android caveat. The `Ticket` wrapper carries its own `flex flex-col
  gap-4` — the shared `Section`'s default shell provides that gap itself,
  but opting into `wrapper` bypasses it, so it has to be re-applied here or
  the header (icon/eyebrow/title/description) sits flush against the first
  child with no gap.
- `ticket-section.dom.test.tsx` — RTL tests confirming `Section` renders
  inside the local `Ticket` shell, forwards icon/title/description to the
  shared header, and shows the tooltip on hover.
- `ticket.tsx` — `Ticket({ as, shadow, radius, dashed, clip, borderColor,
...props })`: the shared "kitchen ticket" card look (scalloped/perforated
  edge via the `.ticket` CSS class) — centralizes border/radius/shadow so
  every card in the app renders identically instead of each hand-rolling its
  own combination.
- `tour-steps.ts` — `tourSteps(isMobile)`: pure step config (element
  selector + title + description) for the dashboard tour, kept free of any
  `driver.js` import so it's unit-testable; desktop spotlights each nav
  landmark, mobile spotlights the collapsed hamburger menu instead.
- `tour-steps.test.ts` — unit tests asserting the mobile/desktop step lists.
- `ui/` — the shadcn/ui primitive library everything else in this tree is
  built from. See its own README.
- `zoomable-image.tsx` — `ZoomableImage({ src, alt, sizes })`: a menu photo
  that opens fullscreen in a `Dialog` on tap, with a corner expand-icon
  affordance.

## Connectivity

`ui/` is the shadcn/ui primitive library everything else in this tree is
built from; `order/` holds components specific to the customer ordering flow
and is consumed by `src/app/o/[code]/page.tsx`. The `landing-*` family
(`landing-board`, `landing-boards`, `landing-ticket`, `landing-cta`,
`featured-booths`) renders the marketing landing page alongside
`hero-preview-carousel.tsx`, `back-to-top.tsx`, and `landing/`'s `Nav`. Its
sibling `landing/`-`Wordmark` is consumed only by the login page, outside the
landing route. `order-card.tsx` and
`dashboard-tour.tsx` are consumed by the vendor dashboard
(`src/app/dashboard`); `ticket.tsx`/`ticket-section.tsx` are the shared card
shell used by both the dashboard and the ordering flow. `feedback-form.tsx` posts
to a server action under `src/app/actions/`.

## Parent

[src](../README.md)
