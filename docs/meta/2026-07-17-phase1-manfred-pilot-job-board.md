# qkit — Phase 1 Job Board: Manfred Pilot Readiness (2026-07-17)

Scope: Manfred's F1-F4 (`2026-07-17-manfred-feature-backlog.md`) plus a
payment-hardening pass — the "Phase 1" slice of
`Merqo Business/docs/business/2026-07-17-merqo-roadmap.md`. Deliberately
**not** paykit integration, not billing, not hardware — those are Phase 2/3.

Each item below is one PR: independently mergeable, independently testable.
Ordered by dependency, not by importance — items in the same track can be
reordered within the track; tracks themselves are mostly independent of each
other except where noted.

---

## Track A — Booth close safety (F4)

### PR-A1: Fat-finger close guard — effort S

Booth close today is a plain `is_active` toggle in the booth form
(`src/app/dashboard/booths/actions.ts:157`, `booth-form.tsx`) — one click,
no confirmation, no undo. Manfred flagged this directly as a risk.

**Scope:** pause stays the current one-click toggle (unchanged — pause is
meant to be cheap and reversible). Add a separate, harder-to-reach **close**
action: Settings → Booth Management → Confirm dialog → 3-second press-and-hold
button → 60-second undo toast. Orders are never deleted on close (already
true — `is_active=false` doesn't touch `orders`; just make sure no new code
path added here changes that).

**Files:** `src/app/dashboard/booths/booth-form.tsx` (or a new
`booth-close-guard.tsx` component), `src/app/dashboard/booths/actions.ts`
(the close action itself, distinct from the existing save/toggle action).

**Acceptance:** pause unchanged (1 click). Close requires the settings path +
hold + shows an undo toast for 60s. Undo restores `is_active=true`. No
`orders` rows touched by either path.

**No dependency on any other track — do this one first or in parallel.**

---

## Track B — Vendor board consolidation (F2 + F3)

### PR-B1: Walk-up order entry — effort M

Today every row in `orders` originates from a customer's QR-scan checkout
(`src/app/o/[code]/actions.ts`). F2 needs walk-up (in-person, no QR) orders
in the same table so the board can merge them.

**Scope:** a vendor-side "add walk-up order" action on the dashboard —
minimal form (menu items + qty, no customer contact info required) that
inserts into `orders` via a new vendor-authenticated action (not the public
`place_order` RPC — that path is customer-facing and rate-limited/validated
for anonymous use; walk-up entry is vendor-authenticated and should be a
separate, simpler insert path). Flag the row's origin (`source: 'walkup'` vs
`'qr'` — likely a new nullable column or reuse of an existing metadata field,
check `orders` schema before deciding) so the board can label it without
changing sort behavior.

**Files:** new `src/app/dashboard/walkup-order-form.tsx` (or inline in the
board), new server action, `supabase/migrations/00XX_walkup_orders.sql` if a
new column is needed, RLS check (vendor can only insert for their own booth).

**Acceptance:** vendor can add a walk-up order from the dashboard; it appears
in `orders` with the same shape a QR order has (so PR-B2 doesn't need
special-casing); pgTAP test for the RLS boundary (vendor can't insert for
another vendor's booth).

### PR-B2: Unified queue board — sort by age, no channel bias — effort S

**Depends on PR-B1** (needs walk-up orders to exist to test the merge).

**Scope:** `src/app/dashboard/realtime-order-board.tsx` already reads from
one `orders` table — confirm it has zero channel-based filtering/grouping,
sorts purely by `created_at`/order age, and the UI doesn't visually separate
QR vs walk-up beyond a small origin badge (per PR-B1's `source` field). This
may be mostly already true (single table, single board) — this PR is
primarily verification + the origin-badge UI + a regression test that mixes
both sources in one seed and asserts oldest-first ordering.

**Files:** `src/app/dashboard/realtime-order-board.tsx`, `order-card.tsx`
(origin badge), a `.dom.test.tsx` mixed-source ordering test.

**Acceptance:** seeded test with interleaved QR + walk-up orders renders
oldest-first regardless of source; origin badge visible but doesn't affect
sort/grouping.

### PR-B3: One-tap vendor workflow — effort M

**Depends on PR-B2** (needs the unified board settled — reordering the
board's interaction model twice would be wasted work).

**Scope:** collapse the current advance/confirm/cancel interaction set
(`src/app/dashboard/order-actions.ts` or wherever `advanceOrder`/
`cancelOrder` live per the master-task-registry's T8 reference) to a single
primary tap per order: tap → mark done → customer auto-pinged (reuse
whatever's already firing status updates to the customer status page) →
board auto-advances/removes the card. Add a **batch mode**: multi-select
several `preparing` orders, one tap marks all done.

**Files:** `src/app/dashboard/realtime-order-board.tsx`, `order-card.tsx`,
the order-status server actions, a new batch-select UI state.

**Acceptance:** single tap takes an order from its current status to done
with no intermediate confirmation step; customer status page reflects it
without a manual "notify" step; batch mode marks N selected orders done in
one action; existing single-order advance/cancel/confirm guards (T8's
`.eq("status", expected)` concurrency check) still apply per order in batch
mode — a batch action must not remove the per-row optimistic-concurrency
check just because it's now bulk.

---

## Track C — Scan-to-start queue (F1)

### ⚠ Needs its own design pass before PR-sizing — do not start coding from this bullet list

This is the biggest unknown in Phase 1. Two real design questions block a
clean PR breakdown:

1. **Status semantics.** `OrderStatus` already has `pending` and `confirmed`
   as enum values, but master-task-registry **T38** flags them as
   _currently dead_ (unreachable — orders apparently skip straight past
   them today). F1's PENDING→ACTIVE distinction might cleanly reuse these
   existing-but-dormant values instead of adding new ones — worth checking
   before touching the enum, since adding new values only to leave three
   unused states is worse than reviving `pending`/`confirmed` with real
   meaning.
2. **The scan-at-counter mechanic itself.** Customer already has a QR/link
   from checkout; "scan to activate" needs either (a) a second physical QR
   printed with the order and rescanned at pickup, (b) the customer tapping
   a button on their existing status page when they arrive at the counter,
   or (c) something else. These have very different implementation costs
   and physical-world assumptions (does Manfred's cart have a working
   scanner? a phone camera works for (a)/(b) either way). This needs
   Manfred's input, not just an engineering guess.

**Recommendation:** run this specific sub-feature through
`superpowers:brainstorming` on its own once Track A/B are underway, with
Manfred's answer to question 2 in hand. Rough sizing once resolved: likely
2 PRs (status-semantics migration + board integration, then the
scan-to-activate UI/flow) — effort L overall, don't commit to a tighter
estimate until the design pass happens.

---

## Track D — Payment hardening (Phase 1 item 2, non-code)

### QA-D1: Live-hardware PayNow proof with Manfred — effort S, not a PR

qkit already has a working vendor-set-amount PayNow QR flow
(`src/lib/payments/paynow.ts`, booth payment section, `T35`'s image
`onError` fallback already shipped). Phase 1 does **not** call for swapping
this to paykit's engine (that's Phase 2, Gap 2 in the roadmap) — it calls
for proving the _existing_ flow works end-to-end with a real vendor on real
hardware: QR renders correctly on Manfred's phone/printer setup, payment
amount is correct, the payment-confirmation step (however qkit currently
marks an order paid) works under real wifi conditions at his cart.

**Not code** — this is a supervised test session with Manfred, logged as
notes/bug reports that turn into normal bug-fix PRs if anything breaks. Track
it here so it isn't silently skipped.

---

## Track E — Board hands-off + labeling (2026-07-18, from a follow-up Manfred discussion)

Three concrete pain points from a deeper conversation about time-cost, not
new speculation: the board needing constant tending, finding a specific
order in history, and hand-writing (illegibly) on every cup.

### PR-E1: Vendor-configurable auto-clear for ready-but-uncollected orders — effort M

Confirmed gap: `ready → completed` (`src/lib/orders.ts:29`) only happens on
a manual "Mark Picked Up" tap today — nothing auto-clears it. **Decided
2026-07-18**: accept the simple trade-off — auto-flip `ready` orders to
`completed` after a vendor-configurable timeout, same pattern as the
existing ticket-aging settings (`board_settings.aging_min`/`overdue_min`).
Default timeout still needs a real number — not worth deep-researching (not
a googleable fact, it's Manfred-specific), better to ask him directly how
long a drink typically sits before collection, or just ship a conservative
default (2-3 min, not the originally-floated 15s, which reasoning suggests
is too aggressive for most walk-up timing) and let him tune it.

**Files:** `src/lib/types.ts` (`BoardSettings` — add the new field),
`src/app/dashboard/settings/` (settings form), a sweep mechanism — needs a
small implementation decision during the PR: a client-triggered periodic
server action (matching the existing `usePolling` pattern already in use)
scoped to the open dashboard's booths is the lighter-weight option vs. a
new Postgres cron job; lean toward the former unless there's a reason the
sweep needs to run even when no vendor has the dashboard open.

**Acceptance:** ready orders older than the configured timeout flip to
completed automatically; setting defaults sensibly and is vendor-editable;
fulfilment-rate stat's now-approximate meaning is an accepted trade-off,
not a bug.

### PR-E2: Search/filter on the completed-orders page — effort S

Confirmed gap: `completed-orders-list.tsx` is a plain paginated grid today,
zero search. Add a filter input (order number, and maybe customer name if
collected) so a vendor can quickly find a specific ticket to double-confirm
a dispute. No open design question — straightforward client-side filter
given `Paginated` is already client-side.

**Files:** `src/app/dashboard/completed/completed-orders-list.tsx`.

**Acceptance:** typing an order number narrows the grid to matching orders;
clearing the input restores the full paginated list.

### PR-E3: Printed name + order-number label for the cup — effort L, needs its own design pass

Same underlying capability as the previously-speculative "kitchen ticket
printer" idea (Track C's era, `docs/business/2026-07-17-vendor-expansion-
and-integrations-strategy.md`) — now concretely validated: hand-writing on
every cup costs time and is illegible across different handwriting. This
is the **first hardware integration anywhere in the ecosystem** (confirmed
— no ESC/POS or any printer code exists yet in any kit), so like Track C,
don't PR-size this from a bullet list — run it through a real design pass
first: printer model/connection method (USB/Bluetooth/network — matters a
lot for a mobile cart), label size/content (name + order number minimum;
does it need the drink spec too?), and whether it prints automatically on
order-placed or on a vendor tap.

**2026-07-21 research finding:** a fully generic "any vendor's printer"
browser-only integration is not realistic (no open cross-vendor protocol a
plain web app can target; WebUSB/WebSerial/WebBluetooth are Chromium-only
with zero Safari/iOS support, ruling them out for phone/tablet-based solo
vendors; Square and Lightspeed themselves don't offer generic BYO-printer
either). Real options are (a) Star Micronics CloudPRNT — printer polls a
server URL, clean fit for a Vercel API route, but Star hardware only, or
(b) a cloud print-relay like PrintNode — broader brand coverage but needs
a locally-installed companion client on a machine wired to the printer.
Epson ePOS-Print (local-IP HTTP, no local client) is a real open gap the
research didn't close — worth a follow-up look before committing to a
family, since Epson hardware is common/cheap. Parked until a pilot vendor
has a specific printer in hand — no code yet.

When this does get built: structure it as a `kind`-discriminated adapter,
the same shape `src/lib/payments/adapters.ts` already uses for payment
methods (`PrinterConfig` JSONB column on `booths`, one dispatcher, one
small module per printer family/protocol). Adding a second printer family
later then costs one new adapter + one union variant, not a rewrite — but
don't scaffold this shell before a first real adapter exists to justify it.

---

## Suggested order

1. **PR-B1 → PR-B2 → PR-B3** (walk-up entry → unified board → one-tap) —
   the core day-to-day workflow Manfred will actually feel. Fold **PR-A1**
   (close guard) into B3, not a standalone first PR — there's no quick-close
   button to guard until B3 introduces the first vendor quick-tap controls;
   building the guard before then would be guarding a risk that doesn't
   exist yet.
2. **PR-E1 → PR-E2** (auto-clear → completed-page search) — small, no
   dependency on the B-track, can slot in parallel or right after.
3. **QA-D1** (payment proof) — run this anytime once B-track is live enough
   for a real test session; doesn't block or get blocked by Track C/E3.
4. **Track C design pass** and **PR-E3's design pass** — both genuinely
   need more input before PR-sizing (Track C: Manfred's answer on the
   physical scan mechanic, relevant to other vendor archetypes not his own
   cart; E3: printer model/connection method, the ecosystem's first
   hardware integration). Run once Track B is merged, so whatever they plug
   into is stable.
