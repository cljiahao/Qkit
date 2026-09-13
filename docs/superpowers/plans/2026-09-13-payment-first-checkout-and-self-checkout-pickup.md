# Payment-First Checkout + Self-Checkout Pickup Kiosk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate a QR order's visibility/order-number/kitchen-ticket on the
customer actually claiming payment (with a photo proof + OCR hint), merge
the vendor's two-tap payment-review into one, auto-cancel abandoned unpaid
orders, and add a public self-checkout pickup kiosk that a customer scans
their own order-status QR against.

**Architecture:** SQL-level change first (defer `order_number` assignment,
new atomic assign function), then the app-layer ripple this creates
(nullable types/schemas), then each customer/vendor-facing feature built on
top in dependency order: claim flow → payment page → board visibility →
reconciled review action → abandoned-payment sweep → OCR hint → pickup QR

- kiosk.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres/RLS/Storage/
Realtime), Zod, Vitest + RTL, pgTAP, tesseract.js (client-side only).

**Spec:** `docs/superpowers/specs/2026-09-13-payment-first-checkout-and-self-checkout-pickup-design.md` (v6)

## Global Constraints

- No `any`, no `@ts-ignore` (TypeScript strict).
- Validate all customer input with Zod at every boundary.
- Authorization lives in RLS/service-role boundaries, never in app code alone.
- Service-role client only in Server Actions, never client components.
- No em dash (—) in user-visible JSX text/attrs — the ESLint gate blocks it.
- No new inline comments except load-bearing ones (one line max); this
  codebase's `no-inline-comments` ESLint rule is `error`.
- Migrations are written to `supabase/migrations/` only — **never run
  `supabase db push`/apply against the user's Supabase project directly**;
  the user applies them via the SQL editor themselves. Local `supabase
start` + local apply is fine and expected for testing this plan's work.
- Every folder's README updated in the same commit as its substantive change.
- Run `pnpm check && pnpm vitest run && pnpm build` before any commit that
  isn't documentation-only; the pre-push hook re-runs `check`+`vitest`
  anyway, but catching failures before committing keeps history clean.
- `orderBoothIdSchema` = `z.string().uuid()`, `orderNumberSchema` =
  `z.string().min(1).max(40)`, `orderTokenSchema` = `z.string().uuid()`
  (all in `src/lib/schemas.ts:306-311`) — reuse these, don't redefine.

---

## Task 1: SQL — defer order numbering, new columns, new function

**Files:**

- Create: `supabase/migrations/0087_payment_first_and_pickup.sql`
- Modify: `supabase/tests/rls.test.sql` (append new tests)
- Test: run via `supabase test db` (pgTAP) against local Supabase

**Interfaces:**

- Produces: `orders.order_number` nullable; `orders.payment_proof_path text
null`; `orders.payment_proof_hash text null`; `vendors.board_settings`
  gains `pickup_scan_enabled` (app-layer default, no DB default needed —
  Zod supplies `false` for a missing key, matching how
  `customer_telegram_notify_enabled` was introduced); new storage bucket
  `payment-proofs` (private); new function
  `qkit.assign_order_number(p_order_id uuid) returns text`; `place_order`
  (`CREATE OR REPLACE`) changed to skip numbering and force `status =
'pending'` for a payment-required order.
- Consumes: nothing (first task).

- [ ] **Step 1: Write the migration file**

```sql
-- Payment-first checkout + self-checkout pickup kiosk.
-- See docs/superpowers/specs/2026-09-13-payment-first-checkout-and-self-checkout-pickup-design.md

ALTER TABLE qkit.orders ALTER COLUMN order_number DROP NOT NULL;
ALTER TABLE qkit.orders ADD COLUMN payment_proof_path TEXT;
ALTER TABLE qkit.orders ADD COLUMN payment_proof_hash TEXT;

-- Duplicate-photo lookup is always scoped to one vendor (via booths), so
-- index the hash alone — the join to booths.vendor_id at query time is
-- cheap against a small per-vendor order count, no composite index needed.
CREATE INDEX orders_payment_proof_hash_idx
  ON qkit.orders (payment_proof_hash)
  WHERE payment_proof_hash IS NOT NULL;

-- Private bucket: proof-of-payment screenshots are sensitive (partial bank
-- details), unlike booth-images. No anon/public policy at all; a vendor
-- reads their own via a scoped SELECT policy below, matching
-- booth-images' own per-vendor-folder pattern (migration 0002).
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: {vendorId}/{orderId}.{ext} — same folder-scoping
-- pattern booth_images_vendor_* policies already use.
CREATE POLICY "payment_proofs_vendor_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
-- No INSERT/UPDATE/DELETE policy for authenticated/anon — every write goes
-- through claimPayment's service-role client, which bypasses RLS.

-- Atomic order-number assignment at claim time, mirroring place_order's
-- own increment + zero-pad pattern EXACTLY (not qkit.next_order_number,
-- migration 0008 -- that function is unused dead code with a truncation
-- bug: its lpad(v_seq::text, 4, '0') silently drops the leading digit once
-- a booth passes 9999 orders, since Postgres's lpad truncates a too-long
-- input from the left). Idempotent: a retried call for an already-numbered
-- order just returns the existing number instead of incrementing again.
CREATE OR REPLACE FUNCTION qkit.assign_order_number(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit, public
AS $$
DECLARE
  v_booth_id UUID;
  v_existing TEXT;
  v_seq INT;
  v_number TEXT;
BEGIN
  SELECT booth_id, order_number INTO v_booth_id, v_existing
  FROM qkit.orders WHERE id = p_order_id;

  IF v_booth_id IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  UPDATE qkit.booths SET order_seq = order_seq + 1
  WHERE id = v_booth_id RETURNING order_seq INTO v_seq;
  v_number := lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');

  UPDATE qkit.orders SET order_number = v_number
  WHERE id = p_order_id AND order_number IS NULL;

  RETURN v_number;
END;
$$;

GRANT EXECUTE ON FUNCTION qkit.assign_order_number(UUID) TO service_role;
```

- [ ] **Step 2: Modify `place_order` to gate numbering/status on payment**

Read the full current function body first (`supabase/migrations/0086_place_order_requires_accept_without_printer.sql`)
so the `CREATE OR REPLACE` below is a complete, correct copy with only the
described deltas — do not guess at surrounding lines, copy them verbatim
from that file. Apply exactly two changes inside the existing function
body:

1. Change:
   ```sql
   UPDATE qkit.booths SET order_seq = order_seq + 1
   WHERE id = b.id RETURNING order_seq INTO v_seq;
   v_number := lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');
   ```
   to:
   ```sql
   IF v_expects_payment THEN
     v_number := NULL;
   ELSE
     UPDATE qkit.booths SET order_seq = order_seq + 1
     WHERE id = b.id RETURNING order_seq INTO v_seq;
     v_number := lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');
   END IF;
   ```
2. Change the INSERT's `status` value from
   `(CASE WHEN v_needs_accept THEN 'pending' ELSE 'preparing' END)::qkit.order_status`
   to
   `(CASE WHEN v_expects_payment OR v_needs_accept THEN 'pending' ELSE 'preparing' END)::qkit.order_status`
   — a payment-required order never auto-starts, regardless of the
   booth's own accept-gate setting.

Append this full corrected function (same `CREATE OR REPLACE FUNCTION
qkit.place_order(...)` signature, same body as 0086 with only the two
deltas above) to the new migration file.

- [ ] **Step 3: Add pgTAP tests to `supabase/tests/rls.test.sql`**

```sql
-- payment-required order: no number, forced pending, even with auto-start booth
SELECT is(
  (SELECT order_number FROM qkit.orders WHERE id = :payment_required_order_id),
  NULL,
  'payment-required order has no order_number at creation'
);
SELECT is(
  (SELECT status::text FROM qkit.orders WHERE id = :payment_required_order_id),
  'pending',
  'payment-required order forced to pending even when booth auto-starts'
);

-- assign_order_number: assigns once, idempotent on retry
SELECT is(
  qkit.assign_order_number(:payment_required_order_id),
  qkit.assign_order_number(:payment_required_order_id),
  'assign_order_number is idempotent for the same order'
);

-- storage: no anon/public read on payment-proofs
SELECT throws_ok(
  $$ SELECT * FROM storage.objects WHERE bucket_id = 'payment-proofs' $$,
  NULL,
  NULL,
  'anon cannot read payment-proofs bucket objects'
);
```

Adapt the exact fixture setup (how `:payment_required_order_id` gets
seeded) to match this test file's existing convention — read its current
top-of-file setup block first and follow the same pattern (it already
seeds booths/vendors for other tests in this file).

- [ ] **Step 4: Apply locally and run pgTAP**

Run: `supabase db reset` (applies all migrations fresh to local Supabase),
then `supabase test db`
Expected: all tests pass, including the three new ones above.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0087_payment_first_and_pickup.sql supabase/tests/rls.test.sql
git commit -m "feat(order): defer order numbering until payment claim

Payment-required orders no longer get an order_number or auto-start into
preparing at creation -- both wait until the customer actually claims
payment. New qkit.assign_order_number() assigns atomically at that point,
copying place_order's own corrected zero-pad pattern (not the existing
buggy, unused qkit.next_order_number)."
```

---

## Task 2: App-layer type/schema ripple

**Files:**

- Modify: `src/lib/types.ts` (orders `Row`/`Insert`/`Update`,
  `payment_proof_path`/`payment_proof_hash` fields)
- Modify: `src/lib/realtime-orders.ts` (`orderRowSchema`)
- Modify: `src/lib/realtime-orders.test.ts`
- Modify: `src/lib/schemas.ts` (`boardSettingsSchema`)
- Modify: `src/lib/schemas.test.ts`

**Interfaces:**

- Consumes: Task 1's new columns.
- Produces: `orderRowSchema` now parses `order_number: string | null`;
  `BoardSettingsInput` includes `pickup_scan_enabled: boolean`.

- [ ] **Step 1: Write the failing test for the realtime schema**

In `src/lib/realtime-orders.test.ts`, add:

```ts
it("accepts a null order_number (payment-required order before claim)", () => {
  const row = { ...validOrderRow, order_number: null };
  const event = parseRealtimeOrderEvent({
    eventType: "INSERT",
    new: row,
    old: {},
  });
  expect(event).not.toBeNull();
  expect(event?.order.order_number).toBeNull();
});
```

Use this file's existing `validOrderRow`/payload-builder fixture rather
than inlining a new one — read the file first to match its exact shape.

- [ ] **Step 2: Run it, confirm it fails**

Run: `pnpm vitest run src/lib/realtime-orders.test.ts`
Expected: FAIL — `orderRowSchema` rejects `order_number: null`.

- [ ] **Step 3: Make the schema/type changes**

In `src/lib/realtime-orders.ts`, change:

```ts
order_number: z.string(),
```

to:

```ts
order_number: z.string().nullable(),
```

In `src/lib/types.ts`, change every `order_number: string` occurrence in
the `orders` table's `Row`/`Insert`/`Update` shapes to `order_number:
string | null` (Insert/Update stay optional-or-null as appropriate to
their existing pattern — read the surrounding fields to match style).

- [ ] **Step 4: Run it, confirm it passes**

Run: `pnpm vitest run src/lib/realtime-orders.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `pickup_scan_enabled` to `boardSettingsSchema`**

In `src/lib/schemas.ts`, inside `boardSettingsSchema`'s object, add:

```ts
pickup_scan_enabled: z.boolean().default(false),
```

right after `customer_telegram_notify_enabled` (same file, same object).

In `src/lib/schemas.test.ts`, find the existing test asserting
`customer_telegram_notify_enabled` defaults for a missing key, and add an
analogous one:

```ts
it("defaults pickup_scan_enabled to false when missing", () => {
  const result = boardSettingsSchema.safeParse({ ...validSettingsMinusPickup });
  expect(result.success && result.data.pickup_scan_enabled).toBe(false);
});
```

Build `validSettingsMinusPickup` from this file's existing valid-settings
fixture, omitting the new key — match the existing fixture variable name
if one already exists for the telegram-flag test.

- [ ] **Step 6: Run the full schema test file, confirm it passes**

Run: `pnpm vitest run src/lib/schemas.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck the whole repo (this change ripples widely)**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors. If any appear (a call site assuming
`order_number` is always a string), read that specific call site and fix
it narrowly — do not silence with `as string` or `!`. Two known safe
call sites needing zero change (confirmed in the design sweep):
`displayOrderNumber`/`sortActiveOrders` in `src/lib/orders.ts` (never
called with a null order_number in practice, since the routes that reach
them require a real one) and `order-card.tsx:217`'s `number` variable
(only ever interpolated into a template string).

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/realtime-orders.ts src/lib/realtime-orders.test.ts src/lib/schemas.ts src/lib/schemas.test.ts
git commit -m "feat(order): allow null order_number in types/schemas

orderRowSchema gated parseRealtimeOrderEvent -- left non-nullable, every
payment-required order's realtime INSERT would silently fail validation
and never reach the vendor board. Also adds board_settings.pickup_scan_enabled."
```

---

## Task 3: `claimPayment` — photo upload, hash, deferred numbering, claim-time notify

**Files:**

- Modify: `src/app/order/[boothId]/[orderNumber]/payment-actions.ts`
  (renamed usage: this file now serves the pre-claim, token-only flow too
  — keep the file, add new functions)
- Modify: `src/app/order/[boothId]/[orderNumber]/payment-actions.test.ts`
- Modify: `src/lib/schemas.ts` (new `parsePreClaimRef` helper)
- Modify: `src/lib/schemas.test.ts`

**Interfaces:**

- Consumes: Task 1's `qkit.assign_order_number`, `payment-proofs` bucket;
  Task 2's nullable types.
- Produces: `loadPreClaimContext(boothId, token): Promise<{ orderId:
string; amountCents: number; checkout: CheckoutView | null } | null>`;
  `claimPayment(boothId, token, photo: File): Promise<ActionResult<{
orderNumber: string }>>` (signature change — drops the `orderNumber`
  param, since one never exists pre-claim; returns the newly-assigned
  number for the caller to redirect with). `unclaimPayment`/
  `getPaymentStatus` keep their existing `(boothId, orderNumber, token)`
  signatures unchanged — they only ever run post-claim, when a number
  already exists.

- [ ] **Step 1: Add `parsePreClaimRef` to `src/lib/schemas.ts`**

Right after `parseOrderRef`, add:

```ts
export type ParsePreClaimRefResult =
  | { ok: true; ref: { boothId: string; token: string } }
  | { ok: false; field: "booth" | "token" };

export function parsePreClaimRef(
  boothId: string,
  token: string,
): ParsePreClaimRefResult {
  if (!orderBoothIdSchema.safeParse(boothId).success)
    return { ok: false, field: "booth" };
  if (!orderTokenSchema.safeParse(token).success)
    return { ok: false, field: "token" };
  return { ok: true, ref: { boothId, token } };
}
```

In `src/lib/schemas.test.ts`, add tests mirroring the existing
`parseOrderRef` test block exactly, minus the order-number case:

```ts
describe("parsePreClaimRef", () => {
  it("accepts a valid booth id and token", () => {
    const result = parsePreClaimRef(validBoothId, validToken);
    expect(result.ok).toBe(true);
  });
  it("rejects an invalid booth id", () => {
    const result = parsePreClaimRef("not-a-uuid", validToken);
    expect(result).toEqual({ ok: false, field: "booth" });
  });
  it("rejects an invalid token", () => {
    const result = parsePreClaimRef(validBoothId, "not-a-uuid");
    expect(result).toEqual({ ok: false, field: "token" });
  });
});
```

Use this file's existing `validBoothId`/`validToken` fixtures from the
`parseOrderRef` tests above — do not redefine them.

Run: `pnpm vitest run src/lib/schemas.test.ts` — expect PASS.

- [ ] **Step 2: Write the failing test for `loadPreClaimContext`**

In `payment-actions.test.ts`, following this file's existing mock-chain
convention (read the top of the file for the `chain()` helper and
`vi.mock("@/lib/supabase/server", ...)` setup before writing this), add:

```ts
describe("loadPreClaimContext", () => {
  it("returns order id, amount, and checkout for a valid pending order", async () => {
    mockOrdersSelect.mockReturnValueOnce(
      chain({
        data: {
          id: "order-1",
          total_cents: 550,
          payment_status: "pending",
          order_number: null,
        },
        error: null,
      }),
    );
    mockBoothsSelect.mockReturnValueOnce(
      chain({ data: { vendor_id: "vendor-1" }, error: null }),
    );
    createCheckoutMock.mockResolvedValueOnce({
      ok: true,
      data: { type: "qr", transactionId: "tx-1", payload: "paynow-payload" },
    });

    const result = await loadPreClaimContext(
      "booth-1",
      "11111111-1111-1111-1111-111111111111",
    );

    expect(result).toEqual({
      orderId: "order-1",
      amountCents: 550,
      checkout: {
        type: "qr",
        transactionId: "tx-1",
        payload: "paynow-payload",
      },
    });
  });

  it("returns null for an invalid booth or token", async () => {
    expect(
      await loadPreClaimContext(
        "not-a-uuid",
        "11111111-1111-1111-1111-111111111111",
      ),
    ).toBeNull();
  });
});
```

Adjust the exact mock variable names (`mockOrdersSelect` etc.) to match
whatever this test file's existing mocks are actually named — read the
file first.

- [ ] **Step 3: Run it, confirm it fails**

Run: `pnpm vitest run src/app/order/\[boothId\]/\[orderNumber\]/payment-actions.test.ts`
Expected: FAIL — `loadPreClaimContext` is not exported.

- [ ] **Step 4: Implement `loadPreClaimContext`**

In `payment-actions.ts`, add:

```ts
export async function loadPreClaimContext(
  boothId: string,
  token: string,
): Promise<{
  orderId: string;
  amountCents: number;
  checkout: CheckoutView | null;
} | null> {
  const parsed = parsePreClaimRef(boothId, token);
  if (!parsed.ok) return null;

  const supabase = await createServiceClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, total_cents, payment_status")
    .eq("booth_id", boothId)
    .eq("access_token", token)
    .maybeSingle();
  if (!order || order.payment_status !== "pending") return null;

  const { data: booth } = await supabase
    .from("booths")
    .select("vendor_id")
    .eq("id", boothId)
    .maybeSingle();
  if (!booth?.vendor_id) return null;

  const checkout = await createCheckout({
    vendorId: booth.vendor_id,
    amountCents: order.total_cents,
    orderRef: order.id,
  });

  return {
    orderId: order.id,
    amountCents: order.total_cents,
    checkout: checkout.ok ? checkout.data : null,
  };
}
```

Add `import { parsePreClaimRef } from "@/lib/schemas";` to this file's
imports (alongside the existing `parseOrderRef` import).

- [ ] **Step 5: Run it, confirm it passes**

Run: same command as Step 3.
Expected: PASS.

- [ ] **Step 6: Write the failing test for the rewritten `claimPayment`**

Add to `payment-actions.test.ts`:

```ts
describe("claimPayment (photo required, deferred numbering)", () => {
  it("rejects a claim with no photo", async () => {
    const result = await claimPayment(
      "booth-1",
      "11111111-1111-1111-1111-111111111111",
      null,
    );
    expect(result).toEqual({
      success: false,
      error: "A payment screenshot is required.",
    });
  });

  it("uploads the photo, claims via paykit, assigns a number, and updates the mirror", async () => {
    // ... arrange the same mock chain as loadPreClaimContext's happy path,
    // plus a storage.upload mock, an rpc("assign_order_number") mock
    // returning "0007", and claimCheckout resolving ok.
    const result = await claimPayment("booth-1", token, fakeFile);
    expect(result).toEqual({ success: true, orderNumber: "0007" });
  });

  it("never assigns a number or touches payment_status if the upload fails", async () => {
    mockStorageUpload.mockResolvedValueOnce({
      data: null,
      error: new Error("boom"),
    });
    const result = await claimPayment("booth-1", token, fakeFile);
    expect(result.success).toBe(false);
    expect(mockRpc).not.toHaveBeenCalledWith(
      "assign_order_number",
      expect.anything(),
    );
  });
});
```

Write out the full mock arrangement for the second test using this file's
established chain-mock pattern — every `.from()`/`.storage.from()`/`.rpc()`
call the new implementation makes (Step 8 below) needs a matching mock
branch, in the same style already used for `claimPayment`'s current
`createCheckout`/`claimCheckout` mocks.

- [ ] **Step 7: Run it, confirm it fails**

Run: same command as Step 3.
Expected: FAIL (signature mismatch / missing photo-required behavior).

- [ ] **Step 8: Rewrite `claimPayment`**

Replace the existing `claimPayment` function with:

```ts
export async function claimPayment(
  boothId: string,
  token: string,
  photo: File | null,
): Promise<ActionResult<{ orderNumber: string }>> {
  if (!photo) {
    return { success: false, error: "A payment screenshot is required." };
  }

  const parsed = parsePreClaimRef(boothId, token);
  if (!parsed.ok)
    return {
      success: false,
      error: parsed.field === "booth" ? "Invalid booth" : "Invalid order",
    };

  const supabase = await createServiceClient();

  const ip = clientIp(await headers());
  const allowed = await rateLimit(supabase, `claim:${boothId}:${ip}`, 10, 60);
  if (!allowed)
    return { success: false, error: "Too many attempts -- wait a moment." };

  const { data: order } = await supabase
    .from("orders")
    .select("id, total_cents, payment_status, status, customer_name")
    .eq("booth_id", boothId)
    .eq("access_token", token)
    .maybeSingle();
  if (!order) return { success: false, error: "Invalid order" };
  if (order.status === "cancelled")
    return { success: false, error: "This order was cancelled." };
  if (order.payment_status !== "pending")
    return { success: false, error: "This order isn't awaiting payment." };

  const { data: booth } = await supabase
    .from("booths")
    .select("vendor_id, print_enabled")
    .eq("id", boothId)
    .maybeSingle();
  if (!booth?.vendor_id) return { success: false, error: "Invalid order" };

  const resized = await resizeImage(photo);
  const buffer = await resized.arrayBuffer();
  const hash = await hashBuffer(buffer);
  const ext = resized.type === "image/png" ? "png" : "jpg";
  const path = `${booth.vendor_id}/${order.id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("payment-proofs")
    .upload(path, buffer, { upsert: true, contentType: resized.type });
  if (uploadError) {
    console.error("claimPayment: proof upload failed", uploadError.message);
    return { success: false, error: "Could not upload photo. Try again." };
  }

  const checkout = await createCheckout({
    vendorId: booth.vendor_id,
    amountCents: order.total_cents,
    orderRef: order.id,
  });
  if (!checkout.ok) {
    console.error("claimPayment: paykit checkout failed", checkout.error);
    return { success: false, error: "Could not record payment. Try again." };
  }
  const claim = await claimCheckout(checkout.data.transactionId);
  if (!claim.ok) {
    console.error("claimPayment: paykit claim failed", claim.error);
    return { success: false, error: "Could not record payment. Try again." };
  }

  const { data: orderNumber, error: assignError } = await supabase.rpc(
    "assign_order_number",
    { p_order_id: order.id },
  );
  if (assignError || !orderNumber) {
    console.error(
      "claimPayment: assign_order_number failed",
      assignError?.message,
    );
    return { success: false, error: "Could not finalize order. Try again." };
  }

  await Promise.all([
    notifyVendorTelegram(boothId, orderNumber),
    notifyPrintkit(boothId, orderNumber, order.customer_name),
  ]);

  const { error: mirrorError } = await supabase
    .from("orders")
    .update({
      payment_status: "claimed",
      payment_proof_path: path,
      payment_proof_hash: hash,
    })
    .eq("id", order.id)
    .eq("payment_status", "pending");
  if (mirrorError)
    console.error(
      "claimPayment: local mirror update failed",
      mirrorError.message,
    );

  return { success: true, orderNumber };
}
```

Add these imports: `resizeImage` from `@/lib/image-resize` (read that
file's actual exported name first and match it exactly), a small new
`hashBuffer` helper (Step 9 below), and `notifyVendorTelegram`/
`notifyPrintkit` — these currently live in `src/app/o/[code]/actions.ts`
as unexported (module-private) functions. **Export both from that file**
(add `export` to their existing `function` declarations) so
`payment-actions.ts` can import them, rather than duplicating their logic.

- [ ] **Step 9: Add the `hashBuffer` helper**

Create `src/lib/hash.ts`:

```ts
export async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

Create `src/lib/hash.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashBuffer } from "./hash";

describe("hashBuffer", () => {
  it("produces a stable 64-character hex digest for the same input", async () => {
    const buf = new TextEncoder().encode("hello").buffer;
    const a = await hashBuffer(buf);
    const b = await hashBuffer(buf);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different digests for different input", async () => {
    const a = await hashBuffer(new TextEncoder().encode("hello").buffer);
    const b = await hashBuffer(new TextEncoder().encode("world").buffer);
    expect(a).not.toBe(b);
  });
});
```

Run: `pnpm vitest run src/lib/hash.test.ts` — expect PASS (Node's
`crypto.subtle` is available in the Vitest environment already used
elsewhere in this repo for `access_token` generation; confirm by checking
how an existing file already uses `crypto` — if it imports from `node:crypto`
instead of the global, match that same import style here).

- [ ] **Step 10: Run the full `claimPayment` test suite, confirm it passes**

Run: same command as Step 3.
Expected: PASS. Fix any mock-shape mismatches against the real
implementation above (exact `.select()` column lists must match).

- [ ] **Step 11: Full verification**

Run: `pnpm check && pnpm vitest run && pnpm build`
Expected: all green. `pnpm build` matters here specifically — this task
touches a server action with new imports across files, worth catching a
bundling issue now rather than later.

- [ ] **Step 12: Commit**

```bash
git add src/app/order/\[boothId\]/\[orderNumber\]/payment-actions.ts src/app/order/\[boothId\]/\[orderNumber\]/payment-actions.test.ts src/lib/schemas.ts src/lib/schemas.test.ts src/lib/hash.ts src/lib/hash.test.ts src/app/o/\[code\]/actions.ts
git commit -m "feat(order): require photo proof, defer numbering, notify at claim

claimPayment now takes (boothId, token) instead of (boothId, orderNumber,
token) since a payment-required order has no number until this succeeds.
Upload happens before the paykit claim call, which happens before number
assignment, which happens before the local payment_status mirror write --
a failed step at any point never leaves a half-claimed order."
```

---

## Task 4: `o/[code]/actions.ts` — conditional notify, nullable return

**Files:**

- Modify: `src/app/o/[code]/actions.ts`
- Modify: `src/app/o/[code]/actions.place-order.test.ts`

**Interfaces:**

- Consumes: Task 1's nullable `order_number` from the RPC; Task 3's now-exported `notifyVendorTelegram`/`notifyPrintkit`.
- Produces: `placeOrder`'s success result becomes `{ success: true;
orderNumber: string | null; boothId: string; accessToken: string }`.

- [ ] **Step 1: Write the failing test**

In `actions.place-order.test.ts`, find the existing test asserting
`notifyVendorTelegram`/`notifyPrintkit` are called on a successful place,
and add a sibling:

```ts
it("does not notify the vendor or print a ticket when the order has no number yet (payment required)", async () => {
  mockRpc.mockResolvedValueOnce({
    data: { order_number: null, booth_id: "booth-1", access_token: "tok-1" },
    error: null,
  });

  const result = await placeOrder("SHORTCODE", validInput, "idem-1");

  expect(result).toEqual({
    success: true,
    orderNumber: null,
    boothId: "booth-1",
    accessToken: "tok-1",
  });
  expect(notifyVendorTelegramMock).not.toHaveBeenCalled();
  expect(notifyPrintkitMock).not.toHaveBeenCalled();
});
```

Match this file's actual existing mock variable names for
`notifyVendorTelegram`/`notifyPrintkit` (they may already be mocked via
`vi.mock` at the top of the file, or may need a new mock added here since
Task 3 exported them from module-private to exported).

- [ ] **Step 2: Run it, confirm it fails**

Run: `pnpm vitest run src/app/o/\[code\]/actions.place-order.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update the schema and call site**

In `actions.ts`, change:

```ts
const out = z
  .object({
    order_number: z.string(),
    booth_id: z.string(),
    access_token: z.string(),
  })
  .safeParse(data);
```

to:

```ts
const out = z
  .object({
    order_number: z.string().nullable(),
    booth_id: z.string(),
    access_token: z.string(),
  })
  .safeParse(data);
```

Change:

```ts
await Promise.all([
  notifyVendorTelegram(out.data.booth_id, out.data.order_number),
  notifyPrintkit(
    out.data.booth_id,
    out.data.order_number,
    parsed.data.customerName,
  ),
]);
```

to:

```ts
if (out.data.order_number) {
  await Promise.all([
    notifyVendorTelegram(out.data.booth_id, out.data.order_number),
    notifyPrintkit(
      out.data.booth_id,
      out.data.order_number,
      parsed.data.customerName,
    ),
  ]);
}
```

The function's own return type/statement already returns
`out.data.order_number` as `orderNumber` — no further change needed there
since it now flows through as `string | null` automatically.

- [ ] **Step 4: Run it, confirm it passes**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Verify existing tests still pass**

Run: `pnpm vitest run src/app/o/\[code\]/`
Expected: PASS — the existing "notifies vendor" test should still pass
unchanged since it presumably arranges a non-null `order_number`.

- [ ] **Step 6: Commit**

```bash
git add src/app/o/\[code\]/actions.ts src/app/o/\[code\]/actions.place-order.test.ts
git commit -m "fix(order): skip vendor notify/print for a not-yet-numbered order

A payment-required order returns order_number: null from place_order now
(Task 1) -- notifyVendorTelegram/notifyPrintkit only fire when a real
number exists, matching claimPayment now firing them itself once claimed."
```

---

## Task 5: `order-form.tsx` — redirect branch, deferred recent-order entry

**Files:**

- Modify: `src/components/order/order-form.tsx`
- Modify: `src/components/order/order-form.dom.test.tsx`

**Interfaces:**

- Consumes: Task 4's nullable `orderNumber` on `placeOrder`'s result.
- Produces: no new exports; internal redirect logic only.

- [ ] **Step 1: Write the failing test**

In `order-form.dom.test.tsx`, find the existing "redirects to the order
status page on success" test and add a sibling:

```ts
it("redirects to the payment page, without saving a recent order, when order_number is null", async () => {
  placeOrderMock.mockResolvedValueOnce({
    success: true,
    orderNumber: null,
    boothId: "booth-1",
    accessToken: "tok-1",
  });

  // ... fill and submit the form the same way the existing success test does

  expect(mockRouterPush).toHaveBeenCalledWith("/order/booth-1/pay?t=tok-1");
  expect(addRecentOrderMock).not.toHaveBeenCalled();
});
```

Match this file's existing form-fill/submit helper and mock setup exactly
(read the existing success test above it in the same file).

- [ ] **Step 2: Run it, confirm it fails**

Run: `pnpm vitest run src/components/order/order-form.dom.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update the redirect logic**

Replace:

```ts
clearCart(boothId);

addRecentOrder({
  boothId,
  orderNumber: result.orderNumber,
  customerName: formData.customerName,
  token: result.accessToken,
  items: cartItems.map((it) => ({
    menuItemId: it.menuItemId,
    quantity: it.quantity,
    options: it.options,
  })),
});

router.push(
  `/order/${result.boothId}/${result.orderNumber}?t=${result.accessToken}`,
);
```

with:

```ts
clearCart(boothId);

if (result.orderNumber) {
  addRecentOrder({
    boothId,
    orderNumber: result.orderNumber,
    customerName: formData.customerName,
    token: result.accessToken,
    items: cartItems.map((it) => ({
      menuItemId: it.menuItemId,
      quantity: it.quantity,
      options: it.options,
    })),
  });
  router.push(
    `/order/${result.boothId}/${result.orderNumber}?t=${result.accessToken}`,
  );
} else {
  router.push(`/order/${result.boothId}/pay?t=${result.accessToken}`);
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/order/order-form.tsx src/components/order/order-form.dom.test.tsx
git commit -m "feat(order): route to the payment page when no order number yet

A payment-required order has no order_number until claimed (Task 1) --
addRecentOrder is deferred to the /pay success handler (Task 6) instead
of firing here with a number that doesn't exist yet."
```

---

## Task 6: `/pay` page

**Files:**

- Create: `src/app/order/[boothId]/pay/page.tsx`
- Create: `src/app/order/[boothId]/pay/pay-form.tsx` (client component)
- Create: `src/app/order/[boothId]/pay/page.dom.test.tsx`
- Create: `src/app/order/[boothId]/pay/pay-form.dom.test.tsx`
- Create: `src/app/order/[boothId]/pay/README.md`
- Modify: `src/app/order/[boothId]/[orderNumber]/pay-panel.tsx` (fix the
  null-checkout dead-end state — this is the "real gap in today's
  PayPanel" the spec calls out, and this task is the natural place to fix
  it since `pay-form.tsx` will share the same rendering concern)

**Interfaces:**

- Consumes: Task 3's `loadPreClaimContext`/`claimPayment`.
- Produces: nothing further downstream depends on this page's internals.

- [ ] **Step 1: Write the failing test for `page.tsx`**

Create `page.dom.test.tsx` following the exact pattern of
`src/app/order/[boothId]/[orderNumber]/page.dom.test.tsx` (read it first):
mock `loadPreClaimContext`, mock `notFound`, cover:

```ts
it("calls notFound for an invalid booth id", async () => {
  /* ... */
});
it("calls notFound when loadPreClaimContext returns null (bad token / already claimed / wrong status)", async () => {
  /* ... */
});
it("renders PayForm with the order id, amount, and checkout when valid", async () => {
  /* ... */
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `pnpm vitest run src/app/order/\[boothId\]/pay/page.dom.test.tsx`
Expected: FAIL (file doesn't exist).

- [ ] **Step 3: Implement `page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { orderBoothIdSchema, orderTokenSchema } from "@/lib/schemas";
import { loadPreClaimContext } from "../[orderNumber]/payment-actions";
import { PayForm } from "./pay-form";

interface Props {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{ t?: string }>;
}

export const revalidate = 0;

export default async function PayPage({ params, searchParams }: Props) {
  const { boothId } = await params;
  const { t: token } = await searchParams;

  if (
    !orderBoothIdSchema.safeParse(boothId).success ||
    !token ||
    !orderTokenSchema.safeParse(token).success
  )
    notFound();

  const context = await loadPreClaimContext(boothId, token);
  if (!context) notFound();

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col px-5 py-10">
      <PayForm
        boothId={boothId}
        token={token}
        amountCents={context.amountCents}
        checkout={context.checkout}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Write the failing test for `pay-form.tsx`**

Create `pay-form.dom.test.tsx`, following `pay-panel.dom.test.tsx`'s
existing pattern (mock `claimPayment`, `useRouter`):

```ts
it("shows a load-failure state and no claim button when checkout is null", () => {
  render(<PayForm boothId="b1" token="t1" amountCents={550} checkout={null} />);
  expect(screen.getByText(/couldn't load payment/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /i've paid/i })).not.toBeInTheDocument();
});

it("requires a photo before submitting the claim", async () => {
  render(<PayForm boothId="b1" token="t1" amountCents={550} checkout={{ type: "qr", transactionId: "tx", payload: "p" }} />);
  await userEvent.click(screen.getByRole("button", { name: /i've paid/i }));
  expect(screen.getByText(/screenshot is required/i)).toBeInTheDocument();
  expect(claimPaymentMock).not.toHaveBeenCalled();
});

it("uploads the photo, calls claimPayment, and redirects to the numbered order page on success", async () => {
  claimPaymentMock.mockResolvedValueOnce({ success: true, orderNumber: "0007" });
  render(<PayForm boothId="b1" token="t1" amountCents={550} checkout={{ type: "qr", transactionId: "tx", payload: "p" }} />);
  const file = new File(["x"], "proof.png", { type: "image/png" });
  await userEvent.upload(screen.getByLabelText(/upload/i), file);
  await userEvent.click(screen.getByRole("button", { name: /i've paid/i }));
  expect(claimPaymentMock).toHaveBeenCalledWith("b1", "t1", file);
  expect(mockRouterPush).toHaveBeenCalledWith("/order/b1/0007?t=t1");
});
```

- [ ] **Step 6: Run it, confirm it fails**

Run: `pnpm vitest run src/app/order/\[boothId\]/pay/pay-form.dom.test.tsx`
Expected: FAIL.

- [ ] **Step 7: Implement `pay-form.tsx`**

Build this by copying `pay-panel.tsx`'s existing QR/image/link render
branches verbatim (same `checkout?.type` switch, same amount display, same
`react-qr-code`/`img`/link markup) rather than reinventing them, plus:

- A null-`checkout` branch rendering: "Couldn't load payment right now.
  Refresh the page, or ask the stall for help." with a `Button` that calls
  `router.refresh()`.
- A file input (`<input type="file" accept="image/*" capture="environment">`,
  labelled, downscaled via `image-resize.ts`'s exported resize function
  before being held in state).
- A submit handler: if no file selected, show inline error "A payment
  screenshot is required." without calling the action; otherwise call
  `claimPayment(boothId, token, file)`, and on `{ success: true,
orderNumber }` call `router.push(\`/order/${boothId}/${orderNumber}?t=${token}\`)`,
on failure show `res.error`via`toast.error`(matching this codebase's
existing`sonner` usage elsewhere in payment components).

- [ ] **Step 8: Run it, confirm it passes**

Run: same command as Step 6.
Expected: PASS.

- [ ] **Step 9: Fix `pay-panel.tsx`'s own null-checkout gap**

In `pay-panel.tsx`, the current render falls through to the QR/image/link
branches with nothing rendered when `checkout` is `null`, yet the
"I've paid" button still shows beneath it. Add, right after the
`payHeading` computation:

```tsx
if (!checkout) {
  return (
    <section className="space-y-3 px-6 py-5 text-center">
      <p className="text-sm text-muted-foreground">
        Couldn&apos;t load payment right now.
      </p>
      <Button variant="outline" onClick={() => window.location.reload()}>
        Refresh
      </Button>
    </section>
  );
}
```

placed before the `claimed ? (...) : (...)` block, so a null checkout
never reaches the "I've paid" button at all. Add a corresponding test to
`pay-panel.dom.test.tsx`:

```ts
it("shows a load-failure state instead of a claim button when checkout is null", () => {
  render(<PayPanel boothId="b1" orderNumber="0001" token="t1" checkout={null} initialStatus="pending" amountCents={550} />);
  expect(screen.getByText(/couldn't load payment/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /i've paid/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 10: Run all payment-page tests, confirm everything passes**

Run: `pnpm vitest run src/app/order/`
Expected: PASS.

- [ ] **Step 11: Write `README.md`**

Create `src/app/order/[boothId]/pay/README.md` describing: purpose (the
payment-first gate before an order number exists), `page.tsx`/`pay-form.tsx`
bullets matching the actual final implementation, and a note that
`unclaimPayment`/`getPaymentStatus` are NOT used here (they operate on an
already-numbered order, post-claim, on the order-status page instead).

- [ ] **Step 12: Full verification**

Run: `pnpm check && pnpm vitest run && pnpm build`
Expected: all green.

- [ ] **Step 13: Commit**

```bash
git add src/app/order/\[boothId\]/pay src/app/order/\[boothId\]/\[orderNumber\]/pay-panel.tsx src/app/order/\[boothId\]/\[orderNumber\]/pay-panel.dom.test.tsx
git commit -m "feat(order): add the payment-first /pay page

Shown before an order number exists, when the booth requires payment --
amount, checkout, and the now-required proof-photo upload. On a successful
claim, redirects to the newly-numbered order-status page. Also fixes a
real pre-existing gap in PayPanel: a null checkout used to leave the
'I've paid' button visible with nothing to actually pay through."
```

---

## Task 7: Order-status page — redirect guard, PayPanel simplification

**Files:**

- Modify: `src/app/order/[boothId]/[orderNumber]/page.tsx`
- Modify: `src/app/order/[boothId]/[orderNumber]/page.dom.test.tsx`
- Modify: `src/app/order/[boothId]/[orderNumber]/pay-panel.tsx`
- Modify: `src/app/order/[boothId]/[orderNumber]/pay-panel.dom.test.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: nothing new (internal behavior only).

- [ ] **Step 1: Write the failing test for the redirect guard**

In `page.dom.test.tsx`, add:

```ts
it("redirects to /pay when payment_status is still pending", async () => {
  mockOrder.payment_status = "pending";
  await expect(OrderStatusPage({ params, searchParams })).rejects.toThrow();
  expect(redirectMock).toHaveBeenCalledWith("/order/booth-1/pay?t=tok-1");
});
```

Mock `redirect` from `next/navigation` the same way this file already
mocks `notFound` (Next's `redirect()` also throws internally; match the
existing `notFound` mock's throw-to-abort-control-flow pattern).

- [ ] **Step 2: Run it, confirm it fails**

Run: `pnpm vitest run src/app/order/\[boothId\]/\[orderNumber\]/page.dom.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add the redirect guard**

In `page.tsx`, right after the existing `if (!order) notFound();` check,
add:

```tsx
if (order.payment_status === "pending") {
  redirect(`/order/${boothId}/pay?t=${token}`);
}
```

Add `import { redirect } from "next/navigation";` alongside the existing
`notFound` import.

- [ ] **Step 4: Run it, confirm it passes**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Simplify `PayPanel` to drop the QR-rendering branch**

Since `pending` is now unreachable on this page (redirected away before
`PayPanel` ever renders), remove the entire non-`claimed`/`confirmed`/
`not_required` render path (the `payHeading`/QR/image/link/claim-button
block) from `pay-panel.tsx`, keeping only:

- `status === "not_required"` → `return null` (unchanged).
- `status === "confirmed"` → the existing "Payment confirmed" block
  (unchanged).
- `status === "claimed"` → the existing "waiting for the stall to confirm"
  block, including its `unclaim`/"Tapped by mistake? Undo" affordance
  (unchanged) — this is the one interactive state still needed here.
- Any other status (shouldn't occur given the redirect guard, but return
  `null` defensively rather than throwing).

Remove the now-dead props this simplification makes unnecessary
(`checkout`, `amountCents` are no longer used once the QR/claim UI is
gone) from `PayPanel`'s own prop type and from its call site in
`page.tsx` — also remove `loadCheckoutView`/`createCheckout` usage from
`page.tsx` entirely, since the only remaining reason `page.tsx` called
paykit was to render that now-removed QR/image/link content.

- [ ] **Step 6: Update `pay-panel.dom.test.tsx`**

Remove tests for the now-deleted QR/image/link/claim-button states (the
ones this task's Step 5 deleted from the component); keep the
`claimed`/`confirmed`/`not_required`/undo tests, adjusting their render
calls to drop the removed props.

- [ ] **Step 7: Run the full order-status test suite, confirm everything passes**

Run: `pnpm vitest run src/app/order/\[boothId\]/\[orderNumber\]/`
Expected: PASS.

- [ ] **Step 8: Update `README.md`** for this folder to describe the
      redirect guard and PayPanel's now-narrower responsibility.

- [ ] **Step 9: Full verification**

Run: `pnpm check && pnpm vitest run && pnpm build`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add src/app/order/\[boothId\]/\[orderNumber\]/
git commit -m "refactor(order): redirect stale pending visits to /pay

The order-status page can no longer be reached with payment_status still
pending except via a stale bookmark from before this feature -- redirects
to /pay instead of rendering. PayPanel drops its now-unreachable
QR/claim-button branch entirely, keeping only the post-claim display
states."
```

---

## Task 8: Board visibility — render-level filter

**Files:**

- Modify: `src/app/dashboard/realtime-order-board.tsx`
- Modify: `src/app/dashboard/realtime-order-board.dom.test.tsx`

**Interfaces:**

- Consumes: Task 2's `orderRowSchema` already carrying `payment_status`/`source`.
- Produces: nothing further downstream depends on this.

- [ ] **Step 1: Write the failing test**

In `realtime-order-board.dom.test.tsx`, add:

```ts
it("hides a pending-payment QR order from the board", () => {
  const orders = [
    makeOrder({
      id: "1",
      status: "pending",
      payment_status: "pending",
      source: "qr",
    }),
    makeOrder({
      id: "2",
      status: "pending",
      payment_status: "not_required",
      source: "qr",
    }),
  ];
  renderBoard(orders);
  expect(screen.queryByText(orders[0].order_number!)).not.toBeInTheDocument();
  expect(screen.getByText(orders[1].order_number!)).toBeInTheDocument();
});

it("still shows a pending-payment walk-up order", () => {
  const orders = [
    makeOrder({
      id: "1",
      status: "pending",
      payment_status: "pending",
      source: "walkup",
    }),
  ];
  renderBoard(orders);
  expect(screen.getByText(orders[0].order_number!)).toBeInTheDocument();
});
```

Use this file's existing `makeOrder`/`renderBoard` helpers, extending
`makeOrder`'s param type if `source`/`payment_status` aren't already
overridable there (they should already exist as fields, just check
they're not hardcoded).

- [ ] **Step 2: Run it, confirm it fails**

Run: `pnpm vitest run src/app/dashboard/realtime-order-board.dom.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add the filter**

Find the existing filter predicate:

```ts
sortActiveOrders(
  orders.filter((o) => !isTerminal(o.status) || undoWindowIds.has(o.id)),
  sortOrder,
);
```

and change it to:

```ts
sortActiveOrders(
  orders.filter(
    (o) =>
      (!isTerminal(o.status) || undoWindowIds.has(o.id)) &&
      !(o.payment_status === "pending" && o.source === "qr"),
  ),
  sortOrder,
);
```

- [ ] **Step 4: Run it, confirm it passes**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Run the full board test suite, confirm nothing else broke**

Run: `pnpm vitest run src/app/dashboard/realtime-order-board.dom.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/realtime-order-board.tsx src/app/dashboard/realtime-order-board.dom.test.tsx
git commit -m "feat(dashboard): hide unpaid QR orders from the board

Render-level filter, not a query/RLS change -- a vendor is already
authorized to read their own orders regardless of payment status, this is
a workflow filter so they don't act on an order before it's paid. Walk-up
orders are unaffected: staff already handles that transaction
face-to-face at creation."
```

---

## Task 9: `getBoothQueueDisplay` / `getWaitEstimate` — same exclusion

**Files:**

- Modify: `src/app/order/[boothId]/display/actions.ts`
- Modify: `src/app/order/[boothId]/display/actions.test.ts`
- Modify: `src/app/order/[boothId]/[orderNumber]/status-actions.ts`
- Modify: `src/app/order/[boothId]/[orderNumber]/status-actions.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test for `getBoothQueueDisplay`**

In `display/actions.test.ts`, add a case to whatever mock-chain sequence
this file already uses for the orders-list query, asserting the built
query includes an exclusion for `payment_status`/`source` — since this
codebase's existing tests assert against mock call arguments (`.eq`/`.or`
call arguments) rather than real SQL, read the file's existing pattern for
asserting a query filter and write this in the same style:

```ts
it("excludes a pending-payment QR order from the result", async () => {
  // Arrange the orders-list mock to include one pending-payment qr row
  // and one not_required row, following this file's existing arrange
  // pattern for that query.
  const result = await getBoothQueueDisplay(boothId);
  expect(result?.map((o) => o.orderNumber)).not.toContain(
    "pending-qr-order-number",
  );
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `pnpm vitest run src/app/order/\[boothId\]/display/actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the filter to `getBoothQueueDisplay`**

Find the orders query (`display/actions.ts:99-100`,
`.select("order_number, status, created_at, priority_bumped_at")`) and
add, without changing the select list:

```ts
.not("status", "in", "(completed,cancelled)")
.or("payment_status.neq.pending,source.neq.qr")
```

(Read the exact existing query chain first — this may need to compose
with an already-present `.eq("booth_id", boothId)` etc.; add the `.or(...)`
exclusion as an additional chained call, not a replacement of anything
already there.)

- [ ] **Step 4: Run it, confirm it passes**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Repeat Steps 1-4 for `getWaitEstimate`'s `active` query**

Same exclusion (`.or("payment_status.neq.pending,source.neq.qr")`) added
to the query at `status-actions.ts:155-156`
(`.select("id, status, created_at, priority_bumped_at")`), with an
analogous test in `status-actions.test.ts`.

- [ ] **Step 6: Full verification**

Run: `pnpm check && pnpm vitest run && pnpm build`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/app/order/\[boothId\]/display/actions.ts src/app/order/\[boothId\]/display/actions.test.ts src/app/order/\[boothId\]/\[orderNumber\]/status-actions.ts src/app/order/\[boothId\]/\[orderNumber\]/status-actions.test.ts
git commit -m "fix(order): exclude unpaid QR orders from queue display and wait estimate

Both queries read all non-terminal orders with no payment filter --
without this, an unpaid order would show as 'Preparing' on the public TV
display while invisible on the vendor's own board, and would inflate
other customers' wait estimates. Filters without widening either query's
existing least-privilege select list."
```

---

## Task 10: Reconciled "Mark paid & start" review action

**Files:**

- Modify: `src/app/dashboard/order-actions.ts`
- Modify: `src/app/dashboard/order-actions.test.ts`
- Modify: `src/components/order-card.tsx`
- Modify: `src/components/order-card.dom.test.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: `confirmPaymentAndStart(orderId: string):
Promise<ActionResult<{ status: OrderStatus; prevPaymentStatus:
PaymentStatus }>>`; `revertPaymentAndStart(orderId: string,
prevPaymentStatus: PaymentStatus): Promise<ActionResult<{ status:
OrderStatus }>>`.

- [ ] **Step 1: Write the failing test for `confirmPaymentAndStart`**

In `order-actions.test.ts`, following the existing `advanceOrder` test's
exact mock-chain shape, add:

```ts
describe("confirmPaymentAndStart", () => {
  it("confirms payment and advances to preparing in one write", async () => {
    // Arrange loadOwnOrder's mock to return { status: "pending", payment_status: "claimed" }
    const result = await confirmPaymentAndStart("order-1");
    expect(result).toEqual({
      success: true,
      status: "preparing",
      prevPaymentStatus: "claimed",
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      status: "preparing",
      payment_status: "confirmed",
    });
  });

  it("refuses when payment is already confirmed", async () => {
    // Arrange loadOwnOrder's mock to return { status: "pending", payment_status: "confirmed" }
    const result = await confirmPaymentAndStart("order-1");
    expect(result).toEqual({
      success: false,
      error: "Order can't be advanced",
    });
  });

  it("refuses when status isn't pending", async () => {
    // Arrange loadOwnOrder's mock to return { status: "preparing", payment_status: "claimed" }
    const result = await confirmPaymentAndStart("order-1");
    expect(result).toEqual({
      success: false,
      error: "Order can't be advanced",
    });
  });
});

describe("revertPaymentAndStart", () => {
  it("reverts both status and payment_status together", async () => {
    const result = await revertPaymentAndStart("order-1", "claimed");
    expect(result).toEqual({ success: true, status: "pending" });
    expect(mockUpdate).toHaveBeenCalledWith({
      status: "pending",
      payment_status: "claimed",
    });
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `pnpm vitest run src/app/dashboard/order-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement both actions**

Add to `order-actions.ts`, near `advanceOrder`/`revertOrderAdvance` (reuse
this file's existing `loadOwnOrder` helper and `idSchema`):

```ts
export async function confirmPaymentAndStart(
  orderId: string,
): Promise<
  ActionResult<{ status: OrderStatus; prevPaymentStatus: PaymentStatus }>
> {
  if (!idSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, order, userId } = await loadOwnOrder(orderId);
  if (!supabase || !order) return { success: false, error: "Order not found" };

  if (
    order.status !== "pending" ||
    order.payment_status === "confirmed" ||
    order.payment_status === "not_required"
  )
    return { success: false, error: "Order can't be advanced" };

  const prevPaymentStatus = order.payment_status;

  const { data: rows, error } = await supabase
    .from("orders")
    .update({ status: "preparing", payment_status: "confirmed" })
    .eq("id", orderId)
    .eq("status", order.status)
    .select("id");
  if (error) {
    console.error("confirmPaymentAndStart failed", error.message);
    return { success: false, error: "Failed to update order" };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed -- please refresh." };

  if (userId) {
    await recordOrderStatusEvent({
      order_id: orderId,
      from_status: "pending",
      to_status: "preparing",
      actor: userId,
    });
    await recordAudit({
      admin_id: userId,
      action: "confirm_payment_and_start",
      target_id: orderId,
      detail: { prevPaymentStatus },
    });
  }

  return { success: true, status: "preparing", prevPaymentStatus };
}

export async function revertPaymentAndStart(
  orderId: string,
  prevPaymentStatus: PaymentStatus,
): Promise<ActionResult<{ status: OrderStatus }>> {
  if (!idSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, userId } = await loadOwnOrder(orderId);
  if (!supabase) return { success: false, error: "Order not found" };

  const { data: rows, error } = await supabase
    .from("orders")
    .update({ status: "pending", payment_status: prevPaymentStatus })
    .eq("id", orderId)
    .eq("status", "preparing")
    .select("id");
  if (error) {
    console.error("revertPaymentAndStart failed", error.message);
    return { success: false, error: "Failed to revert order" };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed -- please refresh." };

  if (userId) {
    await recordOrderStatusEvent({
      order_id: orderId,
      from_status: "preparing",
      to_status: "pending",
      actor: userId,
    });
  }

  return { success: true, status: "pending" };
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Write the failing test for `order-card.tsx`'s merged button**

In `order-card.dom.test.tsx`, add:

```ts
it("shows one merged button, not two, for a pending order awaiting payment confirm", () => {
  render(<OrderCard order={makeOrder({ status: "pending", payment_status: "claimed" })} />);
  expect(screen.getByRole("button", { name: /mark paid.*start/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /confirm payment received/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /start now/i })).not.toBeInTheDocument();
});

it("shows the merged button for an unpaid walk-up order too", () => {
  render(<OrderCard order={makeOrder({ status: "pending", payment_status: "pending", source: "walkup" })} />);
  expect(screen.getByRole("button", { name: /mark paid.*start/i })).toBeInTheDocument();
});

it("tapping the merged button calls confirmPaymentAndStart and shows an undo option", async () => {
  confirmPaymentAndStartMock.mockResolvedValueOnce({ success: true, status: "preparing", prevPaymentStatus: "claimed" });
  render(<OrderCard order={makeOrder({ id: "order-1", status: "pending", payment_status: "claimed" })} />);
  await userEvent.click(screen.getByRole("button", { name: /mark paid.*start/i }));
  expect(confirmPaymentAndStartMock).toHaveBeenCalledWith("order-1");
  expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
});
```

Match this file's existing `makeOrder` fixture and existing undo-window
test's exact assertions/mock setup for the third test — read the existing
"Start now" undo test in this file first and mirror its structure with
`confirmPaymentAndStart`/`revertPaymentAndStart` swapped in for
`advanceOrder`/`revertOrderAdvance`.

- [ ] **Step 6: Run it, confirm it fails**

Run: `pnpm vitest run src/components/order-card.dom.test.tsx`
Expected: FAIL.

- [ ] **Step 7: Implement the merged button in `order-card.tsx`**

Read the full existing render block from the "Payment prompts" comment
(around line 563) through the advance-button block (around line 592+)
before editing, so the merge sits correctly relative to both. Replace the
two independent conditionals:

```tsx
{!closed && payStatus === "claimed" && (
  <div className="px-4 pb-3">
    <Button ... onClick={confirmPayment} ...>
      <Banknote className="size-5" /> Confirm payment received
    </Button>
  </div>
)}
{!closed && payStatus === "pending" && (
  <div className="px-4 pb-3">
    <Button ... onClick={confirmPayment} ...>Mark as paid</Button>
  </div>
)}
```

with a single merged block, gated on the reconciled condition, that
**replaces** the payment-button block AND suppresses the plain advance
button below it for this one case:

```tsx
{
  !closed &&
    status === "pending" &&
    payStatus !== "confirmed" &&
    payStatus !== "not_required" && (
      <div className="px-4 pb-3">
        <Button
          className="h-12 w-full rounded-lg bg-status-payment-claimed text-base font-bold text-white hover:bg-status-payment-claimed/90"
          onClick={confirmPaymentAndStart}
          disabled={updating}
        >
          <Banknote className="size-5" /> Mark paid &amp; start
        </Button>
      </div>
    );
}
```

Then find the existing generic advance-button render (the block using
`ADVANCE[status]`/`advanceOrder`) and add a guard so it does **not** also
render for this same case — wrap its existing condition with `&& !(status
=== "pending" && payStatus !== "confirmed" && payStatus !== "not_required")`,
or equivalently hoist that boolean into a single named variable (e.g.
`needsPaymentReview`) computed once near the top of the component and
reference it in both places for clarity — prefer the named variable, it
reads better than a repeated inline condition.

Add a new handler function alongside the existing `confirmPayment`/
`advance` handlers in this file:

```ts
async function confirmPaymentAndStartHandler() {
  return run(async () => {
    const res = await confirmPaymentAndStart(order.id);
    if (res.success) {
      setStatus(res.status);
      setPayStatus("confirmed");
      setPendingUndo({ revertFrom: res.status, revertTo: "pending" });
      // store res.prevPaymentStatus alongside pendingUndo state, in
      // whatever shape this file's existing pendingUndo state already
      // uses for revertOrderAdvance's own prevPaymentStatus tracking --
      // read that existing shape first, don't invent a new one.
    } else {
      toast.error(res.error);
    }
  });
}
```

Match this file's exact existing `pendingUndo` state shape and its
existing undo-button click handler (which currently calls
`revertOrderAdvance`) — extend it to call `revertPaymentAndStart` instead
when the pending undo's origin was this merged action, using whatever
discriminator this file's existing state already has room for (e.g. an
`action: "advance" | "paymentAndStart"` tag alongside `revertFrom`/
`revertTo`/`prevPaymentStatus`, if one doesn't already exist add it
narrowly rather than restructuring the whole undo state).

- [ ] **Step 8: Run it, confirm it passes**

Run: same command as Step 6.
Expected: PASS.

- [ ] **Step 9: Run the FULL existing `order-card.dom.test.tsx` suite**

Run: same command as Step 6, without a test-name filter.
Expected: PASS — confirmed in the design sweep that every existing
payment-button test in this file uses `status: "preparing"` by default,
which this merge doesn't touch, so no existing test should need
modification, only additions.

- [ ] **Step 10: Full verification**

Run: `pnpm check && pnpm vitest run && pnpm build`
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add src/app/dashboard/order-actions.ts src/app/dashboard/order-actions.test.ts src/components/order-card.tsx src/components/order-card.dom.test.tsx
git commit -m "feat(dashboard): merge Confirm payment + Start now into one action

There's no real scenario where a vendor confirms payment without also
starting the order -- one tap now does both atomically. Undo gets its own
revertPaymentAndStart rather than reusing revertOrderAdvance, which only
restores payment_status when reverting from completed, not preparing."
```

---

## Task 11: Abandoned-payment sweep

**Files:**

- Modify: `src/app/dashboard/order-actions.ts`
- Modify: `src/app/dashboard/order-actions.test.ts`
- Modify: `src/app/dashboard/realtime-order-board.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: `sweepAbandonedPayments(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

In `order-actions.test.ts`, mirroring the existing `sweepReadyOrders`
test's exact mock shape:

```ts
describe("sweepAbandonedPayments", () => {
  it("cancels a pending-payment qr order older than 30 minutes", async () => {
    await sweepAbandonedPayments();
    expect(mockUpdate).toHaveBeenCalledWith({ status: "cancelled" });
    // and assert the query chain filtered on payment_status=pending,
    // source=qr, created_at < (now - 30min), following this file's
    // existing pattern for asserting sweepReadyOrders' own query filters.
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `pnpm vitest run src/app/dashboard/order-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `sweepAbandonedPayments`**

Read `sweepReadyOrders`'s full existing body first (`order-actions.ts:473-501`)
and copy its exact shape (authenticated client, RLS-scoped bulk update, no
explicit booth filter needed):

```ts
const ABANDONED_PAYMENT_MS = 30 * 60_000;

export async function sweepAbandonedPayments(): Promise<void> {
  const supabase = await createServerClient();
  const cutoff = new Date(Date.now() - ABANDONED_PAYMENT_MS).toISOString();

  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("payment_status", "pending")
    .eq("source", "qr")
    .eq("status", "pending")
    .lt("created_at", cutoff);
  if (error) console.error("sweepAbandonedPayments failed", error.message);
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Wire up polling in `realtime-order-board.tsx`**

Read the existing `sweepReadyOrders` poll call site
(`realtime-order-board.tsx:470-475`) and add a second, separate
`usePolling` call right after it (not merged into the same one, per the
spec's explicit reasoning: this sweep is unconditional, the existing one
is opt-in):

```ts
usePolling(sweepAbandonedPayments, { intervalMs: 30_000, enabled: true });
```

Add `sweepAbandonedPayments` to this file's existing import from
`./order-actions`.

- [ ] **Step 6: Full verification**

Run: `pnpm check && pnpm vitest run && pnpm build`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/order-actions.ts src/app/dashboard/order-actions.test.ts src/app/dashboard/realtime-order-board.tsx
git commit -m "feat(dashboard): auto-cancel unpaid QR orders after 30 minutes

Mirrors sweepReadyOrders' own polled-from-the-open-dashboard pattern (no
cron job exists in this repo), but runs unconditionally rather than
gated behind a vendor setting -- this is baseline hygiene, not an opt-in
preference. Since these orders never got a number, cancelling one wastes
nothing."
```

---

## Task 12: OCR hint + duplicate-photo check on the vendor's photo review

**Files:**

- Create: `public/tesseract/` (self-hosted core/worker/`eng.traineddata` —
  see Step 1)
- Create: `src/components/payment-proof-viewer.tsx`
- Create: `src/components/payment-proof-viewer.dom.test.tsx`
- Modify: `src/components/order-card.tsx` (wire the viewer into the
  proof-photo thumbnail)
- Create: `src/app/dashboard/proof-actions.ts` (signed-URL + duplicate-hash
  lookup, vendor-authenticated)
- Create: `src/app/dashboard/proof-actions.test.ts`

**Interfaces:**

- Consumes: Task 3's `payment_proof_path`/`payment_proof_hash` columns.
- Produces: `getProofPhotoUrl(orderId: string): Promise<string | null>`;
  `findDuplicateProofOrder(orderId: string): Promise<string | null>` (the
  other order's number, if the hash matches one).

- [ ] **Step 1: Add `tesseract.js` and self-host its assets**

Run: `pnpm add tesseract.js@<latest 5.x, pin exact>` (check
`node_modules/tesseract.js/package.json` after install for its exact
version and pin that literal version in `package.json`, matching this
repo's "pin exact versions" convention).

Copy the package's core/worker files into `public/tesseract/` so they're
served same-origin (find them under
`node_modules/tesseract.js-core/` and `node_modules/tesseract.js/dist/`
after install — the exact filenames depend on the installed version, list
the directory to find them rather than guessing). Download
`eng.traineddata.gz` from the version-pinned tessdata release the
installed `tesseract.js` version's own docs point to, and place it under
`public/tesseract/` too (do this once, commit the binary file — check its
size first with `ls -la`; if it's larger than a few MB, note that in the
commit message rather than being surprised by repo size growth).

- [ ] **Step 2: Write the failing test for `proof-actions.ts`**

```ts
describe("getProofPhotoUrl", () => {
  it("returns a signed URL for the caller's own order", async () => {
    // Arrange loadOwnOrder-equivalent mock returning payment_proof_path
    const url = await getProofPhotoUrl("order-1");
    expect(url).toBe("https://signed.example/payment-proofs/...");
  });
  it("returns null for an order with no uploaded proof", async () => {
    const url = await getProofPhotoUrl("order-2");
    expect(url).toBeNull();
  });
});

describe("findDuplicateProofOrder", () => {
  it("returns the other order's number when the hash matches", async () => {
    const other = await findDuplicateProofOrder("order-1");
    expect(other).toBe("0031");
  });
  it("returns null when no other order shares the hash", async () => {
    const other = await findDuplicateProofOrder("order-2");
    expect(other).toBeNull();
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

Run: `pnpm vitest run src/app/dashboard/proof-actions.test.ts`
Expected: FAIL (file doesn't exist).

- [ ] **Step 4: Implement `proof-actions.ts`**

```ts
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { z } from "zod";

const idSchema = z.string().uuid();

export async function getProofPhotoUrl(
  orderId: string,
): Promise<string | null> {
  if (!idSchema.safeParse(orderId).success) return null;
  const supabase = await createServerClient();

  const { data: order } = await supabase
    .from("orders")
    .select("payment_proof_path")
    .eq("id", orderId)
    .maybeSingle();
  if (!order?.payment_proof_path) return null;

  const { data, error } = await supabase.storage
    .from("payment-proofs")
    .createSignedUrl(order.payment_proof_path, 300);
  if (error || !data) {
    console.error("getProofPhotoUrl failed", error?.message);
    return null;
  }
  return data.signedUrl;
}

export async function findDuplicateProofOrder(
  orderId: string,
): Promise<string | null> {
  if (!idSchema.safeParse(orderId).success) return null;
  const supabase = await createServerClient();

  const { data: order } = await supabase
    .from("orders")
    .select("payment_proof_hash")
    .eq("id", orderId)
    .maybeSingle();
  if (!order?.payment_proof_hash) return null;

  const { data: match } = await supabase
    .from("orders")
    .select("order_number")
    .eq("payment_proof_hash", order.payment_proof_hash)
    .neq("id", orderId)
    .limit(1)
    .maybeSingle();

  return match?.order_number ?? null;
}
```

Both run on the authenticated (`createServerClient`) client, not
service-role — RLS's existing `orders_vendor_select` policy and Task 1's
`payment_proofs_vendor_select` storage policy scope both reads to the
caller's own vendor automatically.

- [ ] **Step 5: Run it, confirm it passes**

Run: same command as Step 3.
Expected: PASS.

- [ ] **Step 6: Write the failing test for `PaymentProofViewer`**

```ts
it("shows a loading state, then the photo, then the OCR + duplicate hints", async () => {
  getProofPhotoUrlMock.mockResolvedValueOnce("https://signed.example/proof.png");
  findDuplicateProofOrderMock.mockResolvedValueOnce(null);
  render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);
  expect(await screen.findByRole("img")).toBeInTheDocument();
});

it("shows the duplicate warning when another order shares the same photo hash", async () => {
  getProofPhotoUrlMock.mockResolvedValueOnce("https://signed.example/proof.png");
  findDuplicateProofOrderMock.mockResolvedValueOnce("0031");
  render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);
  expect(await screen.findByText(/already used for order #0031/i)).toBeInTheDocument();
});
```

Mock `tesseract.js`'s `recognize` entirely in this test (it's a heavy
WASM library — this codebase's existing pattern for a similarly heavy
client-only dependency is `next/dynamic`, mock at the module level so the
test never actually loads WASM).

- [ ] **Step 7: Run it, confirm it fails**

Run: `pnpm vitest run src/components/payment-proof-viewer.dom.test.tsx`
Expected: FAIL.

- [ ] **Step 8: Implement `PaymentProofViewer`**

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  getProofPhotoUrl,
  findDuplicateProofOrder,
} from "@/app/dashboard/proof-actions";

interface Props {
  orderId: string;
  expectedAmountCents: number;
}

interface OcrHint {
  amountMatch: boolean | null;
  recognizedText: string;
}

export function PaymentProofViewer({ orderId, expectedAmountCents }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [duplicateOrderNumber, setDuplicateOrderNumber] = useState<
    string | null
  >(null);
  const [ocrHint, setOcrHint] = useState<OcrHint | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [photoUrl, duplicate] = await Promise.all([
        getProofPhotoUrl(orderId),
        findDuplicateProofOrder(orderId),
      ]);
      if (cancelled) return;
      setUrl(photoUrl);
      setDuplicateOrderNumber(duplicate);
      if (photoUrl) {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng", 1, {
          workerPath: "/tesseract/worker.min.js",
          corePath: "/tesseract/tesseract-core.wasm.js",
          langPath: "/tesseract",
        });
        const { data } = await worker.recognize(photoUrl);
        await worker.terminate();
        if (cancelled) return;
        const amountMatch = data.text.includes(
          (expectedAmountCents / 100).toFixed(2),
        );
        setOcrHint({ amountMatch, recognizedText: data.text });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, expectedAmountCents]);

  if (!url) return null;

  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Payment proof" className="w-full rounded-lg" />
      {duplicateOrderNumber && (
        <p className="text-sm font-semibold text-destructive">
          This photo was already used for order #{duplicateOrderNumber}
        </p>
      )}
      {ocrHint && (
        <p className="text-sm text-muted-foreground">
          {ocrHint.amountMatch
            ? `Looks like $${(expectedAmountCents / 100).toFixed(2)}, paid`
            : "Couldn't confirm the amount -- check manually"}
        </p>
      )}
    </div>
  );
}
```

Adjust `workerPath`/`corePath`/`langPath` to the exact filenames Step 1
actually placed under `public/tesseract/` (they vary by installed
version) — verify by loading the page in a real browser and checking the
network tab, not by guessing.

- [ ] **Step 9: Run it, confirm it passes**

Run: same command as Step 7.
Expected: PASS.

- [ ] **Step 10: Wire into `order-card.tsx`**

In the proof-photo thumbnail area (the `claimed`-state block this file
already renders per Task 10's work), replace the plain thumbnail with a
tap-to-expand control that renders `PaymentProofViewer` (dynamically
imported via `next/dynamic`, matching this file's existing pattern for
`PayPanel`) once tapped, passing `orderId={order.id}`
`expectedAmountCents={order.total_cents}`.

- [ ] **Step 11: Full verification, including a real build**

Run: `pnpm check && pnpm vitest run && pnpm build`
Expected: all green. **This build step matters most in this task** — it's
the first real signal on whether tesseract.js causes any Next.js bundling
issue in this exact repo, even used client-side only. If `pnpm build`
fails referencing tesseract.js, stop and report the exact error rather
than guessing at a fix — this was flagged as a real risk in the spec.

- [ ] **Step 12: Manual browser verification**

Start the dev server (`pnpm dev`), open the dashboard board with a
`claimed` test order (seed one via the local Supabase seed data or the
existing coffee-cart fixture), tap to expand its proof photo, and confirm
in the browser Network tab that `/tesseract/*` assets load from the same
origin (not a third-party CDN) and the OCR hint renders within a few
seconds. Use the Chrome browser tools if available in this session to do
this instead of describing it — actually load the page.

- [ ] **Step 13: Commit**

```bash
git add public/tesseract package.json pnpm-lock.yaml src/components/payment-proof-viewer.tsx src/components/payment-proof-viewer.dom.test.tsx src/components/order-card.tsx src/app/dashboard/proof-actions.ts src/app/dashboard/proof-actions.test.ts
git commit -m "feat(dashboard): OCR + duplicate-photo hint on payment proof review

Client-side only, self-hosted tesseract.js assets under /public/tesseract
(matches this repo's locked-down CSP, no third-party CDN) -- avoids the
documented Vercel/Next.js bundling failures that are specific to
server-side tesseract.js usage. Non-blocking hint only; the vendor's own
review action is unaffected either way."
```

---

## Task 13: Pickup QR on the order-status page + settings toggle

**Files:**

- Modify: `src/app/order/[boothId]/[orderNumber]/page.tsx`
- Modify: `src/app/order/[boothId]/[orderNumber]/page.dom.test.tsx`
- Modify: `src/app/dashboard/settings/settings-form.tsx`
- Modify: `src/app/dashboard/settings/settings-form.dom.test.tsx`

**Interfaces:**

- Consumes: Task 2's `pickup_scan_enabled` in `boardSettingsSchema`.
- Produces: nothing further downstream depends on this.

- [ ] **Step 1: Write the failing test for the settings toggle**

In `settings-form.dom.test.tsx`, mirroring the existing
`customer_telegram_notify_enabled` switch test exactly:

```ts
it("saves pickup_scan_enabled when the switch is toggled", async () => {
  render(<SettingsForm initialSettings={validSettings} />);
  await userEvent.click(screen.getByRole("switch", { name: /self-checkout pickup/i }));
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  expect(saveBoardSettingsMock).toHaveBeenCalledWith(
    expect.objectContaining({ pickup_scan_enabled: true }),
  );
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `pnpm vitest run src/app/dashboard/settings/settings-form.dom.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add the toggle**

Copy the existing `customer_telegram_notify_enabled` `Switch` block in
`settings-form.tsx` verbatim, renamed to `pickup_scan_enabled`, labelled
"Self-checkout pickup" with a one-line description ("Customers scan their
own order-status QR at a pickup kiosk instead of staff marking pickup
manually.").

- [ ] **Step 4: Run it, confirm it passes**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Write the failing test for the order-status page's QR**

In `page.dom.test.tsx`:

```ts
it("shows a pickup QR when ready and pickup_scan_enabled is on", async () => {
  mockOrder.status = "ready";
  mockBoardSettings.pickup_scan_enabled = true;
  render(await OrderStatusPage({ params, searchParams }));
  expect(
    screen.getByText(/show this at the pickup counter/i),
  ).toBeInTheDocument();
});

it("shows no pickup QR when the toggle is off", async () => {
  mockOrder.status = "ready";
  mockBoardSettings.pickup_scan_enabled = false;
  render(await OrderStatusPage({ params, searchParams }));
  expect(
    screen.queryByText(/show this at the pickup counter/i),
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Run it, confirm it fails**

Run: `pnpm vitest run src/app/order/\[boothId\]/\[orderNumber\]/page.dom.test.tsx`
Expected: FAIL.

- [ ] **Step 7: Add the QR to `page.tsx`**

Read `resolveHeadingNumber`'s existing `board_settings` fetch in this
file (it already reads `vendors.board_settings` for the daily-reset
number) and reuse that same read rather than adding a second query —
parse `pickup_scan_enabled` from the same `boardSettingsSchema.safeParse`
result already computed there. Add, after the items section:

```tsx
{
  order.status === "ready" && pickupScanEnabled && (
    <>
      <div className="perforation" />
      <section className="flex flex-col items-center gap-3 px-6 py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Show this at the pickup counter to collect
        </p>
        <div className="rounded-xl bg-white p-4">
          <QRCode
            value={`https://${process.env.NEXT_PUBLIC_SITE_URL ?? "qkit.example"}/order/${boothId}/${orderNumber}?t=${token}`}
            size={180}
          />
        </div>
      </section>
    </>
  );
}
```

Check this codebase's existing convention for building an absolute URL
server-side (`react-qr-code`'s `value` needs the full URL, not a relative
path, since it's meant to be scanned by a separate device) — search for
how `booth-qr-poster.tsx` (the existing booth-ordering QR poster) builds
its own absolute URL and reuse the exact same environment-variable/helper
pattern rather than inventing a new one.

Add `import QRCode from "react-qr-code";` to this file's imports.

- [ ] **Step 8: Run it, confirm it passes**

Run: same command as Step 6.
Expected: PASS.

- [ ] **Step 9: Full verification**

Run: `pnpm check && pnpm vitest run && pnpm build`
Expected: all green.

- [ ] **Step 10: Manual browser verification**

Load a `ready`-status test order's status page with the toggle on
(seed/mock as needed locally) and confirm the QR renders and, when
decoded (any phone camera), points at the correct URL.

- [ ] **Step 11: Commit**

```bash
git add src/app/order/\[boothId\]/\[orderNumber\]/page.tsx src/app/order/\[boothId\]/\[orderNumber\]/page.dom.test.tsx src/app/dashboard/settings/settings-form.tsx src/app/dashboard/settings/settings-form.dom.test.tsx
git commit -m "feat(order): show a pickup QR on the order-status page when ready

Opt-in via board_settings.pickup_scan_enabled. Reuses the existing
board_settings read already on this page (daily-reset number) rather
than a second query."
```

---

## Task 14: `confirmCollection` action + the pickup kiosk page

**Files:**

- Create: `src/app/order/[boothId]/[orderNumber]/collect-actions.ts`
- Create: `src/app/order/[boothId]/[orderNumber]/collect-actions.test.ts`
- Create: `src/app/order/[boothId]/pickup/page.tsx`
- Create: `src/app/order/[boothId]/pickup/pickup-scanner.tsx`
- Create: `src/app/order/[boothId]/pickup/pickup-scanner.dom.test.tsx`
- Create: `src/app/order/[boothId]/pickup/README.md`

**Interfaces:**

- Consumes: `buildAdvancePatch`, `recordOrderStatusEvent` (existing,
  `src/lib/orders.ts`/`src/lib/audit.ts`); `orderBoothIdSchema`/
  `orderNumberSchema`/`orderTokenSchema` (existing, `src/lib/schemas.ts`).
- Produces: `confirmCollection(boothId: string, orderNumber: string, token:
string): Promise<ActionResult<{ status: "completed" }>>`.

- [ ] **Step 1: Write the failing test for `confirmCollection`**

Following `payment-actions.test.ts`'s existing chain-mock convention:

```ts
describe("confirmCollection", () => {
  it("completes a ready order and logs a null-actor event", async () => {
    // Arrange the order mock: { status: "ready", payment_status: "claimed" }
    const result = await confirmCollection("booth-1", "0007", token);
    expect(result).toEqual({ success: true, status: "completed" });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        payment_status: "confirmed",
      }),
    );
    expect(recordOrderStatusEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: null,
        from_status: "ready",
        to_status: "completed",
      }),
    );
  });

  it("refuses a not-ready order without erroring", async () => {
    // Arrange the order mock: { status: "preparing" }
    const result = await confirmCollection("booth-1", "0007", token);
    expect(result).toEqual({ success: false, error: "Not ready yet." });
  });

  it("treats an already-completed order as already collected, not an error", async () => {
    // Arrange the order mock: { status: "completed" }
    const result = await confirmCollection("booth-1", "0007", token);
    expect(result).toEqual({ success: false, error: "Already collected." });
  });

  it("rejects an invalid booth/order/token", async () => {
    expect(await confirmCollection("not-a-uuid", "0007", token)).toEqual({
      success: false,
      error: "Invalid booth",
    });
  });

  it("rate-limits repeated attempts", async () => {
    rateLimitMock.mockResolvedValueOnce(false);
    const result = await confirmCollection("booth-1", "0007", token);
    expect(result).toEqual({
      success: false,
      error: "Too many attempts -- wait a moment.",
    });
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `pnpm vitest run src/app/order/\[boothId\]/\[orderNumber\]/collect-actions.test.ts`
Expected: FAIL (file doesn't exist).

- [ ] **Step 3: Implement `collect-actions.ts`**

```ts
"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { parseOrderRef } from "@/lib/schemas";
import { buildAdvancePatch } from "@/lib/orders";
import { recordOrderStatusEvent } from "@/lib/audit";
import type { ActionResult } from "@/lib/action-result";

export async function confirmCollection(
  boothId: string,
  orderNumber: string,
  token: string,
): Promise<ActionResult<{ status: "completed" }>> {
  const parsed = parseOrderRef(boothId, orderNumber, token);
  if (!parsed.ok)
    return {
      success: false,
      error: parsed.field === "booth" ? "Invalid booth" : "Invalid order",
    };

  const supabase = await createServiceClient();

  const ip = clientIp(await headers());
  const allowed = await rateLimit(supabase, `collect:${boothId}:${ip}`, 20, 60);
  if (!allowed)
    return { success: false, error: "Too many attempts -- wait a moment." };

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, payment_status")
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .maybeSingle();
  if (!order) return { success: false, error: "Invalid order" };
  if (order.status === "completed")
    return { success: false, error: "Already collected." };
  if (order.status !== "ready")
    return { success: false, error: "Not ready yet." };

  const patch = buildAdvancePatch(
    "completed",
    new Date().toISOString(),
    order.payment_status,
  );
  const { data: rows, error } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", order.id)
    .eq("status", "ready")
    .select("id");
  if (error) {
    console.error("confirmCollection failed", error.message);
    return { success: false, error: "Could not complete order. Try again." };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed -- try scanning again." };

  await recordOrderStatusEvent({
    order_id: order.id,
    from_status: "ready",
    to_status: "completed",
    actor: null,
  });

  return { success: true, status: "completed" };
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Write the failing test for the kiosk page shell**

`src/app/order/[boothId]/pickup/page.dom.test.tsx`:

```ts
it("calls notFound for an invalid booth id", async () => {
  await expect(
    PickupPage({ params: Promise.resolve({ boothId: "not-a-uuid" }) }),
  ).rejects.toThrow();
  expect(notFoundMock).toHaveBeenCalled();
});

it("renders PickupScanner with the booth id when valid", async () => {
  render(
    await PickupPage({ params: Promise.resolve({ boothId: validBoothId }) }),
  );
  expect(screen.getByRole("textbox")).toBeInTheDocument();
});
```

- [ ] **Step 6: Run it, confirm it fails**

Run: `pnpm vitest run src/app/order/\[boothId\]/pickup/page.dom.test.tsx`
Expected: FAIL.

- [ ] **Step 7: Implement `page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { orderBoothIdSchema } from "@/lib/schemas";
import { PickupScanner } from "./pickup-scanner";

interface Props {
  params: Promise<{ boothId: string }>;
}

export const revalidate = 0;

export default async function PickupPage({ params }: Props) {
  const { boothId } = await params;
  if (!orderBoothIdSchema.safeParse(boothId).success) notFound();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <PickupScanner boothId={boothId} />
    </div>
  );
}
```

- [ ] **Step 8: Run it, confirm it passes**

Run: same command as Step 6.
Expected: PASS.

- [ ] **Step 9: Write the failing test for `PickupScanner`**

```ts
it("auto-focuses its input on mount", () => {
  render(<PickupScanner boothId="b1" />);
  expect(screen.getByRole("textbox")).toHaveFocus();
});

it("parses a scanned URL for this booth, calls confirmCollection, and flashes success", async () => {
  confirmCollectionMock.mockResolvedValueOnce({ success: true, status: "completed" });
  render(<PickupScanner boothId="b1" />);
  const input = screen.getByRole("textbox");
  await userEvent.type(input, "https://qkit.example/order/b1/0007?t=11111111-1111-1111-1111-111111111111{Enter}");
  expect(confirmCollectionMock).toHaveBeenCalledWith("b1", "0007", "11111111-1111-1111-1111-111111111111");
  expect(await screen.findByText(/order #0007 collected/i)).toBeInTheDocument();
  expect(input).toHaveValue("");
});

it("rejects a scan for a different booth without calling confirmCollection", async () => {
  render(<PickupScanner boothId="b1" />);
  const input = screen.getByRole("textbox");
  await userEvent.type(input, "https://qkit.example/order/b2/0007?t=11111111-1111-1111-1111-111111111111{Enter}");
  expect(confirmCollectionMock).not.toHaveBeenCalled();
  expect(await screen.findByText(/wrong stall/i)).toBeInTheDocument();
});

it("disables the input while a scan is being processed, re-enabling after", async () => {
  let resolveCall: (v: unknown) => void = () => {};
  confirmCollectionMock.mockReturnValueOnce(new Promise((r) => { resolveCall = r; }));
  render(<PickupScanner boothId="b1" />);
  const input = screen.getByRole("textbox");
  await userEvent.type(input, "https://qkit.example/order/b1/0007?t=11111111-1111-1111-1111-111111111111{Enter}");
  expect(input).toBeDisabled();
  resolveCall({ success: true, status: "completed" });
  await waitFor(() => expect(input).not.toBeDisabled());
});

it("ignores an unparseable scan", async () => {
  render(<PickupScanner boothId="b1" />);
  const input = screen.getByRole("textbox");
  await userEvent.type(input, "garbage-not-a-url{Enter}");
  expect(confirmCollectionMock).not.toHaveBeenCalled();
  expect(await screen.findByText(/couldn't read that/i)).toBeInTheDocument();
});
```

- [ ] **Step 10: Run it, confirm it fails**

Run: `pnpm vitest run src/app/order/\[boothId\]/pickup/pickup-scanner.dom.test.tsx`
Expected: FAIL.

- [ ] **Step 11: Implement `pickup-scanner.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { confirmCollection } from "../[orderNumber]/collect-actions";

interface Props {
  boothId: string;
}

interface ParsedScan {
  boothId: string;
  orderNumber: string;
  token: string;
}

function parseScan(raw: string): ParsedScan | null {
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/^\/order\/([^/]+)\/([^/]+)$/);
    const token = url.searchParams.get("t");
    if (!match || !token) return null;
    return { boothId: match[1], orderNumber: match[2], token };
  } catch {
    return null;
  }
}

export function PickupScanner({ boothId }: Props) {
  const [value, setValue] = useState("");
  const [flash, setFlash] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || busy) return;
    const raw = value;
    setValue("");

    const parsed = parseScan(raw);
    if (!parsed) {
      setFlash({ ok: false, message: "Couldn't read that scan. Try again." });
      return;
    }
    if (parsed.boothId !== boothId) {
      setFlash({
        ok: false,
        message: "Wrong stall -- this code is for a different booth.",
      });
      return;
    }

    setBusy(true);
    const res = await confirmCollection(
      parsed.boothId,
      parsed.orderNumber,
      parsed.token,
    );
    setBusy(false);
    setFlash(
      res.success
        ? { ok: true, message: `Order #${parsed.orderNumber} collected` }
        : { ok: false, message: res.error ?? "Could not complete order." },
    );
    inputRef.current?.focus();
  }

  return (
    <div className="w-full max-w-md space-y-4 text-center">
      <p className="text-lg font-semibold">Scan to collect</p>
      <input
        ref={inputRef}
        autoFocus
        disabled={busy}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => inputRef.current?.focus()}
        className="w-full rounded-lg border border-border bg-card px-4 py-3 text-center"
        aria-label="Scan input"
      />
      {flash && (
        <p className={flash.ok ? "text-status-ready" : "text-destructive"}>
          {flash.message}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 12: Run it, confirm it passes**

Run: same command as Step 10.
Expected: PASS.

- [ ] **Step 13: Write `README.md`** for `src/app/order/[boothId]/pickup/`
      describing the kiosk's purpose, the HID-scanner mechanic, and its
      explicit non-security-boundary framing from the spec.

- [ ] **Step 14: Full verification**

Run: `pnpm check && pnpm vitest run && pnpm build`
Expected: all green.

- [ ] **Step 15: Manual browser verification**

Open the kiosk page for a real booth id in the dev server, confirm the
input is auto-focused, and manually type a well-formed scan string
(mimicking what a scanner would type) followed by Enter to confirm the
full flow end-to-end against local Supabase (a `ready` test order should
flip to `completed`).

- [ ] **Step 16: Commit**

```bash
git add src/app/order/\[boothId\]/\[orderNumber\]/collect-actions.ts src/app/order/\[boothId\]/\[orderNumber\]/collect-actions.test.ts src/app/order/\[boothId\]/pickup
git commit -m "feat(order): add the self-checkout pickup kiosk page

Public, unattended, no login -- customer scans their own order-status QR
against a Bluetooth HID scanner paired to a shelf tablet. Locks its input
during an in-flight request so a rapid second scan can't interleave, and
rejects a scan for a different booth. Authorization is the token alone,
same trust level as every other customer link in this app."
```

---

## Task 15: READMEs, CHANGELOG, final full-repo verification

**Files:**

- Modify: `src/app/order/README.md`
- Modify: `src/app/order/[boothId]/README.md`
- Modify: `src/app/order/[boothId]/[orderNumber]/README.md`
- Modify: `src/app/dashboard/README.md`
- Modify: `src/components/README.md`
- Modify: `supabase/migrations/README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: everything from Tasks 1-14.
- Produces: nothing (documentation only).

- [ ] **Step 1: Update every touched folder's README**

For each folder listed above, read its current content and add/update
bullets describing the new files this plan added or the behavior changes
made to existing files, matching this repo's established README content
standard (real per-file descriptions, not a filename listing — check
`project_qkit_readme_standard` conventions already established elsewhere
in this repo's READMEs for the expected depth).

- [ ] **Step 2: Add the CHANGELOG entry**

Invoke this repo's own `/changelog` skill (`.claude/skills/changelog`) to
append a correctly-formatted `[Unreleased]` entry summarizing the whole
feature (payment-first checkout, deferred order numbering, reconciled
review action, OCR hint, self-checkout pickup kiosk) rather than hand-writing
the format.

- [ ] **Step 3: Run the complete verification suite one final time**

Run: `pnpm check && pnpm vitest run && pnpm test:mutation && pnpm build`
Expected: all green. `pnpm test:mutation` is advisory (non-blocking per
this repo's own convention) — review any survivors in `src/lib/hash.ts`
and `src/lib/orders.ts`'s touched functions specifically, since those are
new pure logic this plan added.

- [ ] **Step 4: Run the e2e smoke suite against local Supabase**

Follow this repo's documented e2e setup (`AGENTS.md`'s E2E section):
`supabase start`, apply all migrations including this plan's `0087`, seed
`supabase/seed/coffee-cart.sql`, then `pnpm test:e2e`. If the existing
`customer-order.spec.ts` scenario doesn't already cover a payment-required
booth, note that as a gap for a human to decide whether to extend it —
do not skip running what already exists.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: update READMEs and changelog for payment-first + pickup kiosk"
```

- [ ] **Step 6: Push and monitor CI**

```bash
git push -u origin <branch-name>
gh pr create --title "feat(order): payment-first checkout + self-checkout pickup kiosk" --body "$(cat <<'EOF'
## Summary
- Order numbers are no longer assigned until a customer claims payment (photo proof required); the vendor's kitchen alert and printed ticket move to that same moment.
- Vendor board hides an unpaid QR order until claimed; walk-up orders are unaffected.
- "Confirm payment" + "Start now" merge into one reconciled action.
- OCR + duplicate-photo hint on the vendor's proof review (client-side, self-hosted, non-blocking).
- Unpaid QR orders auto-cancel after 30 minutes.
- New public, unattended self-checkout pickup kiosk: customer scans their own order-status QR to mark an order collected.

See docs/superpowers/specs/2026-09-13-payment-first-checkout-and-self-checkout-pickup-design.md for full design + confirmation-sweep history.

## Test plan
- [ ] pnpm check / vitest / build all green
- [ ] pgTAP RLS tests green
- [ ] e2e smoke green
- [ ] Manually verified /pay, the reconciled board button, the OCR hint, and the pickup kiosk in a local preview
EOF
)"
```

Then launch a `Monitor` polling `gh pr checks <PR#> --json name,bucket`
until every check reaches a terminal state, reporting each new result as
it lands, the same pattern used for every prior PR this session.

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage check**: every numbered section of the v6 spec has a
  corresponding task above — payment-first flow (Tasks 3, 5, 6, 7),
  order-number deferral (Task 1), board visibility (Task 8), the two other
  query-site fixes (Task 9), the reconciled action (Task 10), the
  abandoned-payment sweep (Task 11), OCR + duplicate-photo (Task 12), the
  pickup QR + kiosk (Tasks 13, 14), and the app-layer nullability ripple
  the deep sweep found (Task 2). Nothing in the spec is unaccounted for.
- **Task 12's biggest real risk** is still tesseract.js's Vercel/Next.js
  build behavior, even client-side — Step 11's `pnpm build` and Step 12's
  manual browser check are there specifically to catch this early. If it
  fails, the fallback (per the spec's own research) is not a cloud OCR API
  (privacy/AI concern) but shipping without the OCR hint — the duplicate-
  photo check and manual review still function fully without it, so Task
  12's OCR half can be dropped without unwinding anything else if it
  proves unworkable.
- Task ordering matters: Tasks 1-2 must land before anything else (the
  nullable-type ripple), Task 3 before Tasks 4-7 (they consume its new
  function signatures), Task 10 is independent of Tasks 6-9 and could run
  in parallel with them if using subagent-driven execution with multiple
  workers, but Task 14 depends on nothing from Tasks 8-13 and could also
  run early/in-parallel once Task 1 lands.
