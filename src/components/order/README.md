# order

## Purpose

Components specific to the customer ordering flow: the menu/cart form itself,
the on-device "your recent orders" list, and the hard-block screen for a
stale QR code.

## Contents

- `expired-code.tsx` — `ExpiredCode({ variant })`: full-screen block shown at
  HTTP 200 (not a 404) for a stale/missing QR token — `"expired"` (default,
  "ask the booth for the current QR") vs. `"error"` (a transient backend
  failure, "try again in a moment" — the code may still be valid, so telling
  the customer to rescan would be wrong).
- `expired-code.dom.test.tsx` — RTL test covering both variants' copy.
- `order-form.tsx` — `OrderForm({ code, boothId, menuItems, menuCategories,
closed, remaining })`: the full menu + cart + checkout UI. Seeds the cart on
  mount from either a `takeReorder` handoff (explicit reorder intent, wins)
  or a persisted `loadCart` (in-progress cart from a prior visit),
  reconciling either against the live menu/stock (`reconcileReorder`).
  Tracks a `Map<string, CartItem>` cart keyed by `cartKey(menuItemId,
options)`, persists it on every change (`saveCart`), enforces per-item
  stock caps (`remainingFor`/`blockedByStock`), opens `ItemCustomizer` for
  items with option groups, and on submit calls `placeOrder`
  (`@/app/o/[code]/actions`) with a stable per-submit idempotency key
  (retried once on a network error), then clears the cart, stashes an
  `addRecentOrder` entry, and navigates to the order-status page. Also
  collects an optional "Phone number (optional)" field next to the name
  field — a genuinely optional convenience (cross-kit customer identity,
  migration `0075`), never required to submit — passed through
  `placeOrder`'s `customerPhone` input. Menu items render grouped under
  `menuCategories` (`@/lib/menu-sections`'s `groupByCategory`) with a jump
  nav once there are 2+ non-empty sections; a booth with 0 or 1 category
  falls back to the original flat "Menu" list, no chrome. Each card row also
  renders `AllergenBadges` (`@/components/allergen-badges`, 2026-09-01) from
  `item.allergens` — works even while the booth is closed and browse-only,
  since it doesn't depend on opening `ItemCustomizer` (which items with no
  option groups never even offer a button for).
- `order-form.dom.test.tsx` — RTL tests covering cart add/increment/decrement,
  stock-cap blocking, reorder seeding/reconciliation, the closed-booth submit
  guard, the placeOrder retry-then-fail path, the phone field (renders,
  optional — submits with it blank, passes its value through when filled),
  category sections (flat fallback for 0/1 category, grouped headings +
  jump nav for 2+, unmatched/stale category ids bucketed into "Other" last),
  and the card-level allergen badges (one tappable icon per tag, nothing for
  an item with none, tap reveals the name — works with the booth closed).
- `recent-orders.tsx` — `RecentOrders({ boothId })`: reads
  `getRecentOrdersForBooth` from localStorage post-mount (avoids an SSR
  hydration mismatch — there's no server-side customer identity), rendering
  a collapsed-then-"Show all" list of `Link`s to each past order's status
  page.

## Connectivity

Rendered by `src/app/o/[code]/page.tsx` (`OrderForm`, `RecentOrders`) and by
that same route's `ExpiredCode` fallback when the short code doesn't resolve.
`OrderForm` calls the `placeOrder` server action living in
`src/app/o/[code]/actions.ts` and, on success, routes to
`/order/[boothId]/[orderNumber]`. `ReorderButton`
(`@/components/reorder-button.tsx`) and the status page's "Order again" link
are what stash the reorder handoff `OrderForm` reads on mount.

## Parent

[components](../README.md)
