# qkit Payments Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bring-your-own payment seam so a booth can attach PayNow / any payment link / static QR (Stripe reserved-but-dark), turning the order queue into an optional payment queue.

**Architecture:** Per-booth `booths.payment` JSONB (discriminated union by `kind`) drives a pure adapter (`src/lib/payments/`) that produces a `CheckoutView` (qr/link/image). Orders gain a `payment_status` lifecycle (`not_required`→`pending`→`claimed`→`confirmed`). The customer claims payment via a service-role action; the vendor confirms via the existing RLS-guarded client update. No money flows through qkit.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (`@supabase/ssr`), Zod, Vitest, `react-qr-code`, Playwright.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`. (AGENTS.md)
- Validate all user input with Zod at every boundary (forms + server actions). (AGENTS.md)
- Authorization lives in **RLS policies**, not app code. Never widen a policy to fix a query. (AGENTS.md)
- Service-role client (`createServiceClient`) only in Server Actions / Route Handlers, never in client components. (AGENTS.md)
- No secrets in `NEXT_PUBLIC_*`. The active payment kinds (`pointer`, `paynow`) carry NO secrets. (AGENTS.md)
- After editing the schema, update BOTH `supabase/migrations/` and `src/lib/types.ts`. (AGENTS.md)
- Pure business logic lives in `src/lib` (mutation-tested by Stryker). Component behavior → `*.dom.test.tsx`; unit logic → `*.test.ts`. (AGENTS.md)
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Work happens on branch `feat/payments-seam` (already created).

---

### Task 1: Migration + types for payment columns

**Files:**

- Create: `supabase/migrations/0024_booth_payments.sql`
- Modify: `src/lib/types.ts` (booths Row/Insert/Update, orders Row/Insert/Update, Enums, exported helper types)

**Interfaces:**

- Produces: SQL columns `booths.payment jsonb`, `orders.payment_status payment_status`, `orders.payment_method_kind text`, `orders.paid_at timestamptz`; enum `payment_status`. TS types `PaymentStatus`, `PaymentKind`, `PaymentConfig`, updated `Booth`/`Order`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0024_booth_payments.sql`:

```sql
-- Payment seam: optional per-booth payment method + per-order payment lifecycle.
-- No money flows through qkit; vendor is merchant of record. Active kinds
-- (pointer, paynow) carry no secrets, so booths.payment is publicly readable
-- alongside the existing public booth read.

create type payment_status as enum (
  'not_required', 'pending', 'claimed', 'confirmed'
);

-- Discriminated union by `kind` ('pointer' | 'paynow' | 'stripe'); validated in
-- app code (Zod). NULL = queue-only (today's behavior).
alter table public.booths
  add column payment jsonb;

alter table public.orders
  add column payment_status payment_status not null default 'not_required',
  add column payment_method_kind text,
  add column paid_at timestamptz;

-- Existing orders predate the seam → already correct at the 'not_required'
-- default; no backfill needed beyond the default.
```

- [ ] **Step 2: Apply the migration locally**

Run: `supabase db reset` (or `supabase migration up`) against the local stack.
Expected: applies cleanly, no error.

- [ ] **Step 3: Update `src/lib/types.ts`**

Add above the `Database` interface (near `OrderStatus`):

```ts
export type PaymentStatus =
  | "not_required"
  | "pending"
  | "claimed"
  | "confirmed";

export type PaymentKind = "pointer" | "paynow" | "stripe";

// Discriminated union stored in booths.payment (JSONB). No secrets in any
// active kind — a PayNow UEN/mobile, a payment link, and a static QR are all
// public-by-design. `stripe` is reserved but dark (adapter throws).
export type PaymentConfig =
  | { kind: "pointer"; label: string; url?: string; qr_image_url?: string }
  | { kind: "paynow"; payee_name: string; uen?: string; mobile?: string }
  | { kind: "stripe"; account_id: string };
```

In `Database["public"]["Tables"]["booths"]`, add `payment: Json | null;` to `Row`, and `payment?: Json | null;` to `Insert` and `Update`.

In `Database["public"]["Tables"]["orders"]`, add to `Row`:

```ts
payment_status: PaymentStatus;
payment_method_kind: string | null;
paid_at: string | null;
```

and the optional forms (`payment_status?: PaymentStatus;` etc.) to `Insert` and `Update`.

In `Database["public"]["Enums"]`, add `payment_status: PaymentStatus;`.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0024_booth_payments.sql src/lib/types.ts
git commit -m "feat(payments): schema + types for booth payment method and order payment status

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Payment config Zod schemas + tolerant read parser

**Files:**

- Modify: `src/lib/schemas.ts`
- Test: `src/lib/schemas.test.ts` (append cases)

**Interfaces:**

- Consumes: `PaymentConfig`, `PaymentStatus` from `@/lib/types`.
- Produces: `paymentConfigSchema` (write boundary), `parsePaymentConfig(data: unknown): PaymentConfig | null` (tolerant read), `paymentStatusSchema`.

- [ ] **Step 1: Write failing tests**

Append to `src/lib/schemas.test.ts`:

```ts
import { paymentConfigSchema, parsePaymentConfig } from "./schemas";

describe("paymentConfigSchema", () => {
  it("accepts a pointer with a url", () => {
    expect(
      paymentConfigSchema.safeParse({
        kind: "pointer",
        label: "PayLah",
        url: "https://pay.example/abc",
      }).success,
    ).toBe(true);
  });

  it("rejects a pointer with neither url nor qr_image_url", () => {
    expect(
      paymentConfigSchema.safeParse({ kind: "pointer", label: "x" }).success,
    ).toBe(false);
  });

  it("accepts a paynow with exactly a uen", () => {
    expect(
      paymentConfigSchema.safeParse({
        kind: "paynow",
        payee_name: "Kopitiam Cart",
        uen: "53312345A",
      }).success,
    ).toBe(true);
  });

  it("rejects a paynow with both uen and mobile", () => {
    expect(
      paymentConfigSchema.safeParse({
        kind: "paynow",
        payee_name: "x",
        uen: "53312345A",
        mobile: "+6591234567",
      }).success,
    ).toBe(false);
  });

  it("rejects a paynow with neither uen nor mobile", () => {
    expect(
      paymentConfigSchema.safeParse({ kind: "paynow", payee_name: "x" })
        .success,
    ).toBe(false);
  });
});

describe("parsePaymentConfig", () => {
  it("returns the config for a valid pointer", () => {
    expect(
      parsePaymentConfig({ kind: "pointer", label: "L", url: "https://a.b" }),
    ).toEqual({ kind: "pointer", label: "L", url: "https://a.b" });
  });

  it("returns null for null, malformed, or unknown kind", () => {
    expect(parsePaymentConfig(null)).toBeNull();
    expect(parsePaymentConfig({ kind: "paypal" })).toBeNull();
    expect(parsePaymentConfig({ kind: "paynow" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/lib/schemas.test.ts`
Expected: FAIL ("paymentConfigSchema is not exported" / undefined).

- [ ] **Step 3: Implement in `src/lib/schemas.ts`**

Add (reuse the existing `imageUrlString` for `qr_image_url`):

```ts
// ── Payment seam ─────────────────────────────────────────────────────────────
// booths.payment discriminated union. No secrets here — pointer URLs, static QR
// images, and PayNow identifiers are all shown to the paying customer.

const pointerConfigSchema = z
  .object({
    kind: z.literal("pointer"),
    label: z.string().min(1, "Label is required").max(60),
    url: z.string().url().optional(),
    qr_image_url: imageUrlString.optional(),
  })
  // A pointer with no destination can't be paid — require at least one.
  .refine((c) => Boolean(c.url || c.qr_image_url), {
    message: "Add a payment link or a QR image",
    path: ["url"],
  });

const paynowConfigSchema = z
  .object({
    kind: z.literal("paynow"),
    payee_name: z.string().min(1, "Payee name is required").max(100),
    // SG UEN: alphanumeric, ~9–10 chars. Mobile: +65 followed by 8 digits.
    uen: z
      .string()
      .regex(/^[0-9A-Za-z]{8,12}$/, "Invalid UEN")
      .optional(),
    mobile: z
      .string()
      .regex(/^\+65[0-9]{8}$/, "Use +65XXXXXXXX")
      .optional(),
  })
  // PayNow targets exactly one of UEN or mobile (xor).
  .refine((c) => Boolean(c.uen) !== Boolean(c.mobile), {
    message: "Provide either a UEN or a mobile number, not both",
    path: ["uen"],
  });

const stripeConfigSchema = z.object({
  kind: z.literal("stripe"),
  account_id: z.string().min(1),
});

export const paymentConfigSchema = z.discriminatedUnion("kind", [
  pointerConfigSchema,
  paynowConfigSchema,
  stripeConfigSchema,
]);

export const paymentStatusSchema = z.enum([
  "not_required",
  "pending",
  "claimed",
  "confirmed",
]);

/** Parse a JSONB booths.payment value; any malformed shape degrades to null. */
export function parsePaymentConfig(data: unknown): PaymentConfig | null {
  if (data == null) return null;
  const parsed = paymentConfigSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
```

Add `PaymentConfig` to the existing `import type { ... } from "@/lib/types"` line. Add `export type PaymentConfigInput = z.infer<typeof paymentConfigSchema>;` near the other inferred exports.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm exec vitest run src/lib/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas.ts src/lib/schemas.test.ts
git commit -m "feat(payments): zod schemas + tolerant parser for booth payment config

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: EMVCo PayNow QR payload builder (pure)

**Files:**

- Create: `src/lib/payments/paynow.ts`
- Test: `src/lib/payments/paynow.test.ts`

**Interfaces:**

- Produces: `buildPayNowPayload(args: { uen?: string; mobile?: string; payeeName: string; amountCents: number; reference: string; editable?: boolean }): string` — an EMVCo-compliant PayNow QR string with CRC.

EMVCo TLV format: each field is `ID(2) + LEN(2, zero-padded) + VALUE`. PayNow lives in the merchant account info template, ID `26`, with sub-fields: `00`=`SG.PAYNOW`, `01`=proxy type (`0`=mobile, `2`=UEN), `02`=proxy value, `03`=editable (`0`/`1`). CRC (ID `63`, len `04`) is CRC-16/CCITT-FALSE over the whole string including `6304`.

- [ ] **Step 1: Write failing tests**

`src/lib/payments/paynow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPayNowPayload, crc16 } from "./paynow";

describe("crc16 (CRC-16/CCITT-FALSE)", () => {
  it("matches the known check value for '123456789'", () => {
    // CRC-16/CCITT-FALSE check value is 0x29B1.
    expect(crc16("123456789")).toBe(0x29b1);
  });
});

describe("buildPayNowPayload", () => {
  it("emits a UEN payload that ends with a 4-hex CRC and contains SG.PAYNOW", () => {
    const s = buildPayNowPayload({
      uen: "53312345A",
      payeeName: "Kopitiam Cart",
      amountCents: 450,
      reference: "12",
    });
    expect(s).toContain("SG.PAYNOW");
    expect(s).toContain("53312345A");
    // Amount field 54 = "4.50".
    expect(s).toContain("54044.50");
    // Ends with CRC tag 6304 + 4 hex chars.
    expect(s).toMatch(/6304[0-9A-F]{4}$/);
  });

  it("uses proxy type 0 for mobile, 2 for UEN", () => {
    expect(
      buildPayNowPayload({
        mobile: "+6591234567",
        payeeName: "x",
        amountCents: 100,
        reference: "1",
      }),
    ).toContain("010103" + "0");
    expect(
      buildPayNowPayload({
        uen: "53312345A",
        payeeName: "x",
        amountCents: 100,
        reference: "1",
      }),
    ).toContain("010103" + "2");
  });

  it("round-trips its own CRC (recomputing over the body matches the suffix)", () => {
    const s = buildPayNowPayload({
      uen: "53312345A",
      payeeName: "x",
      amountCents: 100,
      reference: "1",
    });
    const body = s.slice(0, -4); // strip the 4 hex CRC chars, keep "...6304"
    const expected = crc16(body).toString(16).toUpperCase().padStart(4, "0");
    expect(s.slice(-4)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/lib/payments/paynow.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/payments/paynow.ts`**

```ts
// EMVCo-compliant PayNow QR payload builder. Pure — no I/O. qkit never touches
// funds; this only renders a QR the customer scans in their own bank app.

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over the ASCII of `s`. */
export function crc16(s: string): number {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc;
}

/** One EMVCo TLV field: 2-char id + 2-char zero-padded length + value. */
function tlv(id: string, value: string): string {
  return id + value.length.toString().padStart(2, "0") + value;
}

export function buildPayNowPayload(args: {
  uen?: string;
  mobile?: string;
  payeeName: string;
  amountCents: number;
  reference: string;
  editable?: boolean;
}): string {
  const isUen = Boolean(args.uen);
  const proxyType = isUen ? "2" : "0";
  const proxyValue = (args.uen ?? args.mobile ?? "").trim();

  // Merchant account information template (ID 26) for PayNow.
  const merchant = tlv(
    "26",
    tlv("00", "SG.PAYNOW") +
      tlv("01", proxyType) +
      tlv("02", proxyValue) +
      tlv("03", args.editable ? "1" : "0"),
  );

  const amount = (args.amountCents / 100).toFixed(2);

  const body =
    tlv("00", "01") + // payload format indicator
    tlv("01", "12") + // dynamic QR (single use)
    merchant +
    tlv("52", "0000") + // merchant category code (unset)
    tlv("53", "702") + // currency: SGD (ISO 4217 numeric)
    tlv("54", amount) +
    tlv("58", "SG") + // country
    tlv("59", args.payeeName.slice(0, 25)) + // merchant name
    tlv("60", "Singapore") + // merchant city
    tlv("62", tlv("01", args.reference.slice(0, 25))); // additional data: bill ref

  // CRC is computed over the body plus the CRC tag+length ("6304").
  const withCrcTag = body + "6304";
  const crc = crc16(withCrcTag).toString(16).toUpperCase().padStart(4, "0");
  return withCrcTag + crc;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm exec vitest run src/lib/payments/paynow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments/paynow.ts src/lib/payments/paynow.test.ts
git commit -m "feat(payments): EMVCo PayNow QR payload builder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Payment adapter registry (pure)

**Files:**

- Create: `src/lib/payments/adapters.ts`
- Test: `src/lib/payments/adapters.test.ts`

**Interfaces:**

- Consumes: `PaymentConfig` (`@/lib/types`), `buildPayNowPayload` (Task 3).
- Produces: `type CheckoutView`, `renderCheckout(config: PaymentConfig, ctx: { amountCents: number; orderRef: string }): CheckoutView`.

- [ ] **Step 1: Write failing tests**

`src/lib/payments/adapters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderCheckout } from "./adapters";

const ctx = { amountCents: 450, orderRef: "12" };

describe("renderCheckout", () => {
  it("pointer with a url → link view", () => {
    const v = renderCheckout(
      { kind: "pointer", label: "PayLah", url: "https://a.b" },
      ctx,
    );
    expect(v).toEqual({ type: "link", url: "https://a.b", label: "PayLah" });
  });

  it("pointer with only a qr image → image view", () => {
    const v = renderCheckout(
      { kind: "pointer", label: "Scan", qr_image_url: "/seed/qr.png" },
      ctx,
    );
    expect(v).toEqual({ type: "image", url: "/seed/qr.png" });
  });

  it("paynow → qr view whose payload encodes the amount", () => {
    const v = renderCheckout(
      { kind: "paynow", payee_name: "Cart", uen: "53312345A" },
      ctx,
    );
    expect(v.type).toBe("qr");
    if (v.type === "qr") expect(v.payload).toContain("54044.50");
  });

  it("stripe → throws (reserved but dark)", () => {
    expect(() =>
      renderCheckout({ kind: "stripe", account_id: "acct_1" }, ctx),
    ).toThrow(/not enabled/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/lib/payments/adapters.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/payments/adapters.ts`**

```ts
import type { PaymentConfig } from "@/lib/types";
import { buildPayNowPayload } from "./paynow";

// What the customer's Pay panel renders. `qr` carries an EMVCo string the
// client turns into a QR; `link`/`image` point at a vendor-hosted destination.
export type CheckoutView =
  | { type: "qr"; payload: string }
  | { type: "link"; url: string; label: string }
  | { type: "image"; url: string };

export function renderCheckout(
  config: PaymentConfig,
  ctx: { amountCents: number; orderRef: string },
): CheckoutView {
  switch (config.kind) {
    case "pointer":
      if (config.url)
        return { type: "link", url: config.url, label: config.label };
      // Schema guarantees one of url / qr_image_url is present.
      return { type: "image", url: config.qr_image_url! };
    case "paynow":
      return {
        type: "qr",
        payload: buildPayNowPayload({
          uen: config.uen,
          mobile: config.mobile,
          payeeName: config.payee_name,
          amountCents: ctx.amountCents,
          reference: ctx.orderRef,
        }),
      };
    case "stripe":
      throw new Error("stripe payments not enabled");
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm exec vitest run src/lib/payments/adapters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments/adapters.ts src/lib/payments/adapters.test.ts
git commit -m "feat(payments): checkout adapter registry (pointer/paynow/stripe)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `placeOrder` snapshots payment status

**Files:**

- Modify: `src/app/order/[boothId]/actions.ts`

**Interfaces:**

- Consumes: `parsePaymentConfig` (Task 2).
- Produces: orders inserted with `payment_status` and `payment_method_kind` set from the booth's configured method.

- [ ] **Step 1: Add `payment` to the booth select**

In `src/app/order/[boothId]/actions.ts`, change the booth query select from `"is_active, hours, menu_items"` to `"is_active, hours, menu_items, payment"`.

- [ ] **Step 2: Derive payment fields before the insert**

Add `parsePaymentConfig` to the import from `@/lib/schemas`. Immediately before the `supabase.from("orders").insert({...})` call, add:

```ts
// Snapshot the booth's payment method onto the order so the queue knows
// whether a payment is expected (and via which kind), frozen at order time.
const paymentConfig = parsePaymentConfig(booth.payment);
const paymentStatus = paymentConfig ? "pending" : "not_required";
```

- [ ] **Step 3: Set the fields on insert**

In the `.insert({ ... })` object, add after `status: "preparing",`:

```ts
    payment_status: paymentStatus,
    payment_method_kind: paymentConfig?.kind ?? null,
```

- [ ] **Step 4: Typecheck + run order tests**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run src/app/order`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/order/[boothId]/actions.ts
git commit -m "feat(payments): placeOrder snapshots payment status from booth method

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `claimPayment` service-role action

**Files:**

- Create: `src/app/order/[boothId]/[orderNumber]/payment-actions.ts`

**Interfaces:**

- Produces: `claimPayment(boothId: string, orderNumber: string): Promise<ActionResult>` — flips a single order `pending`→`claimed` via the service-role client. Never sets `confirmed`, never touches `status`.

- [ ] **Step 1: Implement the action**

`src/app/order/[boothId]/[orderNumber]/payment-actions.ts`:

```ts
"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const boothIdSchema = z.string().uuid();

// Customer is anonymous, so this uses the service-role client (same pattern as
// the order status page read). It is deliberately narrow: it only advances a
// single order from 'pending' to 'claimed'. It cannot set 'confirmed' (vendor-
// only) and cannot touch order_status. The .eq("payment_status","pending")
// guard makes a double-tap or a replay a no-op.
export async function claimPayment(
  boothId: string,
  orderNumber: string,
): Promise<ActionResult> {
  if (!boothIdSchema.safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("orders")
    .update({ payment_status: "claimed" })
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("payment_status", "pending");

  if (error) {
    console.error("claimPayment failed", error.message);
    return { success: false, error: "Could not record payment. Try again." };
  }
  return { success: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/order/[boothId]/[orderNumber]/payment-actions.ts"
git commit -m "feat(payments): claimPayment service action (pending -> claimed)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Customer Pay panel + status-page wiring

**Files:**

- Create: `src/app/order/[boothId]/[orderNumber]/pay-panel.tsx`
- Create: `src/app/order/[boothId]/[orderNumber]/pay-panel.dom.test.tsx`
- Modify: `src/app/order/[boothId]/[orderNumber]/page.tsx`

**Interfaces:**

- Consumes: `renderCheckout` (Task 4), `claimPayment` (Task 6), `parsePaymentConfig` (Task 2), `react-qr-code`.
- Produces: `<PayPanel boothId orderNumber checkout initialStatus />` client component.

- [ ] **Step 1: Write the failing DOM test**

`src/app/order/[boothId]/[orderNumber]/pay-panel.dom.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PayPanel } from "./pay-panel";

vi.mock("./payment-actions", () => ({
  claimPayment: vi.fn().mockResolvedValue({ success: true }),
}));

describe("PayPanel", () => {
  it("shows a QR and, after I've paid, a claimed state", async () => {
    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        checkout={{ type: "qr", payload: "00020101" }}
        initialStatus="pending"
      />,
    );
    expect(screen.getByText(/scan to pay/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /i've paid/i }));
    await waitFor(() =>
      expect(screen.getByText(/payment sent/i)).toBeInTheDocument(),
    );
  });

  it("renders a pay link for a link checkout", () => {
    render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        checkout={{ type: "link", url: "https://a.b", label: "PayLah" }}
        initialStatus="pending"
      />,
    );
    expect(screen.getByRole("link", { name: /PayLah/ })).toHaveAttribute(
      "href",
      "https://a.b",
    );
  });

  it("renders nothing once confirmed", () => {
    const { container } = render(
      <PayPanel
        boothId="b"
        orderNumber="12"
        checkout={{ type: "qr", payload: "x" }}
        initialStatus="confirmed"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run "src/app/order/[boothId]/[orderNumber]/pay-panel.dom.test.tsx"`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `pay-panel.tsx`**

```tsx
"use client";

import { useState } from "react";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CheckoutView } from "@/lib/payments/adapters";
import type { PaymentStatus } from "@/lib/types";
import { claimPayment } from "./payment-actions";

export function PayPanel({
  boothId,
  orderNumber,
  checkout,
  initialStatus,
}: {
  boothId: string;
  orderNumber: string;
  checkout: CheckoutView;
  initialStatus: PaymentStatus;
}) {
  const [status, setStatus] = useState<PaymentStatus>(initialStatus);
  const [busy, setBusy] = useState(false);

  // Once the vendor has confirmed receipt there's nothing left to pay.
  if (status === "confirmed" || status === "not_required") return null;

  async function claim() {
    setBusy(true);
    const res = await claimPayment(boothId, orderNumber);
    setBusy(false);
    if (res.success) setStatus("claimed");
    else toast.error(res.error);
  }

  const claimed = status === "claimed";

  return (
    <section className="space-y-4 px-6 py-5">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        {checkout.type === "link" ? "Pay to collect" : "Scan to pay"}
      </p>

      {checkout.type === "qr" && (
        <div className="mx-auto w-fit rounded-xl bg-white p-4">
          <QRCode value={checkout.payload} size={180} />
        </div>
      )}
      {checkout.type === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={checkout.url}
          alt="Payment QR"
          className="mx-auto w-44 rounded-xl border border-border"
        />
      )}
      {checkout.type === "link" && (
        <Button asChild className="h-12 w-full rounded-xl">
          <a href={checkout.url} target="_blank" rel="noopener noreferrer">
            {checkout.label}
          </a>
        </Button>
      )}

      {claimed ? (
        <p className="text-center text-sm font-semibold text-emerald-600">
          Payment sent — waiting for the stall to confirm.
        </p>
      ) : (
        <Button
          variant="outline"
          className="h-11 w-full rounded-xl"
          disabled={busy}
          onClick={claim}
        >
          I&apos;ve paid
        </Button>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the DOM test to verify pass**

Run: `pnpm exec vitest run "src/app/order/[boothId]/[orderNumber]/pay-panel.dom.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Wire into the status page**

In `src/app/order/[boothId]/[orderNumber]/page.tsx`:

Add imports:

```ts
import { parsePaymentConfig } from "@/lib/schemas";
import { renderCheckout } from "@/lib/payments/adapters";
import { PayPanel } from "./pay-panel";
```

Change the booth select to fetch `payment`:

```ts
const { data: booth } = await supabase
  .from("booths")
  .select("name, payment")
  .eq("id", boothId)
  .single();
```

After `const items = parseOrderItems(order.items);`, derive the checkout:

```ts
const paymentConfig = parsePaymentConfig(booth?.payment);
// Only show the pay panel while payment is still outstanding.
const checkout =
  paymentConfig &&
  (order.payment_status === "pending" || order.payment_status === "claimed")
    ? safeRenderCheckout(paymentConfig, order.total_cents, order.order_number)
    : null;
```

Add this helper at module scope (below the imports) so a malformed/stripe config can never crash the customer page:

```ts
function safeRenderCheckout(
  config: Parameters<typeof renderCheckout>[0],
  amountCents: number,
  orderRef: string,
) {
  try {
    return renderCheckout(config, { amountCents, orderRef });
  } catch {
    return null; // e.g. dark 'stripe' kind — degrade to no panel
  }
}
```

Render the panel between the status poller and the items section (after the second `<div className="perforation" />`):

```tsx
{
  checkout && (
    <>
      <PayPanel
        boothId={boothId}
        orderNumber={orderNumber}
        checkout={checkout}
        initialStatus={order.payment_status}
      />
      <div className="perforation" />
    </>
  );
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

```bash
git add "src/app/order/[boothId]/[orderNumber]/pay-panel.tsx" "src/app/order/[boothId]/[orderNumber]/pay-panel.dom.test.tsx" "src/app/order/[boothId]/[orderNumber]/page.tsx"
git commit -m "feat(payments): customer pay panel (QR/link/image) on order status page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Vendor confirm + payment badge on the order card

**Files:**

- Modify: `src/components/order-card.tsx`
- Test: `src/components/order-card.dom.test.tsx` (create if absent; otherwise append)

**Interfaces:**

- Consumes: `Order.payment_status`, the existing `createClient()` supabase browser client + RLS.
- Produces: a payment badge on each card and, for a `claimed` order, a "Confirm received" button that does a client-side RLS-guarded `update({ payment_status: "confirmed", paid_at })`.

The vendor is authenticated, so this follows the EXACT pattern already in `order-card.tsx` (`advanceStatus`/`cancelOrder` use `supabase.from("orders").update(...).eq("id", order.id)` under RLS). No new server action.

- [ ] **Step 1: Write the failing DOM test**

`src/components/order-card.dom.test.tsx` (append a describe if the file exists):

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderCard } from "./order-card";
import type { Order } from "@/lib/types";

const base: Order = {
  id: "o1",
  booth_id: "b1",
  order_number: "12",
  customer_name: "Ada",
  items: [],
  status: "preparing",
  total_cents: 450,
  created_at: new Date().toISOString(),
  ready_at: null,
  completed_at: null,
  updated_at: new Date().toISOString(),
  payment_status: "claimed",
  payment_method_kind: "paynow",
  paid_at: null,
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({ update: () => ({ eq: () => ({ error: null }) }) }),
  }),
}));

describe("OrderCard payment", () => {
  it("shows a Confirm payment button for a claimed order", () => {
    render(<OrderCard order={base} />);
    expect(
      screen.getByRole("button", { name: /confirm payment/i }),
    ).toBeInTheDocument();
  });

  it("shows a Paid badge for a confirmed order", () => {
    render(<OrderCard order={{ ...base, payment_status: "confirmed" }} />);
    expect(screen.getByText(/paid/i)).toBeInTheDocument();
  });

  it("shows no payment UI when payment is not required", () => {
    render(<OrderCard order={{ ...base, payment_status: "not_required" }} />);
    expect(
      screen.queryByRole("button", { name: /confirm payment/i }),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/order-card.dom.test.tsx`
Expected: FAIL (no confirm button yet).

- [ ] **Step 3: Implement in `order-card.tsx`**

Add `payment_status` state + a confirm handler near the other handlers:

```ts
const [payStatus, setPayStatus] = useState(order.payment_status);

async function confirmPayment() {
  setUpdating(true);
  const { error } = await supabase
    .from("orders")
    .update({
      payment_status: "confirmed",
      paid_at: new Date().toISOString(),
    })
    .eq("id", order.id);
  if (error) toast.error("Failed to confirm payment");
  else setPayStatus("confirmed");
  setUpdating(false);
}
```

Add a small badge component at the bottom of the file:

```tsx
function PaymentBadge({ status }: { status: Order["payment_status"] }) {
  if (status === "not_required") return null;
  const map = {
    pending: { label: "Unpaid", cls: "bg-secondary text-muted-foreground" },
    claimed: {
      label: "Payment claimed",
      cls: "bg-amber-500/15 text-amber-600",
    },
    confirmed: { label: "Paid", cls: "bg-emerald-500/15 text-emerald-600" },
  } as const;
  const v = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider",
        v.cls,
      )}
    >
      {v.label}
    </span>
  );
}
```

Render the badge in the header's right-hand stack, directly under `<OrderStatusBadge status={status} />`:

```tsx
<PaymentBadge status={payStatus} />
```

Add the confirm button inside the `{!closed && (` action row, before the `<AlertDialog>` (and also allow it to show when closed-but-claimed is not needed — keep it inside the action row for simplicity). Use:

```tsx
{
  payStatus === "claimed" && (
    <Button
      size="sm"
      variant="outline"
      className="h-11 rounded-lg border-emerald-500/40 text-emerald-700"
      onClick={confirmPayment}
      disabled={updating}
    >
      Confirm payment
    </Button>
  );
}
```

- [ ] **Step 4: Run the DOM test to verify pass**

Run: `pnpm exec vitest run src/components/order-card.dom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/order-card.tsx src/components/order-card.dom.test.tsx
git commit -m "feat(payments): payment badge + vendor confirm on order card

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Vendor payment-config section in the booth editor

**Files:**

- Create: `src/app/dashboard/booths/payment-section.tsx`
- Create: `src/app/dashboard/booths/payment-section.dom.test.tsx`
- Modify: `src/app/dashboard/booths/booth-form.tsx` (render the section, include `payment` in submit)
- Modify: the booth save server action (the one `booth-form.tsx` calls — locate via its submit handler; likely `src/app/dashboard/booths/actions.ts`)

**Interfaces:**

- Consumes: `PaymentConfig`, `paymentConfigSchema` (Task 2).
- Produces: a controlled `<PaymentSection value onChange />` editor; booth save validates + persists `booths.payment` (or null).

> **Locate the save action first.** Open `src/app/dashboard/booths/booth-form.tsx`, find the server action it imports for saving (the function receiving `BoothFormInput`). That action and `boothFormSchema` are what you extend. Match its existing validation + return style.

- [ ] **Step 1: Extend `boothFormSchema`**

In `src/lib/schemas.ts`, add to `boothFormSchema`:

```ts
  // Optional BYO payment method; null = queue-only. Reuses paymentConfigSchema.
  payment: paymentConfigSchema.nullable().default(null),
```

- [ ] **Step 2: Write the failing DOM test for the section**

`src/app/dashboard/booths/payment-section.dom.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentSection } from "./payment-section";

describe("PaymentSection", () => {
  it("emits a paynow config when UEN is filled", () => {
    const onChange = vi.fn();
    render(<PaymentSection value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /PayNow/i }));
    fireEvent.change(screen.getByLabelText(/Payee name/i), {
      target: { value: "Cart" },
    });
    fireEvent.change(screen.getByLabelText(/UEN/i), {
      target: { value: "53312345A" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      kind: "paynow",
      payee_name: "Cart",
      uen: "53312345A",
    });
  });

  it("emits null when 'No online payment' is selected", () => {
    const onChange = vi.fn();
    render(
      <PaymentSection
        value={{ kind: "paynow", payee_name: "x", uen: "53312345A" }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /No online payment/i }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm exec vitest run src/app/dashboard/booths/payment-section.dom.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `payment-section.tsx`**

```tsx
"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { PaymentConfig } from "@/lib/types";

type Kind = "none" | "pointer" | "paynow";

function kindOf(v: PaymentConfig | null): Kind {
  if (!v) return "none";
  return v.kind === "stripe" ? "none" : v.kind;
}

export function PaymentSection({
  value,
  onChange,
}: {
  value: PaymentConfig | null;
  onChange: (next: PaymentConfig | null) => void;
}) {
  const kind = kindOf(value);
  const paynow = value?.kind === "paynow" ? value : null;
  const pointer = value?.kind === "pointer" ? value : null;

  function pick(next: Kind) {
    if (next === "none") onChange(null);
    else if (next === "paynow")
      onChange({ kind: "paynow", payee_name: "", uen: "" });
    else onChange({ kind: "pointer", label: "", url: "" });
  }

  return (
    <fieldset className="space-y-4">
      <legend className="font-display text-lg font-semibold">Payments</legend>
      <p className="text-sm text-muted-foreground">
        Optional. Attach your own payment method — customers pay you directly;
        qkit never touches the money.
      </p>

      <div className="space-y-2">
        {(
          [
            ["none", "No online payment"],
            ["paynow", "PayNow QR"],
            ["pointer", "Payment link / QR image"],
          ] as [Kind, string][]
        ).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="payment-kind"
              checked={kind === k}
              onChange={() => pick(k)}
              aria-label={label}
            />
            {label}
          </label>
        ))}
      </div>

      {kind === "paynow" && (
        <div className="space-y-3">
          <div>
            <Label htmlFor="pn-name">Payee name</Label>
            <Input
              id="pn-name"
              value={paynow?.payee_name ?? ""}
              onChange={(e) =>
                onChange({
                  kind: "paynow",
                  payee_name: e.target.value,
                  uen: paynow?.uen,
                  mobile: paynow?.mobile,
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="pn-uen">UEN</Label>
            <Input
              id="pn-uen"
              value={paynow?.uen ?? ""}
              onChange={(e) =>
                onChange({
                  kind: "paynow",
                  payee_name: paynow?.payee_name ?? "",
                  uen: e.target.value || undefined,
                })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Or use a mobile number instead of a UEN in the field above.
          </p>
        </div>
      )}

      {kind === "pointer" && (
        <div className="space-y-3">
          <div>
            <Label htmlFor="pt-label">Button label</Label>
            <Input
              id="pt-label"
              value={pointer?.label ?? ""}
              onChange={(e) =>
                onChange({
                  kind: "pointer",
                  label: e.target.value,
                  url: pointer?.url,
                  qr_image_url: pointer?.qr_image_url,
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="pt-url">Payment link</Label>
            <Input
              id="pt-url"
              value={pointer?.url ?? ""}
              onChange={(e) =>
                onChange({
                  kind: "pointer",
                  label: pointer?.label ?? "",
                  url: e.target.value || undefined,
                  qr_image_url: pointer?.qr_image_url,
                })
              }
            />
          </div>
        </div>
      )}
    </fieldset>
  );
}
```

> Note: `mobile` input is intentionally omitted from v1 UI (UEN covers the stall case); the schema still accepts it. If a mobile field is wanted, add a second `Input` mirroring the UEN handler with `mobile`. Keep YAGNI — UEN only for now.

- [ ] **Step 5: Run the section test to verify pass**

Run: `pnpm exec vitest run src/app/dashboard/booths/payment-section.dom.test.tsx`
Expected: PASS. (If the test's UEN-only expectation conflicts with leftover empty `uen:""`, ensure `pick("paynow")` seeds `uen: ""` and the handler converts `""`→`undefined`; adjust the test's expected object to match the exact emitted shape.)

- [ ] **Step 6: Wire into `booth-form.tsx`**

Add `payment` to the form's default values (`payment: booth?.payment ?? null` — parse via `parsePaymentConfig` if the booth row is raw JSON). Render `<PaymentSection value={...} onChange={...} />` wherever the form keeps section blocks (e.g. after the hours editor), backed by RHF state (`watch("payment")` / `setValue("payment", next, { shouldDirty: true })`). Include `payment` in the payload submitted to the save action.

- [ ] **Step 7: Persist in the save action**

In the booth save action, after `boothFormSchema` validation, include `payment: parsed.data.payment` in the `booths` insert/update object. (Already validated by the schema extension in Step 1.)

- [ ] **Step 8: Typecheck + full lib/dom run**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run src/app/dashboard/booths`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/dashboard/booths/payment-section.tsx src/app/dashboard/booths/payment-section.dom.test.tsx src/app/dashboard/booths/booth-form.tsx src/lib/schemas.ts
# plus the save action file you modified
git commit -m "feat(payments): vendor payment-method editor in booth form

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: RLS regression test

**Files:**

- Modify: `supabase/tests/rls.test.sql`

**Interfaces:**

- Verifies: the anonymous/public role cannot set `payment_status = 'confirmed'`; a vendor can confirm only their own booth's orders; `booths.payment` is publicly readable.

- [ ] **Step 1: Add assertions**

Append to `supabase/tests/rls.test.sql`, following the file's existing pgTAP style (match its existing `set local role`, seed identifiers, and `results_eq`/`throws_ok` helpers). Cover:

```sql
-- booths.payment is exposed via the public booth read (no secrets in it).
-- A pointer/paynow config column is selectable by the anon role.
set local role anon;
-- (select payment from booths where id = <seeded active booth>) succeeds (no error).

-- The anon role cannot flip an order to a confirmed/paid state directly.
-- update orders set payment_status='confirmed' where ... must affect 0 rows
-- (RLS denies the public role any UPDATE on orders).

-- A vendor confirming an order on a booth they do NOT own affects 0 rows.
-- A vendor confirming their OWN booth's claimed order succeeds (1 row).
reset role;
```

Write each as a concrete pgTAP assertion mirroring the existing tests in the file (the executor copies an existing `lives_ok`/`results_eq` block and adapts the SQL). Use the already-seeded vendor + booth identifiers present in the file.

- [ ] **Step 2: Run the RLS suite**

Run: `supabase test db`
Expected: PASS (all assertions, including the new ones).

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls.test.sql
git commit -m "test(payments): RLS — anon can't confirm payment, vendor only own booth

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: E2E — PayNow order → claim → confirm

**Files:**

- Modify: `e2e/customer-order.spec.ts` (or add `e2e/payment-queue.spec.ts`)
- Modify: `supabase/seed/coffee-cart.sql` — give the Kopitiam Cart booth a `paynow` payment method.

**Interfaces:**

- Verifies the end-to-end flow against real Supabase: customer sees a PayNow QR, taps "I've paid", the order shows claimed; (optionally) a signed-in vendor confirms.

- [ ] **Step 1: Seed a payment method**

In `supabase/seed/coffee-cart.sql`, set the Kopitiam Cart booth's `payment` column to a paynow config, e.g.:

```sql
update public.booths
set payment = '{"kind":"paynow","payee_name":"Kopitiam Cart","uen":"53312345A"}'::jsonb
where id = 'c0ffee01-0000-4000-8000-000000000001';
```

(Or add the column to the booth's INSERT if it constructs the row inline.)

- [ ] **Step 2: Extend the customer spec**

Add to the existing test in `e2e/customer-order.spec.ts`, after landing on the status page:

```ts
// Payment seam: the booth has a PayNow method, so a Pay panel appears.
await expect(page.getByText(/scan to pay/i)).toBeVisible();
await page.getByRole("button", { name: /i've paid/i }).click();
await expect(page.getByText(/payment sent/i)).toBeVisible();
```

- [ ] **Step 3: Run e2e (requires local Supabase + reseed)**

Run: re-apply the seed, then `pnpm test:e2e`
Expected: PASS (the new assertions included).

- [ ] **Step 4: Commit**

```bash
git add e2e/customer-order.spec.ts supabase/seed/coffee-cart.sql
git commit -m "test(payments): e2e PayNow pay-panel claim on customer order path

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

- `booths.payment` JSONB union → Task 1 (schema/types), Task 2 (Zod). ✓
- 3 order columns + `payment_status` enum → Task 1. ✓
- Connector interface (`renderCheckout`, `CheckoutView`, adapters) → Task 4; EMVCo builder → Task 3. ✓
- Flow: vendor config → Task 9; customer pay panel + claim → Tasks 6–7; vendor confirm + badge → Task 8. ✓
- RLS: `claimPayment` service action (Task 6), vendor confirm under existing RLS (Task 8), public read of `booths.payment` + RLS test (Task 10). ✓
- placeOrder snapshot → Task 5. ✓
- Migration + types → Task 1; schemas → Task 2. ✓
- Testing: unit (Tasks 3,4 mutation-tested; Task 2), DOM (Tasks 7,8,9), RLS (Task 10), E2E (Task 11). ✓
- Stripe dark slot: schema (`stripeConfigSchema`), adapter throws, UI maps stripe→none. ✓

**Placeholder scan:** Tasks 9 (save-action file) and 10 (pgTAP assertions) reference "locate the existing file/pattern" rather than literal final code, because the exact save-action path and the pgTAP seed identifiers must be read from the codebase at execution time. These are bounded lookups with the pattern named, not open-ended TODOs. Everything else carries complete code.

**Type consistency:** `CheckoutView`, `PaymentConfig`, `PaymentStatus`, `PaymentKind`, `renderCheckout`, `buildPayNowPayload`, `crc16`, `parsePaymentConfig`, `claimPayment`, `paymentConfigSchema` are used with identical signatures across tasks. Pay panel + status page consume `CheckoutView` from `@/lib/payments/adapters`. ✓

## Notes for the implementer

- `payment_status` is **independent** of `order_status`. Cancelling an order does not change payment fields; a refund flow is out of scope (qkit holds no funds).
- The PayNow CRC test pins CRC-16/CCITT-FALSE via the standard `0x29B1` check value — if that test fails, the bug is in `crc16`, not the payload assembly.
- Keep the service-role client out of any client component (Task 6 is `"use server"`).
