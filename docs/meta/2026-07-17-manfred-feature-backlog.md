# qkit — Manfred Feature Backlog (2026-07-17)

Source: vendor requirements session with Manfred (coffee cart vendor, qkit
design partner). Attendees: Manfred, Kendrick (Mastercard connection),
Clarence, Lydia (notes). Full context: see auto-memory
`manfred_design_partner.md`.

**Note on completeness:** the session notes included three tables — Manfred's
Ecosystem, Problems Identified, and Use Cases Prioritized — that did not come
through in the text handed to this doc (placeholder only). The priority
ordering below is therefore an estimate from the solution descriptions and
design philosophy, **not** the vendor's actual prioritized ranking. Re-derive
P-numbers once the source tables are available.

This is a **product feature backlog**, distinct in kind from
`2026-07-02-master-task-registry.md` (bug/tech-debt remediation from code
audits). None of these features exist in the current codebase — this is
requirements input, not a spec. Confirm scope against
`docs/superpowers/plans/2026-06-05-qkit-core.md` before implementing.

---

## P1 — core workflow, blocks the vendor pilot

### F1. Scan-to-start model (two-queue: PENDING / ACTIVE)

Order placed → PENDING. Customer scans QR at counter → ACTIVE ("make now").
Solves ice-cream melt and cold-drink temperature by making the product at
collection time, not order time. Touches `orders.order_status` (currently
pending→confirmed→preparing→ready→completed) and the customer-facing
order-status page (`src/app/order/[boothId]/[orderNumber]/`). effort L —
new status semantics + a counter-side scan flow that doesn't exist today.

### F2. Unified queue board (digital + walk-up, sorted by age)

Merge QR orders and physical walk-up orders into one board, oldest-first, no
channel bias. Requires a way to enter walk-up orders into the same `orders`
table/board the vendor dashboard already renders
(`src/hooks/use-realtime-orders.ts`). effort M — mostly a walk-up order-entry
path; the merged/sorted board is close to what exists.

### F3. One-tap vendor workflow (order → make → done, auto-advance)

Collapse the vendor's interaction count: order appears automatically, one tap
marks done, customer is auto-pinged, board auto-advances. Batch mode for
finishing multiple drinks at once. effort M — UI/interaction redesign on top
of the existing order-board realtime plumbing.

### F4. Fat-finger prevention for booth close

Pause is the default, reversible action. Close requires Settings → Booth
Management → Confirm → 3-second hold, with a 60-second undo window; orders
are never deleted on close. effort S — this is a booth-management UI/guard
change, self-contained.

---

## P2 — payment + hardware, high value but more novel

### F5. PayNow auto-calculation from token stack

Token stack (drink spec) encodes a price delta per token; system
auto-generates a PayNow QR for the exact amount. No cash, no typing. Depends
on F6 (token station) existing first, or at minimum a price-encoding scheme
if launched via the digital kiosk path instead. effort L — new payment-QR
generation logic + amount derivation, plus PayNow integration specifics
(Kendrick/Mastercard connection may be relevant here).

### F6. Physical token station + ORDER STATION layout

Modular magnetic tokens (base → milk → strength → sweetness → temperature)
clip to cup; system reads the token stack and prints a QR sticker for the
cup. 4-step physical workflow, dual-purpose as a token dispenser and a
digital kiosk UI. effort XL — hardware design (tokens, magnetic reader,
sticker printer) is outside qkit's current software-only scope; the digital
kiosk UI half could ship independently as a stepped order-builder flow.

---

## P3 — differentiators, explore after core loop is proven

### F7. AI voice → QR pipeline

Customer speaks order → AI transcribes + translates → order encoded → QR
sticker printed at counter. Alternative input path to tokens/phone, aimed at
elderly customers and speed. effort L — needs a speech-to-order model plus
the same QR/printer pipeline as F6; sequence after F6's encoding scheme
exists so both inputs feed the same order representation.

---

## Positioning notes (context, not backlog items)

- Market gap: QR ordering + queue management + PayNow + loyalty in one
  package under S$100/mo — no existing competitor (Qashier, Eats365,
  Rewardly, MEGAPOS+iMakan) covers this combination. Queue management is the
  most underserved capability industry-wide; loyalty is the biggest
  available differentiator.
- **Path A:** token station as standalone micro-POS for hawkers/carts,
  S$29-49/mo — implies F6/F5/F1/F2/F3 as a bundled hardware+software product.
  **Path B:** ordering layer on top of existing POS, S$19-29/mo add-on —
  implies F1/F2/F3/F4 software-only, deferring F6's hardware entirely.
- Design philosophy: "the vendor makes drinks, not taps" — every button
  press is treated as a design failure when scoping F3/F4.

---

## Recommended sequencing

1. **F4** (fat-finger close guard) — smallest, self-contained, no new
   concepts, closes an existing risk.
2. **F2 + F3** (unified board + one-tap workflow) — extends the current
   realtime order-board rather than replacing it.
3. **F1** (scan-to-start) — new status semantics; do after F2/F3 so the
   board UI it plugs into is already settled.
4. **F5/F6 decision point** — resolve Path A vs Path B before building
   either; F6 (hardware) is a much larger commitment than F5 alone (which
   can run off a digital kiosk order-builder without physical tokens).
5. **F7** — only after F6 (or a Path-B equivalent order-encoding scheme)
   exists to feed into.
