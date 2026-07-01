# Rotatable Booth QR Token — Design

**Date:** 2026-07-01
**Status:** Approved (design), pending implementation plan
**Author:** Clarence + Claude

## Problem

The customer order URL encoded in a booth's QR code is `/order/{boothId}` — a
bare, **permanent** booth UUID. Anyone who scanned or saved that link on a
previous day (or an event) can return and place orders whenever the booth is
open. A UUID is unguessable, but it never changes, so there is no way for a
vendor to invalidate stale/saved links. This invites stale and malicious repeat
ordering that clutters the live board.

Existing defenses (per-IP rate limit of 8 orders/60s, booth open-hours and
serveability gates) throttle floods but cannot revoke a saved link.

## Goal

Give each booth a **rotating access token** that gates the order entry page.
The vendor decides when to regenerate it (e.g. between events/days). Regenerating
immediately invalidates every previously printed/saved QR for that booth.

## Decisions (locked during brainstorming)

1. **Stale scan → hard block.** A stale/absent token shows an explicit
   "code expired, ask the booth for the current QR" screen. No menu, no ordering.
2. **One active token at a time, no grace window.** Regenerate is a deliberate,
   vendor-initiated action gated behind a **confirmation modal that names the
   booth** and warns all current codes stop working immediately. (Chosen over an
   instant silent kill and over a timed grace window.)
3. **URL shape:** `/order/{boothId}?k={token}`. Keep the existing route; add the
   token as a query param. Surgical — no routing rewrite, boothId in the URL is
   harmless because ordering now requires a valid token.
4. **Status page is NOT gated.** `/order/{boothId}/{orderNumber}` stays keyed on
   the stable boothId so a customer tracking an order keeps working even if the
   vendor regenerates mid-session.

## Token generation

- **16 random bytes → URL-safe base64 (base64url), padding stripped = 22 chars,
  ~132 bits entropy.** Clears the OWASP ≥128-bit floor for URL tokens.
- Generated in Postgres via pgcrypto (already available in Supabase):
  ```sql
  translate(encode(gen_random_bytes(16), 'base64'), '+/', '-_')
  -- then strip '=' padding
  ```
- CSPRNG only (`gen_random_bytes`), never `Math.random()`.

## Data model

Add one column to `public.booths`:

```sql
ALTER TABLE public.booths
  ADD COLUMN access_token TEXT NOT NULL DEFAULT public.gen_booth_token();
```

- `gen_booth_token()` — `IMMUTABLE`/`VOLATILE` SQL function wrapping the
  base64url expression above (VOLATILE, since `gen_random_bytes` is).
- The `DEFAULT` backfills existing rows in the same migration; new booths always
  get a token on insert.
- Update `src/lib/types.ts` to add `access_token: string` to the booths row type.

## Components / flow

### Order entry page — `src/app/order/[boothId]/page.tsx`

- Read `k` from async `searchParams`.
- Fetch `access_token` alongside the existing booth select (one round-trip; the
  public `booths_public_read` RLS policy already exposes active booths).
- If `k` is missing or `!== booth.access_token` → render a **hard-block screen**
  (HTTP 200, `print:hidden` back link, no menu, no `OrderForm`). Copy:
  _"This code expired — ask the booth for the current QR."_
- Token comparison lives in a pure helper in `src/lib` (e.g. `isTokenValid`) so
  it is unit- and mutation-testable and reused by the action.

### Place-order action — `src/app/order/[boothId]/actions.ts`

- `placeOrder` receives the token (threaded through the form) and re-validates it
  server-side against the fetched booth row **before** claiming an order number.
  Never trust the page gate alone.
- On mismatch: `{ success: false, error: "This code expired — please rescan." }`.
- Order form (`order-form.tsx`) carries the current `k` and passes it to
  `placeOrder`.

### QR poster — `src/app/dashboard/booths/[boothId]/qr/`

- `page.tsx` selects `access_token` (owner RLS) and passes it to the poster.
- `booth-qr-poster.tsx` builds `${origin}/order/${boothId}?k=${accessToken}` for
  both the QR `value` and the "type this link" fallback.

### Regenerate action + modal

- New server action `regenerateBoothToken(boothId)` in the booths actions module:
  `requireVendor`, UPDATE scoped by existing `booths_vendor_all` RLS to the
  owner's booth, sets `access_token = gen_booth_token()`, `revalidatePath` the
  QR page. Returns `ActionResult`.
- QR page gets a **Regenerate QR** button → confirmation modal (shadcn dialog /
  alert-dialog) naming the booth:
  _"Regenerate QR for “{booth.name}”? Every printed or saved code for this booth
  stops working immediately — you'll need to reprint."_
  Confirm → action → fresh QR renders.

## Security notes

- The token is a URL-borne capability that only gates ordering (a public-by-design
  action). It is low-value: the per-IP rate limit, open-hours, and serveability
  gates still apply behind it. Treat it as a revocable link secret, not a credential.
- **No RLS change.** Owner reads/writes the token via `booths_vendor_all`; the
  public entry page compares `k` against the token exposed by the existing
  `booths_public_read` policy. Do not widen any policy.
- Token never appears in `NEXT_PUBLIC_*` and is never logged.
- Service-role client is not needed and must not be used here.

## Testing

- **Unit (`src/lib`, mutation-tested):** `isTokenValid` — valid match, mismatch,
  missing/empty token.
- **DOM (`*.dom.test.tsx`):** entry page/order form renders the block screen on
  bad or missing `k`; hides menu + order form; renders normally on valid `k`.
- **Action:** `placeOrder` rejects a bad/missing token before any insert.
- **E2E smoke (`e2e/`):** regenerate a booth's token → old `?k=` link hard-blocks,
  new link orders successfully. (Extends the coffee-cart seed flow.)

## Post-implementation quality gate (required)

After implementation and `pnpm check` + tests pass, run a quality scan for:
code smells, tech debt, duplication (dedupe the token-compare / URL-build logic —
single source of truth), and test coverage of the new paths. Address findings
before finishing the branch.

## Out of scope (YAGNI)

- Token history / multiple concurrent valid tokens / timed grace windows.
- Automatic/scheduled regeneration (per-day, per-event). Manual only.
- Opaque-slug URL that hides the boothId (`/order/{token}`) — rejected as a
  routing rewrite for no security gain given the hard-block gate.
