# Booth Ops Improvements — Design

Date: 2026-06-12
Status: Approved (pending spec review)

A round of four related vendor-ops improvements. Shared dependency: a single
Singapore-timezone helper, since three of the four reason about wall-clock time.

## Shared: timezone helper

`src/lib/tz.ts` — qkit is Singapore-only, so all wall-clock reasoning uses
`Asia/Singapore`, never server UTC or the customer's browser tz.

```ts
export const BOOTH_TZ = "Asia/Singapore";
// Minutes-since-midnight (0–1439) of an ISO instant, in SGT.
export function sgtMinutes(iso: string): number;
// Hour-of-day (0–23) in SGT.
export function sgtHour(iso: string): number;
// Weekday key ("mon".."sun") in SGT.
export function sgtWeekday(iso: string): WeekdayKey;
```

Implemented with `Intl.DateTimeFormat({ timeZone: BOOTH_TZ })`. Deterministic
given input → unit-testable. Per-booth tz is a future extension; not now.

---

## 1. Working hours

### Data model (migration `0007_booth_hours.sql`)

Add a nullable `hours jsonb` column to `booths`. Discriminated union so the
editor can round-trip the vendor's chosen mode:

```ts
type BoothHours =
  | null // no restriction — open whenever is_active
  | { mode: "daily"; open: string; close: string } // "HH:MM"
  | { mode: "weekly"; days: Record<WeekdayKey, DayWindow | null> }; // null day = closed

type DayWindow = { open: string; close: string };
type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
```

`types.ts` `booths` Row/Insert/Update gain `hours: Json | null`. A tolerant Zod
read schema (`boothHoursSchema`) parses the JSONB; unparseable → treated as
`null` (open), never throws.

### Open/closed logic

`src/lib/hours.ts` — pure, unit-tested:

```ts
export function isBoothOpen(
  booth: { is_active: boolean; hours: BoothHours },
  nowIso: string,
): boolean;
```

- `is_active === false` → closed (hard gate, unchanged).
- `hours == null` → open.
- `daily` → `sgtMinutes(now)` inside `[open, close)`. If `close <= open`, the
  window wraps midnight (open if `now >= open || now < close`).
- `weekly` → look up `days[sgtWeekday(now)]`; `null` → closed; else same window
  check as daily.

`nextOpenLabel(booth, now)` returns a short human string for the closed banner,
e.g. `"Opens 10:00"` (today's open if still upcoming, else the next day with a
window).

### Enforcement (two layers)

- **Customer page** (`order/[boothId]/page.tsx` + `order-form.tsx`): when closed,
  render the menu **read-only** with a banner _"Closed — opens 10:00"_; disable
  the place-order button. Customers can still browse.
- **`placeOrder` server action**: re-fetch the booth, run `isBoothOpen`, reject
  with `"This booth is closed"` if not open. Client checks are never trusted.

### Editor UI

`src/app/dashboard/booths/working-hours-editor.tsx` — a controlled component
under the Active checkbox in `booth-form.tsx`. Local state mirrors `BoothHours`.

- **Default = daily:** `Opens [time] Closes [time]`, hint _"Leave blank = always
  open."_ Both blank → `hours = null`.
- **Button "Set different hours per day"** → `weekly`: seven rows (Mon–Sun), each
  `Opens/Closes` + a **Closed** checkbox. On expand, every day pre-fills with the
  current daily window (tweak, not start blank).
- **Button "Use same hours every day"** → collapse back to `daily` (uses Monday's
  window, or the first defined day).

`boothFormSchema` gains `hours: boothHoursSchema` (strict on write). `saveBooth`
persists it.

### Vendor board indicator

Each booth gets an **Open / Closed** pill (computed via `isBoothOpen` against the
server `now`, passed into the board). Lightweight; informational.

---

## 2. Active pill recolor

The live-orders pill in `realtime-order-board.tsx` is always ember, so calm and
slammed look identical. Make it load-semantic:

- `0` active → **green** ("All clear").
- `≥1` active → **ember** (current accent), `"N active"`.

No red "slammed" tier (threshold would be arbitrary). No tooltip — the filter
tabs already provide the per-booth breakdown.

---

## 3. Hide dead booth tabs

The board renders a tab per booth regardless of state, so a turned-off booth
lingers as a filter. Deactivating a booth does **not** cancel its in-flight
orders, so the rule is:

> Render a booth's tab iff `is_active || activeCount > 0`.

- Active booth → always shown.
- Turned-off booth with orders still cooking → stays until they clear (self-cleans
  on the next render once the last one is picked up/cancelled).
- Turned-off booth, 0 active → tab hidden.

Plumbing: `dashboard/page.tsx` adds `is_active` to the `booths` select; the board
`Props.booths` gains `is_active: boolean`. `multiBooth` and the tab list compute
over the **visible** booths. If the current `filter` points to a now-hidden booth,
fall back to `"all"`.

Note: this is the **Active toggle** only. A booth that is active but outside its
working hours stays visible — it's still the vendor's, just temporarily shut.

---

## 4. Busiest-hour stat

Extend `src/lib/stats.ts`:

- `StatsOrder` gains `created_at: string`.
- `StatsSummary` gains:
  ```ts
  hourly: {
    hour: number;
    orders: number;
    revenue_cents: number;
  }
  []; // 24 entries, 0..23
  busiestHour: number | null; // hour with most orders, null if no orders
  ```
- Bucket each non-cancelled order by `sgtHour(created_at)`. Single pass alongside
  the existing aggregation. Pure, unit-tested (incl. SGT bucketing + empty set).

`stats-view.tsx`: add a **"Busiest hours"** Recharts bar chart (orders per hour;
hours with zero orders shown as empty bars for shape) and a caption
_"Busiest: 12–1pm (34 orders)"_ derived from `busiestHour`. Honors the existing
range (24h/7d/30d) and booth filters — over a multi-day range it surfaces the
recurring daily peak, which is the actionable view for staffing/prep. The stats
page already passes full order rows; ensure `created_at` is included.

---

## Files touched

| File                                                  | Change                                         |
| ----------------------------------------------------- | ---------------------------------------------- |
| `supabase/migrations/0007_booth_hours.sql`            | **new** — `booths.hours jsonb` nullable        |
| `src/lib/tz.ts`                                       | **new** — SGT helpers                          |
| `src/lib/tz.test.ts`                                  | **new**                                        |
| `src/lib/hours.ts`                                    | **new** — `isBoothOpen`, `nextOpenLabel`       |
| `src/lib/hours.test.ts`                               | **new**                                        |
| `src/lib/types.ts`                                    | `booths.hours`                                 |
| `src/lib/schemas.ts`                                  | `boothHoursSchema`, `boothFormSchema.hours`    |
| `src/app/dashboard/booths/working-hours-editor.tsx`   | **new**                                        |
| `src/app/dashboard/booths/booth-form.tsx`             | embed editor, thread `hours`                   |
| `src/app/dashboard/booths/actions.ts`                 | persist `hours`                                |
| `src/app/dashboard/booths/[boothId]/page.tsx`         | pass `hours` into form initial                 |
| `src/app/order/[boothId]/page.tsx` + `order-form.tsx` | closed banner + disable order                  |
| `src/app/order/[boothId]/actions.ts`                  | server-side closed rejection                   |
| `src/app/dashboard/page.tsx`                          | select `is_active`, `hours`; pass server `now` |
| `src/app/dashboard/realtime-order-board.tsx`          | pill recolor, hide dead tabs, open/closed pill |
| `src/lib/stats.ts` + `stats.test.ts`                  | hourly histogram + busiest hour                |
| `src/app/dashboard/stats/*`                           | busiest-hour chart, ensure `created_at`        |

## Migration step (vendor action)

`0007_booth_hours.sql` must be applied to the hosted DB (Supabase SQL editor),
same as 0003–0006. Existing booths get `hours = null` → unchanged behavior
(always open when active). No backfill needed.

## Testing

- Unit: `tz` (SGT hour/weekday/minutes at boundaries incl. across UTC midnight),
  `hours` (inactive, null, daily in/out, overnight wrap, weekly per-day + closed
  day), `stats` (hourly bucketing, busiest tie-break, empty).
- Manual: set daily 10:00–18:00 → order blocked outside, allowed inside, banner
  shows; weekly with a closed day → blocked that day; deactivate a booth with 0
  orders → tab disappears, with orders → stays; pill green at 0 / ember at ≥1;
  busiest-hour chart matches order times.
- `pnpm check` green.

## Risks / notes

- **Overnight weekly windows** (e.g. Fri 22:00–02:00) are evaluated against the
  start weekday; an order at 01:00 Sat is checked against Sat's window, not Fri's
  carry-over. Acceptable for booth/event use; documented limitation.
- **Server `now`**: enforcement and the open/closed pill use server time (UTC
  instant) converted to SGT — consistent regardless of customer device clock.
