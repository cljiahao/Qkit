# Onboarding Tour — Design

> Status: approved (brainstorm 2026-06-27). Net-new vendor-facing UI.
> Research-grounded: see consensus notes at bottom.

## Goal

A short, skippable guided tour that orients a brand-new vendor on the dashboard
the first time they land, plus an always-available replay affordance. Reduces
"empty dashboard, now what?" on first login and points at the golden path
(create a booth → menu → QR → live orders).

## Scope decisions (locked)

- **Shape:** single-page orientation on the dashboard shell. The tour spotlights
  navigation landmarks + a "create your first booth" nudge. It does NOT drive a
  multi-route action walkthrough (fragile; empty-state-unsafe on first login).
- **Library:** `driver.js` (MIT, ~5kb, vanilla, framework-agnostic). Client-only.
- **Persistence:** `vendors.tour_seen_at TIMESTAMPTZ null`, stamped on
  finish/skip. Server-side per consensus (localStorage re-shows across
  devices/browsers — "stop storing impressions in localStorage").
- **Replay:** floating `?` circle button, bottom-right, on every dashboard page.
  Always replays (ignores the seen flag). From a non-/dashboard page it routes
  to `/dashboard` first, then runs from step 1.
- **Length:** 5 steps desktop / 3 mobile (consensus: 3-step tours ~72%
  completion vs 16% at 7 steps; cap at 5).

## Architecture

```
src/app/dashboard/layout.tsx (RSC)
  reads vendor.tour_seen_at  ──seen={bool}──▶  <DashboardTour seen={...}/>

src/components/tour/
  tour-steps.ts        pure: (isMobile) => DriveStep[]   [unit-tested]
  dashboard-tour.tsx   client: owns driver instance + ? FAB + auto-start + mark
  tour-actions.ts      "use server": markTourSeen()  → stamps vendors.tour_seen_at
  tour.css             popover theme (Kraft & Ember tokens)   [imported by controller]
```

`DashboardTour` is the single client component. It renders only the `?` FAB
(`data-tour="tour-replay"`); the driver overlay is created imperatively. It
reads `usePathname()`/`useRouter()`.

### Data flow

```
mount on /dashboard, seen === false ──▶ start tour
finish OR skip (driver onDestroyed)  ──▶ markTourSeen() (fire-and-forget)
? FAB click                          ──▶ if pathname !== /dashboard: router.push("/dashboard")
                                          then start() from step 1   (always)
```

`markTourSeen` failure is swallowed (cosmetic; FAB still works, worst case the
tour re-shows once). No toast.

### Steps (desktop, anchored by `data-tour`)

| #   | anchor        | copy                                                                                     |
| --- | ------------- | ---------------------------------------------------------------------------------------- |
| 1   | `order-board` | "Welcome to QKit. Live orders land here the moment a customer taps Order — no refresh."  |
| 2   | `nav-booths`  | "Start here: build your stall, add your menu, get a QR. This is step one to going live." |
| 3   | `nav-stats`   | "Track sales and how fast you're serving once orders roll in."                           |
| 4   | `nav-plan`    | "Free covers the basics. Upgrade to Pro when you're ready for more."                     |
| 5   | `tour-replay` | "Replay this tour anytime here. Now — go create your first booth →"                      |

Mobile (nav collapsed behind the hamburger → can't spotlight hidden links):
3 steps — `order-board` → `nav-menu` (hamburger: "Your booths, stats & plan
live in here") → `tour-replay`. Controller selects the list via
`matchMedia("(max-width: 767px)")`.

Every step shows "Skip tour" (driver `showButtons` incl. close). `allowClose:
true`.

### `data-tour` anchors to add

- `dashboard-nav.tsx` — `data-tour={"nav-" + slug}` per link (booths/stats/plan)
  - `data-tour="nav-menu"` on the mobile hamburger button.
- `realtime-order-board.tsx` — `data-tour="order-board"` on the board region.
- the FAB carries `data-tour="tour-replay"` itself.

A missing anchor → driver skips that step gracefully; the controller waits for
mount (next frame) before auto-start.

## Schema

`supabase/migrations/0023_vendor_tour_seen.sql`:

```sql
alter table vendors add column tour_seen_at timestamptz;
```

RLS already lets a vendor update its own row — no policy change. `src/lib/types.ts`
vendors Row/Insert/Update gain `tour_seen_at: string | null`.

## Testing

- `tour-steps.test.ts` (node) — step count + anchors per mode; desktop vs mobile
  selection; copy/order sanity.
- `dashboard-tour.dom.test.tsx` — FAB renders; click starts (driver mocked);
  auto-start gated by `seen` + pathname; `markTourSeen` fired on destroy;
  driver module mocked (don't test the lib).
- E2E: out of scope this pass.

## Error handling / edges

- Driver imported client-only (no SSR crash).
- Route change mid-tour → controller destroys driver on unmount.
- `?` FAB `z-index` below the Sonner toaster (top-right) — no collision (FAB
  bottom-right).
- Multiple dashboard pages share the layout, so the FAB is always present; only
  `/dashboard` auto-starts (step 1 needs the order board).

## Consensus notes (research 2026-06-27)

- Short tours win: 3-step ~72% vs 7-step ~16% completion.
- Interactive/"learning by doing" > passive slideshow; keep steps as _do-this_
  nudges, anchored to the golden path, not a feature catalogue.
- Autonomy mandatory: easy skip + low-friction replay.
- Persist server-side (user-scoped), not localStorage (browser-scoped → spam).
- Tours backfire when heavy-handed or stale; keep anchors stable (`data-tour`).
