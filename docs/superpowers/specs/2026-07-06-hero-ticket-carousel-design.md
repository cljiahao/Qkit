# Hero Ticket Carousel + Avatar Fix — Design

**Date:** 2026-07-06
**Status:** Approved, ready for plan.

## Summary

Two changes to the marketing landing page and one config fix:

1. **Hero carousel** — turn the current opacity cross-fade between two static
   "live order" boards into a **swipeable horizontal carousel** of **four**
   boards, each a higher-fidelity mock of the real dashboard order board. Keep
   the 10s auto-advance; add manual swipe/drag (finger + mouse) so a visitor can
   move to the next board early. Snap one board per view.
2. **Higher-fidelity chits** — bring the mock tickets closer to the real
   `order-card.tsx` visual vocabulary (status badge, payment badge, age clock +
   colour wash), so the hero looks like the actual product.
3. **Avatar bug fix** — Google account avatars (`*.googleusercontent.com`) are
   blocked by `next/image` because the host isn't in `next.config.ts`
   `remotePatterns`, so every Google user's profile picture 400s and renders
   broken. Whitelist the host.

The carousel stays **decorative** (`aria-hidden`), same as today.

## Motivation

The hero is the first thing a prospective vendor sees. The current two-board
cross-fade under-sells the product: the chits are lower fidelity than the real
board, only two scenarios show, and a visitor can't explore at their own pace
(10s fixed). Four swipeable, real-looking boards tell the full story: pricing,
queue-only, payment confirmation, and the time-pressure attention system.

## Current state

- `src/components/hero-preview-carousel.tsx` — cross-fades two boards stacked in
  one grid cell (opacity), auto-rotates every 10s, progress dots, reduced-motion
  holds on board 0.
- `src/components/landing-board-preview.tsx` (coffee, priced) and
  `src/components/landing-order-preview-icecream.tsx` (ice-cream, queue-only) —
  two near-duplicate hand-built boards with inline sample data.

The two board components duplicate structure. This design **replaces** them with
one data-driven board + a shared ticket chit, so the four boards are data, not
four copies of markup.

## Architecture

Four files (two new components, one data module, the rewritten carousel);
the two old board components are deleted.

```
src/components/
  landing-ticket.tsx      — NEW: one chit (presentational, props-driven)
  landing-board.tsx       — NEW: board header + list of <LandingTicket> from data
  landing-boards.ts       — NEW: the 4 boards' sample data (typed)
  hero-preview-carousel.tsx — REWRITE: swipeable snap carousel over the 4 boards
  landing-board-preview.tsx            — DELETE
  landing-order-preview-icecream.tsx   — DELETE
src/lib/
  carousel.ts             — NEW: pure helper `nearestIndex()` (unit-tested)
next.config.ts            — MODIFY: add *.googleusercontent.com remote pattern
```

Update any import of the deleted components (the landing page composes
`HeroPreviewCarousel`, which owns the boards internally, so the page itself
should need no change — verify during implementation).

### `landing-ticket.tsx` — the chit

Presentational, `aria-hidden` inherited from the carousel. Props:

```ts
type TicketLine = { q: number; name: string; opt?: string; price?: string };
type LandingTicketData = {
  n: string; // order number, e.g. "0042"
  name: string; // customer
  status: "preparing" | "ready" | "completed";
  payment?: "unpaid" | "claimed" | "paid"; // omit → no payment badge (queue-only)
  age?: { label: string; tone: "normal" | "aging" | "overdue" }; // omit → no clock
  lines: TicketLine[];
  total?: string; // omit → queue-only (no total row)
  action?: string; // button label, e.g. "Mark Ready"; omit → none
};
```

Visual vocabulary mirrors `order-card.tsx`:

- Mono `#number` + customer name (top-left).
- Status badge coloured via `--color-status-<status>` (same token approach the
  current preview uses).
- Payment badge when `payment` set: `unpaid` → muted "Unpaid"; `claimed` → blue
  "Says paid"; `paid` → emerald "Paid" (mirror `PaymentBadge` in order-card).
- Age clock when `age` set: `Clock` icon + `age.label`, coloured by tone
  (normal muted / aging amber / overdue red).
- `perforation` divider, itemized lines (mono `q×`, name, option sub-line,
  price if present), a `perforation` + Total row when `total` set, and an
  action pill when `action` set.
- Attention wash on the chit when `age.tone` is `aging`/`overdue` or
  `payment === "claimed"` — reuse the `.ticket-aging` / `.ticket-overdue` /
  `.ticket-alert` classes the real card uses, by priority
  overdue > claimed > aging (same order as order-card).

### `landing-board.tsx` — the board

```ts
type LandingBoardData = {
  key: string;
  title: string;
  activeCount: number;
  tickets: LandingTicketData[];
};
```

Renders the `.ticket` container (scalloped top, shadow — as the current preview
does), a header row ("Live orders" + a pulsing dot + `N active`), and the
tickets in the existing responsive `grid-cols-1 sm:grid-cols-2` layout.

### `landing-boards.ts` — the 4 boards (data)

1. **coffee** — "Kopitiam Cart", priced & live: ticket A `preparing`, `age 4m`
   aging, 2× Kopi (Iced) $3.60, total, "Mark Ready"; ticket B `ready`, 1× Milo
   - 3× Teh, total, "Mark Picked Up". Payment `unpaid`/omit (focus is pricing).
2. **icecream** — "Ice Cream Cart", queue-only: tickets with NO `total`, NO
   `payment`, NO price on lines; `preparing` + `ready`. Proves queue-only.
3. **payment** — "Kopitiam Cart" (PayNow): ticket A `preparing` +
   `payment: "claimed"` (blue "Says paid" + "Confirm payment received" action,
   `.ticket-alert` wash); ticket B `completed`/`ready` + `payment: "paid"`
   (emerald). Shows the PayNow confirm loop.
4. **rush** — busy: three tickets — one `overdue` (`age 12m`, red wash), one
   `aging` (`age 7m`, amber), one fresh `preparing` (`age 1m`). Shows the
   attention system under load.

All figures are fixed sample data (decorative). No real orders.

### `hero-preview-carousel.tsx` — the swipeable carousel

- **Track:** a horizontal flex row, `overflow-x-auto snap-x snap-mandatory`,
  scrollbar hidden; each board wrapped `snap-center shrink-0 w-full`. Native
  finger swipe + trackpad scroll work out of the box.
- **Mouse drag:** pointer handlers give click-drag-to-scroll on desktop
  (pointerdown records startX + scrollLeft; pointermove sets
  `scrollLeft = start - dx`; pointerup releases). Pointer capture; only left
  button; ignore if reduced-motion is fine to keep (drag still allowed).
- **Auto-advance:** every 10s, `scrollTo` the next board (`smooth`), wrapping.
  Active index derived from scroll position via `nearestIndex()`.
- **Pause + reset:** clear the interval on `pointerdown`/`pointerenter`/
  `touchstart`; restart it (fresh 10s) on release/leave. Manual navigation
  (drag or dot click) resets the timer so it never yanks mid-interaction.
- **Dots:** one per board, filled = active; clicking scrolls to that board.
- **Reduced-motion:** no auto-advance interval; `scrollTo`/snap uses instant
  (not smooth); still fully swipeable.
- Whole component `aria-hidden` (decorative), as today.

### `src/lib/carousel.ts` — pure helper

```ts
/** Index of the board nearest the current horizontal scroll offset. */
export function nearestIndex(
  scrollLeft: number,
  boardWidth: number,
  count: number,
): number;
// = clamp(round(scrollLeft / boardWidth), 0, count - 1); boardWidth<=0 → 0.
```

Extracted so the scroll→index math is unit-tested (jsdom can't drive real
scrolling); the component imports it. Keeps logic in `src/lib` per the repo's
mutation-tested-logic convention.

### `next.config.ts` — avatar fix

Add to `images.remotePatterns`:

```ts
{ protocol: "https", hostname: "*.googleusercontent.com" },
```

Google profile photos are served from `lh3.googleusercontent.com` (and peers).
This is build-time inlined → the deploy must rebuild (Vercel does on push).
No secret, no `NEXT_PUBLIC` change.

## Testing

- **`src/lib/carousel.test.ts`** (node): `nearestIndex` — rounds to nearest,
  clamps at both ends, `boardWidth <= 0 → 0`, exact boundaries. Mutation-worthy.
- **`src/components/landing-ticket.dom.test.tsx`** (jsdom): renders number/name;
  shows payment badge only when `payment` set; shows total row only when `total`
  set; queue-only ticket (no `total`/`payment`) renders no total/badge; age
  clock + wash class present when `age.tone` is overdue/aging.
- **`src/components/hero-preview-carousel.dom.test.tsx`** (jsdom): renders all 4
  boards and 4 dots; every board's title present; under mocked
  `matchMedia(reduce)` no auto-advance timer is set (assert via fake timers that
  the active dot doesn't change after 10s). jsdom does not implement
  `scrollTo`/layout, so scroll-position assertions are out of scope — the
  `nearestIndex` unit test covers that math.
- No e2e change (decorative hero; the existing landing smoke, if any, still
  passes). `pnpm check` + `pnpm test` are the gate.

## Out of scope / non-goals (YAGNI)

- Not keyboard/AT-navigable — it stays `aria-hidden` decorative, same as today.
- No real order data / no fetching — fixed sample data.
- No new board beyond the four; no per-ticket interactivity (the action pills
  are non-functional labels).
- No change to the real `order-card.tsx` or dashboard.

## Risks

- The two deleted board components may be imported somewhere other than the
  carousel — grep and update before deleting (expected: only the carousel).
- `scrollTo({behavior:"smooth"})` + snap interplay across browsers: snap-mandatory
  can fight programmatic smooth scroll on some engines; if janky, fall back to
  instant `scrollTo` for the auto-advance (still snaps). Note for implementer.

```

```
