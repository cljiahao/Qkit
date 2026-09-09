# qkit — Manfred Second AAR Feature Backlog (2026-09-10)

Source: Manfred's voice-note after-action review from his first live event
running qkit (2026-09-09 night, relayed via Atlas Bot), plus Clarence's own
proposed fixes and a brainstorming pass confirming two open design questions.
Supersedes nothing in `2026-07-17-manfred-feature-backlog.md` (F1-F7) — this
is real field feedback on top of that backlog, not a replacement. Docs-only
for now, **not scoped for implementation yet**.

**Note on completeness:** priority order below is Clarence's own read of
severity, not a re-run of the original backlog's P-number derivation.

---

## Already built, not yet used by Manfred (onboarding gap, not engineering)

- **Label printer (printkit integration)** — `PrintingSection`
  (`src/app/dashboard/booths/printing-section.tsx`), a per-booth opt-in
  switch, auto-prints a label for every QR order via printkit's NIIMBOT B1
  connector. Manfred's event ran without it turned on / without the
  hardware present.
- **Walk-up order entry** — `walkup-order-dialog.tsx`, staff can manually
  add an order straight onto the board for a customer who doesn't want to
  use the QR at all. Shipped as part of F2.
- **Daily-reset order numbers** — `displayOrderNumber` (`src/lib/orders`),
  a small human-friendly number per booth per day, not a large permanent
  running id. Already exists; may not have been surfaced clearly enough to
  customers at pickup.

**Action:** walk Manfred through enabling/using these before his next
event, rather than building anything new for them.

---

## New work, genuinely not built

### A. Order-board state split (kanban view)

Manfred's #1 pain point: a single age-sorted list forces mental tracking
("stopped at 67, restart 31"). Split the vendor-facing board into explicit
columns (incoming / accepted / done), with a possible extra "preparing"
column for stalls that need prep time (his own ice-cream stall doesn't).
Builds on the existing realtime board (`use-realtime-orders.ts`,
`realtime-order-board.tsx`) rather than replacing it. effort M.

### B. Customer-facing queue display (second screen)

A public, booth-scoped, auto-refreshing display meant for a second TV,
showing live order states without requiring a customer to watch their own
phone. Directly answers the "uncle" segment (won't self-monitor a phone)
and doubles as a public mirror of the board-state split above. Needs a
public-safe read path (existing customer order-status page already reads
via the service-role client for anonymous customers, same pattern
applies). effort M-L — new page, no new data model.

### C. Self-checkout pickup verification (Luckin-style)

Solves the #3 pain point (pickup mix-ups, "10, 10, 10, 10", queue-jumping)
by removing staff from the handoff entirely. Two design decisions
confirmed via brainstorming:

- **Mechanic:** self-checkout shelf/locker model. Finished drinks go on a
  numbered shelf. The cup's printed label (already produced per-order via
  printkit, see above) carries a per-order QR. Customer scans it
  themselves with their own phone to confirm pickup. No staff scan, no
  dedicated scanner hardware.
- **Completion semantics:** scan-primary with a staff fallback. Scanning
  is the normal path from `ready` to `completed`. Staff can still
  manually mark an order done from the board (existing F3 one-tap
  action) if a customer's phone has no data/battery at a crowded outdoor
  event — avoids a stuck order blocking a shelf slot with no recovery
  path.

Open, not yet designed: what the pickup QR encodes (likely reuses the
existing per-order route with an added collect-confirmation action,
distinct from the original ordering QR), and how walk-up orders (no
customer phone QR history) participate in the same shelf model. effort
L — new order-lifecycle entry point, printkit label content change, new
public route.

### D. QR code physical placement

Not a code problem — better signage/stand placement so customers can find
the ordering QR without pulling Manfred off task. Operational, not
engineering.

---

## Non-engineering, parallel track

- Schedule a walkthrough with Manfred before his next event: show him
  what already exists (printer, walk-up entry, order numbers), use it to
  scope what's real gap vs onboarding gap.
- Tighten FAQ / user guide; short how-to videos for vendors, could post on
  Instagram.

---

## Recommended sequencing

1. Walkthrough with Manfred (unblocks everything else — separates real
   gaps from onboarding gaps before more engineering time is spent).
2. **A** (board state split) — smallest new-build item, directly reused
   by B.
3. **B** (customer-facing queue display) — reuses A's state model.
4. **C** (self-checkout pickup scan) — most novel, biggest lift, do last
   once A/B are proven live.
5. FAQ/guide/video track can run in parallel throughout, doesn't block or
   depend on the above.
