# Feedback Streams, Per-Event Stats & Profit-Chart Fix — Design

**Date:** 2026-06-20
**Status:** Approved (brainstorming) — decisions A/A/A
**Author:** Clarence + Claude

Three independent workstreams; each can ship on its own. Research-grounded
choices noted inline.

---

## Part A — Profit / trend chart fix (`trend-chart.tsx`)

Shared by the admin "QKit revenue" chart and the vendor stats trend. Two bugs:

- **Y-axis cut off:** `margin.left: -18` pushes the axis off-canvas and
  `YAxis width={28}` is too narrow for `$1,234` labels.
- **X-axis blank:** `<XAxis dataKey="i" hide />` — hidden, and `i` is a bucket
  index, not a date.

**Fix:**

- `windowSeries` (`src/lib/stats.ts`) already buckets by day from `now`. Add a
  deterministic `t` (bucket start-of-day epoch ms) to each bucket — computed from
  the passed-in `now`, so it stays pure/testable.
- `trend-chart.tsx`: `margin.left: 0`; `YAxis width={44}`; un-hide `XAxis`,
  `dataKey="t"`, `tickFormatter` → short `D MMM` (e.g. "7 Jun"), `interval`
  thinned (show ~4–5 ticks), `minTickGap`, `fontSize: 11`. Keep the `$k`
  Y-formatter but only abbreviate ≥ $1,000.
- New pure helper `shortDay(ms)` in `src/lib/tz.ts` (or `utils`), unit-tested.

**Tests:** `stats.test.ts` — `windowSeries` buckets carry the correct `t`
(start-of-day, ascending). `shortDay` formats a known epoch.

---

## Part B — Feedback: three audiences, cleanly separated

Current state: one `feedback` table, `source IN ('customer','vendor')`. Customer
order feedback (1–5★) and vendor→QKit feedback (1–5★) both land there; **only the
admin can read it** (RLS admin-only SELECT). Vendors can't see their own reviews.

### B1 — Vendor→QKit becomes NPS (decision A)

B2B consensus: NPS is the primary loyalty metric. Replace the vendor 1–5★ on
`/dashboard/feedback` with NPS 0–10 ("How likely are you to recommend QKit?") +
optional comment.

- **Migration `0019`:** `ALTER TABLE feedback ADD COLUMN nps SMALLINT CHECK (nps
BETWEEN 0 AND 10)`. Used when `source='vendor'`; `rating` stays for
  `source='customer'`. (Keep both columns; a row uses one.)
- **Schema/action:** extend `feedbackSchema` + `submitFeedback` to accept `nps`
  for the vendor path (validate 0–10, mutually exclusive with `rating`).
- **UI:** new `NpsScale` (0–10 buttons) used by a vendor variant of the feedback
  form; customer order form keeps stars.
- **Admin:** compute NPS = %promoters(9–10) − %detractors(0–6) over vendor rows.

### B2 — Customer order feedback surfaced to the vendor (the real gap)

Marketplace best practice: a vendor's reviews are their reputation — show them.

- **Migration `0019` (same):** RLS policy `feedback_vendor_read_own` — a vendor
  may SELECT `source='customer'` feedback whose `booth_id` belongs to them
  (`booth_id IN (SELECT id FROM booths WHERE vendor_id = auth.uid())`). Defense-
  in-depth still holds: customers write anonymously; vendors read only their own.
- **Aggregation:** pure `src/lib/reviews.ts` — `summarizeReviews(rows)` →
  `{ count, average, distribution[1..5], recent[] }`. Unit-tested.
- **UI:** a "Reviews" card on `/dashboard/stats` (or a `reviews` section):
  average ★ + count + recent comments **ungated** (decision A); the
  rating-over-time trend gated to Pro/pass like other trends.

### B3 — Admin page split

`/admin/feedback`: two clear sections — **QKit feedback** (vendor NPS: score,
trend, comments) and **Customer order feedback** (per-booth ★ + messages) —
instead of one mixed list.

**Tests:** `reviews.test.ts` (average/rounding, empty, distribution, recent
ordering); NPS calc in a `nps.ts` helper test (promoter/detractor/passive math,
empty → null).

---

## Part C — Per-event permanent stats (decision A)

Orders persist forever (RLS-scoped to the vendor), so historical stats are always
computable — the only blocker is the rolling `statsRanges` gate. A paid pass =
one event window (`valid_from`→`expires_at`).

- **Migration `0020`:** `ALTER TABLE licenses ADD COLUMN label TEXT` (vendor's
  event name). RPC `set_license_label(p_license_id uuid, p_label text)`
  (SECURITY DEFINER): updates `label` only, only on a license the caller owns —
  avoids a column-wide vendor UPDATE policy that could touch `expires_at`.
  Vendor SELECT on own licenses already exists (`licenses_vendor_select`).
- **Events list:** `/dashboard/stats` gains an "Events" selector listing the
  vendor's licenses (label or a default like "Pass · 7 Jun", with the date
  window). Selecting one opens that window's **full** stats.
- **Ungated event view:** a license-window stats view computes `computeStats`
  over the vendor's orders within `[valid_from, expires_at]` — **bypassing
  `statsRanges`** because the window was paid for. Read-only. Implemented as a
  mode on the stats page (`?event=<licenseId>`) or `stats/events/[licenseId]`.
- **Rename UI:** inline "Rename" on each event → `set_license_label`.

This does NOT change live rolling-stats gating (free still 24h) — it only adds
permanent, ungated access to **paid** windows.

**Tests:** a window-stats selector (pure: pick orders within `[from,to]`) unit
test; `set_license_label` ownership covered by the pgTAP RLS suite (extend
`supabase/tests/rls.test.sql` when DB is up).

---

## Migrations & types

`0019_feedback_nps_and_vendor_read.sql`, `0020_license_label.sql`. Update
`src/lib/types.ts` to mirror (feedback `nps`, licenses `label`, the two RPCs).
**Cannot apply locally — Docker is down.** Migrations + types are written and
type-checked; applying (`supabase db push`) + pgTAP verification is a follow-up
when the DB is up. Pure-lib tests run without a DB and must pass.

## Sequencing

A (chart, no migration) → C (events) → B (feedback). Each part: pure lib + tests
→ UI → `pnpm check`/`test` → commit. Ship as one branch, merge to main.

## Acceptance criteria

- [ ] Trend chart shows dated X-axis ticks and uncut Y-axis labels (admin + vendor).
- [ ] Vendor feedback on `/dashboard/feedback` is NPS 0–10; admin shows an NPS score.
- [ ] A vendor sees their booths' customer ratings + recent comments (ungated);
      trend gated to Pro.
- [ ] Admin feedback page separates QKit-feedback from customer-order-feedback.
- [ ] A vendor can name a past pass and open that window's full stats, ungated,
      after it expires.
- [ ] `pnpm check` + `pnpm test` green; migrations + `types.ts` consistent.

## Out of scope (YAGNI)

- Feature-request board / upvoting (NPS first; revisit if asked).
- A separate vendor-created events entity (license window = event).
- Multi-day-per-pass sub-events (whole window = one named event).
- Public/customer-visible vendor ratings (vendor + admin only for now).

## Risks

- **Migrations unverified** (Docker down) — mitigated: pure SQL reviewed, types
  hand-mirrored, applied + pgTAP-checked as a follow-up.
- **NPS vs star split** could confuse the admin view — mitigated by B3's explicit
  two-section layout.
- **Event ungating** must not leak cross-vendor data — it reads only the caller's
  own RLS-scoped orders within a window of a license they own.
