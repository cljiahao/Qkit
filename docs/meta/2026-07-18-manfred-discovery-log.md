# Manfred — Vendor Discovery Log (consolidated through 2026-07-18)

Everything Manfred (qkit's design partner) has told us, across the
original requirements session and follow-up discussion, consolidated into
one place. This is **his input, not our response to it** — for what qkit
is actually building in reaction to this, see
`2026-07-17-manfred-feature-backlog.md` and
`2026-07-17-phase1-manfred-pilot-job-board.md`.

## Who he is, and his business

Coffee cart vendor — but not a single-format business. He runs a mobile
cart across **weddings, corporate events, and a shop**. This matters: his
needs split into two different modes — a walk-up/queue-heavy mode (events,
high volume, time pressure) and a **hospitality mode** where human contact
is the point, not overhead (weddings/corp events specifically).

## His positioning view — not a POS competitor

Explicit and repeated: he doesn't see the opportunity as competing with
POS systems ("there's so many already"). His read is that the real prize
is **challenging Grab/foodpanda's ~30% commission** on online ordering —
giving vendors a direct channel that doesn't hand a third of the sale to a
delivery platform. This is a market-positioning opinion from him, not
something we derived internally.

## His stated values — human interaction over automation

Explicit, and it shapes how far to push automation: he wants **more**
human interaction at his events, not less, especially weddings/corp
events. Anything that reads as "self-serve kiosk replacing a person" cuts
against what he's actually asking for there — automation should remove
his _busywork_, not his presence.

## Market research he's done himself (not his own pain point)

He spoke to ice cream vendors directly, asking why they wouldn't onboard
online ordering. Their answer: if a customer orders and staff scoop
immediately, it melts before the customer arrives to collect. He doesn't
sell ice cream — this was him validating a problem in an adjacent vendor
segment, not describing his own cart's need.

## Concrete pain points, in the order he raised them

1. **The board needs someone tending to it constantly.** Not a fear of
   accidental mistakes — a labor/attention-cost complaint. He acknowledged
   the one-tap work already in progress helps, then asked how to improve
   it further.
2. **Ready orders sit until manually cleared.** Specifically floated
   auto-clearing an order some time (he suggested ~15 seconds) after it's
   ready if nobody's marked it collected.
3. **Finding a specific past order is slow.** Wants to quickly search/find
   a ticket number on the completed-orders view to double-confirm a
   dispute.
4. **Hand-writing on cups costs time and is illegible.** Even with online
   ordering, someone still writes the customer's name and order number by
   hand on the cup — slow, and handwriting varies person to person.
   Wants a sticker printer.
5. **Wants payment confirmation, not just a QR.** Asked directly whether
   we can confirm a PayNow payment actually went through — bank
   notification or similar — rather than just showing the customer a QR
   and trusting them.
6. **Worried about over/underpayment from mistyped amounts.** Gave a
   concrete example: total is $7.80, customer types $780 by mistake. He
   already knows PayNow QR codes can encode a fixed amount and asked if
   qkit could auto-generate the QR with the order's exact total once the
   customer has ordered.

## Something he's independently building — not just an idea

He's **already working with a 3D-printing vendor** on interactive physical
order-build tabs, styled after Japanese physical ordering systems —
customers physically assemble/select tabs to build their drink order.
This is real, in-progress hardware work on his side, framed explicitly
around the human-interaction value above (customers _play_ with the
tabs — an experience, not a self-checkout replacing a person). His own
question: once the customer finishes, how does the system capture the
final combination — RFID, or something else? He then floated the QR/photo
recognition angle himself as a possibility worth exploring.

His described end-to-end flow for this: customer builds the order at the
tabs → some capture step → order appears live on the booth's order page →
sticker prints → he just makes the coffee → customer collects by order
number.

## Something he shared as a reference, not a request

Introduced **Once.film** — a QR-to-browser shared photo album webapp used
at events (scan → camera opens in-browser → photos "develop" into a
shared album after the event, no app download). Raised it more as a UX
touchstone (disposable-camera nostalgia, instant-on simplicity) than a
literal feature request.

## Open threads — still need his direct input, not ours

- The physical-tab capture mechanism (RFID vs. something else) needs a
  real answer once his 3D-printing collaboration is further along — not
  decidable from our end alone.
- Whether any of his own menu items are actually melt/temperature
  sensitive (the scan-to-start problem he researched via ice cream
  vendors) — unconfirmed whether this applies to his own cart at all.
- A real number for "how long does a drink typically sit before a
  customer collects it" — relevant to the auto-clear timeout, better
  sourced from his own experience than guessed.
