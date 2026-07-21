# Arrival Confirmation + Ready-Order Auto-Clear Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three related Phase-1 job-board items in one pass: (1) arrival
confirmation ("scan-to-start") so a perishable-item booth holds prep until the
customer taps arrival, (2) an auto-clear sweep that flips a `ready` order to
`completed` after a vendor-configurable timeout, and (3) a "Restore to ready"
action so the vendor can undo an auto-clear the sweep made prematurely.

**Architecture:** (1) reuses the dormant `pending` order status — no new enum
value — gated by a new per-booth `requires_arrival_confirm` flag; a new
`confirmArrival` customer action flips `pending → preparing`, and the existing
`ADVANCE` map gets a `pending` entry so the vendor's board reuses its existing
advance-button plumbing as a manual override. (2) adds a nullable
`ready_auto_clear_min` to the existing `board_settings` JSONB blob and a
client-polled `sweepReadyOrders` action that does one guarded bulk UPDATE,
scoped by RLS, with no new client-side merge logic (the board's existing
realtime channel already reflects it). (3) adds an `orders.auto_completed`
boolean the sweep sets (and nothing else does), gating a `restoreAutoCompleted`
action and a completed-orders-page-only UI affordance.

**Tech Stack:** Next.js 16 Server Actions, Supabase Postgres (RLS-scoped
mutations, one migration per schema task), Zod, Vitest + RTL/jsdom.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- All user input validated with Zod at the boundary.
- Authorization via RLS/`getUser()`/token-match — never a new app-level check
  substituting for either.
- No secrets in `NEXT_PUBLIC_*`.
- New customer-facing or vendor-facing copy must not use an em dash (`—`) —
  use a period or comma instead. Internal code comments are unaffected.
- Every schema change ships as a new file under `supabase/migrations/`,
  numbered sequentially after the current highest (`0063`).
- Follow this codebase's existing patterns exactly (see file citations in
  each task) rather than introducing new idioms.

---

## Task 1: Migration — `booths.requires_arrival_confirm` + `place_order` branch

**Files:**

- Create: `supabase/migrations/0064_booth_arrival_confirmation.sql`

**Interfaces:**

- Produces: `booths.requires_arrival_confirm boolean not null default false`,
  and `place_order` now inserts new QR orders at `status='pending'` for a
  flagged booth (`'preparing'` unchanged otherwise). `place_walkup_order` is
  NOT touched — walk-up orders always insert at `'preparing'`.

- [ ] **Step 1: Write the migration**

```sql
-- Arrival confirmation ("scan-to-start"): a per-booth toggle for
-- perishable-immediately items (ice cream is the concrete case) — when on,
-- a new QR order is held at 'pending' (the dormant OrderStatus value; every
-- order today skips straight to 'preparing') instead of starting prep right
-- away. The customer's own status page then shows a big "I'm here, start my
-- order" prompt; tapping it (confirmArrival, status-actions.ts) flips the
-- order to 'preparing', the same state every order starts in today. See
-- docs/superpowers/specs/2026-07-21-arrival-confirmation-design.md.
--
-- Walk-up orders (place_walkup_order) are deliberately NOT touched — there's
-- no "customer arrives later" concept for an order the vendor is entering
-- in person at the counter.
ALTER TABLE qkit.booths
  ADD COLUMN requires_arrival_confirm BOOLEAN NOT NULL DEFAULT false;

-- Recreate place_order verbatim from its 0063 body with one change: the
-- INSERT's literal 'preparing' status becomes a CASE on the booth's new flag.
CREATE OR REPLACE FUNCTION qkit.place_order(
  p_short_code      text,
  p_customer_name   text,
  p_items           jsonb,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit
AS $$
DECLARE
  b qkit.booths;
  v_existing_number text;
  v_existing_token uuid;
  v_seq int;
  v_number text;
  v_token uuid;
  v_total int := 0;
  v_priced jsonb := '[]'::jsonb;
  v_expects_payment boolean;
  v_payment_kind text;
  line jsonb;
  menu_item jsonb;
  opt jsonb;
  v_qty int;
  v_price int;
  v_cost int;
  v_delta_price int;
  v_delta_cost int;
  v_option_price_delta int;
  v_option_cost_delta int;
  v_combined_price int;
  v_combined_cost int;
  v_remaining jsonb;
  r record;
BEGIN
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) = 0 THEN
    RAISE EXCEPTION 'ORDER_INVALID: name required';
  END IF;

  IF length(p_customer_name) > 100 THEN
    RAISE EXCEPTION 'ORDER_INVALID: name too long';
  END IF;

  SELECT * INTO b FROM qkit.booths WHERE short_code = p_short_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_EXPIRED: unknown code';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT order_number, access_token INTO v_existing_number, v_existing_token
    FROM qkit.orders
    WHERE booth_id = b.id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'order_number', v_existing_number,
        'booth_id', b.id,
        'access_token', v_existing_token);
    END IF;
  END IF;

  IF NOT qkit.check_rate_limit('order:booth:' || b.id::text, 120, 60) THEN
    RAISE EXCEPTION 'ORDER_RATE_LIMITED: booth flood';
  END IF;

  IF NOT qkit.booth_servable(b.id) THEN
    RAISE EXCEPTION 'ORDER_UNSERVABLE: booth not serving';
  END IF;

  IF NOT qkit.booth_open(b.hours, now()) THEN
    RAISE EXCEPTION 'ORDER_UNSERVABLE: outside opening hours';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ORDER_INVALID: empty cart';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'ORDER_INVALID: too many items';
  END IF;

  FOR line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT mi INTO menu_item
    FROM jsonb_array_elements(b.menu_items) AS mi
    WHERE mi->>'id' = line->>'menuItemId';

    IF menu_item IS NULL OR NOT COALESCE((menu_item->>'available')::boolean, true) THEN
      RAISE EXCEPTION 'ORDER_ITEM_UNAVAILABLE: %', line->>'menuItemId';
    END IF;

    v_qty := GREATEST((line->>'quantity')::int, 0);
    IF v_qty = 0 THEN CONTINUE; END IF;

    IF v_qty > 20 THEN
      RAISE EXCEPTION 'ORDER_INVALID: quantity';
    END IF;

    v_option_price_delta := 0;
    v_option_cost_delta := 0;
    IF line ? 'options' AND jsonb_typeof(line->'options') = 'array' THEN
      IF jsonb_array_length(line->'options') > 20 THEN
        RAISE EXCEPTION 'ORDER_INVALID: too many options';
      END IF;
      FOR opt IN SELECT * FROM jsonb_array_elements(line->'options') LOOP
        SELECT (c->>'price_delta_cents')::int, (c->>'cost_delta_cents')::int
        INTO v_delta_price, v_delta_cost
        FROM jsonb_array_elements(COALESCE(menu_item->'option_groups', '[]'::jsonb)) AS g,
             jsonb_array_elements(g->'choices') AS c
        WHERE g->>'label' = opt->>'group'
          AND c->>'label' = opt->>'choice';

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ORDER_INVALID: unknown option';
        END IF;
        v_option_price_delta := v_option_price_delta + COALESCE(v_delta_price, 0);
        v_option_cost_delta := v_option_cost_delta + COALESCE(v_delta_cost, 0);
      END LOOP;
    END IF;

    v_price := (menu_item->>'price_cents')::int;
    v_cost  := (menu_item->>'cost_cents')::int;
    v_combined_price := COALESCE(v_price, 0) + v_option_price_delta;
    v_combined_cost  := COALESCE(v_cost, 0) + v_option_cost_delta;
    v_total := v_total + v_combined_price * v_qty;

    v_priced := v_priced || jsonb_build_array(
      (line - 'price_cents' - 'cost_cents' - 'name')
      || jsonb_build_object('name', menu_item->>'name')
      || CASE WHEN v_price IS NOT NULL OR v_option_price_delta > 0
           THEN jsonb_build_object('price_cents', v_combined_price)
           ELSE '{}'::jsonb END
      || CASE WHEN v_cost IS NOT NULL OR v_option_cost_delta > 0
           THEN jsonb_build_object('cost_cents', v_combined_cost)
           ELSE '{}'::jsonb END
    );
  END LOOP;

  IF jsonb_array_length(v_priced) = 0 THEN
    RAISE EXCEPTION 'ORDER_INVALID: empty cart';
  END IF;

  v_payment_kind := b.payment->>'kind';
  v_expects_payment := v_payment_kind IS NOT NULL AND v_payment_kind <> 'stripe';

  UPDATE qkit.booths SET order_seq = order_seq + 1
  WHERE id = b.id RETURNING order_seq INTO v_seq;
  v_number := lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');

  v_remaining := qkit.booth_remaining_stock(b.id);
  FOR r IN SELECT menu_item_id AS id, qty AS want
           FROM qkit.order_item_quantities(v_priced) LOOP
    IF v_remaining ? r.id AND r.want > (v_remaining->>r.id)::int THEN
      RAISE EXCEPTION 'ORDER_SOLD_OUT: %', r.id;
    END IF;
  END LOOP;

  INSERT INTO qkit.orders (
    booth_id, order_number, customer_name, items, total_cents,
    status, payment_status, payment_method_kind, idempotency_key
  ) VALUES (
    b.id, v_number, p_customer_name, v_priced, v_total,
    (CASE WHEN b.requires_arrival_confirm THEN 'pending' ELSE 'preparing' END)::qkit.order_status,
    (CASE WHEN v_expects_payment THEN 'pending' ELSE 'not_required' END)::qkit.payment_status,
    CASE WHEN v_expects_payment THEN v_payment_kind ELSE NULL END,
    p_idempotency_key
  )
  ON CONFLICT (booth_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING access_token INTO v_token;

  IF NOT FOUND THEN
    SELECT order_number, access_token INTO v_number, v_token
    FROM qkit.orders
    WHERE booth_id = b.id AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN jsonb_build_object(
    'order_number', v_number,
    'booth_id', b.id,
    'access_token', v_token);
END;
$$;
```

- [ ] **Step 2: Apply the migration locally and confirm the function compiles**

Run: `supabase db reset` (or `supabase migration up` if already following the
project's usual local flow — see `AGENTS.md`'s `/supabase-migrate` skill).
Expected: migration applies with no error; `qkit.place_order` recreated.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0064_booth_arrival_confirmation.sql
git commit -m "$(cat <<'EOF'
db: add booths.requires_arrival_confirm, branch place_order on it

New QR orders on a flagged booth insert at the dormant 'pending' status
instead of 'preparing', holding prep until the customer confirms arrival.
Walk-up orders are untouched.
EOF
)"
```

---

## Task 2: Types + Zod schema for `requires_arrival_confirm`

**Files:**

- Modify: `src/lib/types.ts` (booths `Row`/`Insert`/`Update`)
- Modify: `src/lib/schemas.ts` (`boothFormSchema`)

**Interfaces:**

- Consumes: nothing new.
- Produces: `Booth.requires_arrival_confirm: boolean`;
  `BoothFormInput.requires_arrival_confirm: boolean` (Zod default `false`).

- [ ] **Step 1: Add the column to the `booths` table type**

In `src/lib/types.ts`, in the `booths` table's `Row`, `Insert`, and `Update`
shapes (around line 469-520), add the field to each:

```ts
      booths: {
        Row: {
          id: string;
          vendor_id: string;
          name: string;
          menu_items: Json;
          is_active: boolean;
          image_url: string | null;
          hours: Json | null;
          order_seq: number;
          payment: Json | null;
          created_at: string;
          short_code: string;
          social_links: Json | null;
          requires_arrival_confirm: boolean;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          name: string;
          menu_items?: Json;
          is_active?: boolean;
          image_url?: string | null;
          hours?: Json | null;
          order_seq?: number;
          payment?: Json | null;
          created_at?: string;
          short_code?: string;
          social_links?: Json | null;
          requires_arrival_confirm?: boolean;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          name?: string;
          menu_items?: Json;
          is_active?: boolean;
          image_url?: string | null;
          hours?: Json | null;
          order_seq?: number;
          payment?: Json | null;
          created_at?: string;
          short_code?: string;
          social_links?: Json | null;
          requires_arrival_confirm?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "booths_vendor_id_fkey";
            columns: ["vendor_id"];
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
```

- [ ] **Step 2: Add the field to `boothFormSchema`**

In `src/lib/schemas.ts`, around line 327:

```ts
export const boothFormSchema = z.object({
  boothId: z.string().uuid().optional(),
  name: z.string().min(1, "Booth name is required").max(100),
  image_url: imageUrlString.nullable(),
  is_active: z.boolean(),
  hours: boothHoursSchema.default(null),
  menu_items: z.array(menuItemFormSchema),
  payment: paymentConfigSchema.nullable().default(null),
  social_links: socialLinksSchema.nullable().default(null),
  // Perishable-immediately items (ice cream) — hold prep until the customer
  // confirms arrival on their status page. See migration 0064.
  requires_arrival_confirm: z.boolean().default(false),
});
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors (existing call sites that construct a `BoothFormInput`
literal without this field still compile — it has a Zod default and is a
plain `boolean`, not optional in the inferred type, so any object literal
missing it fails type-check; fix in Task 8, which is the only place that
constructs the candidate object).

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/schemas.ts
git commit -m "$(cat <<'EOF'
feat: add requires_arrival_confirm to booth types and form schema
EOF
)"
```

---

## Task 3: `ADVANCE` map gains `pending → preparing`, badge label update

**Files:**

- Modify: `src/lib/orders.ts:25-30`
- Modify: `src/components/order-status-badge.tsx:6-10`
- Test: `src/lib/orders.test.ts` (add a case if the file already tests
  `ADVANCE`; otherwise this is covered transitively by Task 6/7's tests)

**Interfaces:**

- Produces: `ADVANCE.pending = { next: "preparing", label: "Start now" }` —
  the vendor board's existing `advanceOrder` action and `order-card.tsx`
  button wiring pick this up with zero other code changes.

- [ ] **Step 1: Update the `ADVANCE` map**

In `src/lib/orders.ts`:

```ts
export const ADVANCE: Partial<
  Record<OrderStatus, { next: OrderStatus; label: string }>
> = {
  pending: { next: "preparing", label: "Start now" },
  preparing: { next: "ready", label: "Mark Ready" },
  ready: { next: "completed", label: "Mark Picked Up" },
};
```

- [ ] **Step 2: Update the `pending` badge label**

In `src/components/order-status-badge.tsx`:

```ts
    pending: {
      label: "Waiting for you",
      className:
        "text-status-pending border-status-pending/35 bg-status-pending/12",
    },
```

- [ ] **Step 3: Run the existing suite to confirm nothing depended on the old label/map shape**

Run: `pnpm test -- orders.test order-status-badge`
Expected: PASS (no existing test asserts `ADVANCE.pending` is absent or the
old "Pending" label string — if one does, update it to match, since this is
an intentional behavior change per the design spec).

- [ ] **Step 4: Commit**

```bash
git add src/lib/orders.ts src/components/order-status-badge.tsx
git commit -m "$(cat <<'EOF'
feat: vendor board can start an arrival-pending order manually

ADVANCE gains pending -> preparing ("Start now"), reusing the board's
existing advance-button plumbing for the vendor-override case. Badge
label updated to describe what pending now means.
EOF
)"
```

---

## Task 4: `confirmArrival` customer action

**Files:**

- Modify: `src/app/order/[boothId]/[orderNumber]/status-actions.ts`
- Test: `src/app/order/[boothId]/[orderNumber]/status-actions.test.ts`

**Interfaces:**

- Consumes: `parseOrderRef` (`@/lib/schemas`), `clientIp`/`rateLimit`
  (`@/lib/rate-limit`), `createServiceClient` (`@/lib/supabase/server`),
  `headers` (`next/headers`).
- Produces: `confirmArrival(boothId: string, orderNumber: string, token:
string): Promise<ActionResult>` — flips `pending → preparing`.

- [ ] **Step 1: Write the failing test**

Append to `status-actions.test.ts` (the file's existing `chain()` helper
doesn't support `.update()`, so this suite needs its own mock shape — add a
new top-level `describe` block with its own `vi.mock` setup mirroring
`payment-actions.test.ts`'s `claimPayment` tests exactly):

```ts
import { confirmArrival } from "./status-actions";
```

(add to the existing top import line)

```ts
describe("confirmArrival", () => {
  const {
    createServiceClientMock2,
    update2,
    writeSelect2,
    reread2,
    rateLimitMock2,
  } = vi.hoisted(() => {
    const writeSelect2 = vi.fn();
    const reread2 = vi.fn();
    const update2 = vi.fn(() => ({
      eq: () => ({
        eq: () => ({ eq: () => ({ eq: () => ({ select: writeSelect2 }) }) }),
      }),
    }));
    const select2 = () => ({
      eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: reread2 }) }) }),
    });
    return {
      createServiceClientMock2: vi.fn(() =>
        Promise.resolve({ from: () => ({ update: update2, select: select2 }) }),
      ),
      update2,
      writeSelect2,
      reread2,
      rateLimitMock2: vi.fn(),
    };
  });

  beforeEach(() => {
    createServiceClientMock.mockImplementation(createServiceClientMock2);
    update2.mockClear();
    writeSelect2
      .mockReset()
      .mockResolvedValue({ data: [{ id: "o1" }], error: null });
    reread2.mockReset().mockResolvedValue({ data: null });
    rateLimitMock2.mockReset().mockResolvedValue(true);
  });

  it("starts a pending order (update runs, returns success)", async () => {
    const res = await confirmArrival(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
    expect(update2).toHaveBeenCalledWith({ status: "preparing" });
  });

  it("rejects an invalid booth id before creating the client", async () => {
    const res = await confirmArrival("not-a-uuid", ORDER, TOKEN);
    expect(res).toEqual({ success: false, error: "Invalid booth" });
    expect(update2).not.toHaveBeenCalled();
  });

  it("reports a failure when the update errors", async () => {
    writeSelect2.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await confirmArrival(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Could not start your order. Try again.",
    });
  });

  it("stays idempotent on a double-tap (0 rows, already preparing)", async () => {
    writeSelect2.mockResolvedValue({ data: [], error: null });
    reread2.mockResolvedValue({ data: { status: "preparing" } });
    const res = await confirmArrival(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
  });

  it("reports a refresh when the order is not actually pending (0 rows)", async () => {
    writeSelect2.mockResolvedValue({ data: [], error: null });
    reread2.mockResolvedValue({ data: { status: "cancelled" } });
    const res = await confirmArrival(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Could not start your order. Try again.",
    });
  });
});
```

This test file's top-level mock already covers `@/lib/rate-limit` and
`next/headers`? No — `status-actions.ts` doesn't currently import either, so
add both mocks near the top of the file, alongside the existing
`createServiceClient` mock:

```ts
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => rateLimitMockRef(...args),
  clientIp: () => "1.2.3.4",
}));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve({}) }));
```

Since `vi.mock` factories can't close over a `describe`-scoped `vi.hoisted`
easily across two independent mocks in one file, simplify: hoist
`rateLimitMockRef` at file top level (next to the existing
`createServiceClientMock`/`fromMock` hoist) instead of inside the new
`describe`, and reuse it directly in `confirmArrival`'s tests. Rewrite the
new block's hoisted object to drop `rateLimitMock2` and use the file-level
one, defaulting it to `mockResolvedValue(true)` in the top-level
`beforeEach` alongside the existing resets.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- status-actions.test.ts -t confirmArrival`
Expected: FAIL with "confirmArrival is not a function" / import error.

- [ ] **Step 3: Implement `confirmArrival`**

Add near the top of `status-actions.ts`:

```ts
import { headers } from "next/headers";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/action-result";
```

Append the function (after `getOrderStatus`, before `getWaitEstimate` or
after it — either is fine, group with `getOrderStatus` since both key off
`status`):

```ts
/**
 * Customer-triggered arrival confirmation: flips a booth-gated order from
 * 'pending' (see migration 0064's place_order branch) to 'preparing',
 * starting prep. Token-gated and rate-limited exactly like claimPayment
 * (payment-actions.ts) — both are unauthenticated, customer-initiated state
 * flips on the same order row.
 */
export async function confirmArrival(
  boothId: string,
  orderNumber: string,
  token: string,
): Promise<ActionResult> {
  const parsed = parseOrderRef(boothId, orderNumber, token);
  if (!parsed.ok)
    return {
      success: false,
      error: parsed.field === "booth" ? "Invalid booth" : "Invalid order",
    };

  const supabase = await createServiceClient();

  const ip = clientIp(await headers());
  const allowed = await rateLimit(supabase, `arrival:${boothId}:${ip}`, 10, 60);
  if (!allowed)
    return { success: false, error: "Too many attempts. Wait a moment." };

  const { data: rows, error } = await supabase
    .from("orders")
    .update({ status: "preparing" })
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .eq("status", "pending")
    .select("id");
  if (error) {
    console.error("confirmArrival failed", error.message);
    return { success: false, error: "Could not start your order. Try again." };
  }
  if (rows && rows.length > 0) return { success: true };

  // Re-read to distinguish a harmless double-tap (already preparing — the
  // vendor may have hit "Start now" first) from a genuine problem.
  const { data: cur } = await supabase
    .from("orders")
    .select("status")
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .maybeSingle();
  if (cur && cur.status !== "pending" && cur.status !== "cancelled")
    return { success: true };
  return { success: false, error: "Could not start your order. Try again." };
}
```

Note the re-read branch: unlike `claimPayment` (which treats "already
claimed" as success and "cancelled" as a distinct message), here any
non-`pending`, non-`cancelled` status (i.e. already `preparing` or beyond)
counts as success (idempotent double-tap); a genuinely missing order,
cancelled order, or still-`pending` order (guard raced and lost for a
reason other than "already started") reports the generic failure message —
matches the test cases above.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- status-actions.test.ts`
Expected: PASS, including all pre-existing `getOrderStatus`/`getWaitEstimate`
tests (unaffected).

- [ ] **Step 5: Commit**

```bash
git add "src/app/order/[boothId]/[orderNumber]/status-actions.ts" "src/app/order/[boothId]/[orderNumber]/status-actions.test.ts"
git commit -m "$(cat <<'EOF'
feat: add confirmArrival customer action

Flips a pending order to preparing when the customer taps arrival on
their status page. Token-gated and rate-limited like claimPayment.
EOF
)"
```

---

## Task 5: Customer status page — arrival-confirm blocking state

**Files:**

- Modify: `src/app/order/[boothId]/[orderNumber]/order-status-poller.tsx`
- Test: `src/app/order/[boothId]/[orderNumber]/order-status-poller.dom.test.tsx`

**Interfaces:**

- Consumes: `confirmArrival` (Task 4), `useAsyncAction` (`@/hooks/
use-async-action`), `Button` (`@/components/ui/button`).

- [ ] **Step 1: Write the failing test**

Add to the top mock block in `order-status-poller.dom.test.tsx`:

```ts
const { getOrderStatus, getWaitEstimate, confirmArrival, alerts } = vi.hoisted(
  () => ({
    getOrderStatus: vi.fn(),
    getWaitEstimate: vi.fn(),
    confirmArrival: vi.fn(),
    alerts: {
      isNotifySupported: vi.fn(() => true),
      notifyPermission: vi.fn((): NotificationPermission | null => "default"),
      requestNotifyPermission: vi.fn(
        async () => "granted" as NotificationPermission,
      ),
      fireReadyNotification: vi.fn(async () => undefined),
      playReadyChime: vi.fn(async () => true),
      unlockAudio: vi.fn(),
    },
  }),
);

vi.mock("./status-actions", () => ({
  getOrderStatus,
  getWaitEstimate,
  confirmArrival,
}));
vi.mock("@/lib/order-alerts", () => alerts);
```

(replaces the existing smaller hoisted block — same shape plus
`confirmArrival`.) Add to the existing `beforeEach`:

```ts
confirmArrival.mockResolvedValue({ success: true });
```

Add a new `describe` block at the end of the file:

```ts
describe("OrderStatusPoller — arrival confirmation", () => {
  it("shows the arrival prompt instead of the progress bar when pending", async () => {
    getOrderStatus.mockResolvedValue("pending");
    renderPoller("pending");
    expect(
      await screen.findByRole("button", { name: /i'm here/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/estimated wait/i)).not.toBeInTheDocument();
  });

  it("calls confirmArrival and shows the progress view on success", async () => {
    getOrderStatus.mockResolvedValue("pending");
    renderPoller("pending");
    const user = userEvent.setup();
    const btn = await screen.findByRole("button", { name: /i'm here/i });
    getOrderStatus.mockResolvedValue("preparing");
    await user.click(btn);
    expect(confirmArrival).toHaveBeenCalledWith("b1", "0007", "tok");
    await waitFor(() =>
      expect(
        screen.getByText("Your order is being prepared"),
      ).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- order-status-poller.dom.test.tsx -t "arrival confirmation"`
Expected: FAIL — no button with that accessible name exists yet.

- [ ] **Step 3: Implement the blocking `pending` view**

In `order-status-poller.tsx`, update imports:

```ts
import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/use-async-action";
import { toast } from "sonner";
```

(add `Button`, `useAsyncAction`, `toast` to the existing import list) and:

```ts
import {
  getOrderStatus,
  getWaitEstimate,
  confirmArrival,
} from "./status-actions";
```

Update `STATUS_MESSAGE.pending` (it was unreachable filler copy — every
order previously skipped straight to `preparing`, so this is the first time
it's actually shown, in the early-return branch's own copy below, not this
line, but keep the map entry accurate for consistency):

```ts
const STATUS_MESSAGE: Record<OrderStatus, string> = {
  pending: "Waiting for you to arrive",
  confirmed: "Your order has been confirmed",
  preparing: "Your order is being prepared",
  ready: "Your order is ready for pickup!",
  completed: "Order complete, enjoy!",
  cancelled: "Your order was cancelled",
};
```

Inside the component, add the async-action hook alongside the existing
state (near `const [nowMs, setNowMs] = useState...`):

```ts
const { pending: confirming, run: runConfirmArrival } = useAsyncAction();

function onConfirmArrival() {
  return runConfirmArrival(async () => {
    const res = await confirmArrival(boothId, orderNumber, token);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    setStatus("preparing");
  });
}
```

Immediately before the component's final `return (`, insert the early
return for the blocking state:

```ts
  if (status === "pending") {
    return (
      <div className="space-y-5 px-6 py-6 text-center">
        <div className="flex justify-center">
          <OrderStatusBadge status={status} />
        </div>
        <p className="font-display text-xl font-semibold">
          We start making it fresh once you&apos;re at the counter.
        </p>
        <p className="text-sm text-muted-foreground">
          Tap below when you arrive to pick up.
        </p>
        <Button
          type="button"
          size="lg"
          className="h-14 w-full rounded-xl text-base font-semibold"
          onClick={onConfirmArrival}
          disabled={confirming}
        >
          {confirming ? "Starting…" : "I'm here, start my order"}
        </Button>
      </div>
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- order-status-poller.dom.test.tsx`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
git add "src/app/order/[boothId]/[orderNumber]/order-status-poller.tsx" "src/app/order/[boothId]/[orderNumber]/order-status-poller.dom.test.tsx"
git commit -m "$(cat <<'EOF'
feat: big blocking arrival-confirm prompt on the customer status page

Replaces the progress bar/wait estimate with a full-width "I'm here"
button while an order is pending, so the discoverability problem
(customer not knowing to signal arrival) can't be scrolled past.
EOF
)"
```

---

## Task 6: Booth settings toggle end-to-end

**Files:**

- Modify: `src/app/dashboard/booths/booth-form.tsx`
- Modify: `src/app/dashboard/booths/actions.ts` (`saveBooth`'s `row` object)
- Modify: `src/app/dashboard/booths/[boothId]/page.tsx`
- Test: `src/app/dashboard/booths/actions.test.ts`

**Interfaces:**

- Consumes: `boothFormSchema` (Task 2).
- Produces: a vendor can toggle `requires_arrival_confirm` from the booth
  edit form; `saveBooth` persists it.

- [ ] **Step 1: Write the failing test**

Add to `actions.test.ts`, inside the `describe("saveBooth entitlement
enforcement", ...)` block (or a new adjacent `describe` — either works;
adding a new block keeps this change isolated):

```ts
describe("saveBooth — requires_arrival_confirm", () => {
  it("passes the arrival-confirm flag through to the stored row", async () => {
    await saveBooth(makeBooth({ requires_arrival_confirm: true }));
    expect(h.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ requires_arrival_confirm: true }),
    );
  });

  it("defaults to false when omitted", async () => {
    await saveBooth(makeBooth());
    expect(h.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ requires_arrival_confirm: false }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/app/dashboard/booths/actions.test.ts -t arrival-confirm`
Expected: FAIL — `insertSpy` was called without `requires_arrival_confirm`
(the `row` object in `saveBooth` doesn't include it yet).

- [ ] **Step 3: Wire it through `saveBooth`**

In `src/app/dashboard/booths/actions.ts`, extend the `row` object (around
line 154-162):

```ts
const row = {
  name: data.name,
  image_url: data.image_url,
  is_active: data.is_active,
  hours,
  menu_items,
  payment: data.payment,
  social_links: data.social_links,
  requires_arrival_confirm: data.requires_arrival_confirm,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/app/dashboard/booths/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the toggle to `BoothForm`**

In `src/app/dashboard/booths/booth-form.tsx`, add to the `Props.initial`
type (around line 51-60):

```ts
  initial?: {
    boothId: string;
    name: string;
    image_url: string | null;
    is_active: boolean;
    hours: BoothHours;
    menu_items: MenuItemFormInput[];
    payment: PaymentConfig | null;
    social_links: SocialLinks | null;
    requires_arrival_confirm: boolean;
  };
```

Add state (near `const [isActive, setIsActive] = useState...`):

```ts
const [requiresArrivalConfirm, setRequiresArrivalConfirm] = useState(
  initial?.requires_arrival_confirm ?? false,
);
```

Include it in the submit candidate (in `onSubmit`, alongside `is_active`):

```ts
const candidate = {
  boothId: initial?.boothId,
  name,
  image_url: imageUrl,
  is_active: isActive,
  hours,
  menu_items: items.map((it) => ({
    ...it,
    option_groups: sanitizeOptionGroups(it.option_groups),
  })),
  payment,
  social_links: socialLinks,
  requires_arrival_confirm: requiresArrivalConfirm,
};
```

Add the toggle UI inside the "Hours & availability" `Section`, right after
the `WorkingHoursEditor`:

```tsx
            <WorkingHoursEditor
              value={hours}
              onChange={setHours}
              entitlement={entitlement}
            />

            <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <Checkbox
                checked={requiresArrivalConfirm}
                onCheckedChange={(checked) =>
                  setRequiresArrivalConfirm(checked === true)
                }
              />
              <span className="text-sm">
                <span className="font-medium">
                  Hold prep until the customer arrives
                </span>
                <span className="block text-muted-foreground">
                  For items made fresh per order, like ice cream. The order
                  waits until the customer taps &quot;I&apos;m here&quot; on
                  their status page.
                </span>
              </span>
            </label>
```

- [ ] **Step 6: Wire the edit page's read**

In `src/app/dashboard/booths/[boothId]/page.tsx`, extend the `.select(...)`
call and the `initial` object:

```ts
const { data: booth } = await supabase
  .from("booths")
  .select(
    "id, name, image_url, is_active, hours, menu_items, payment, social_links, requires_arrival_confirm",
  )
  .eq("id", boothId)
  .maybeSingle();
```

```tsx
        initial={{
          boothId: booth.id,
          name: booth.name,
          image_url: booth.image_url,
          is_active: booth.is_active,
          hours: parseBoothHours(booth.hours),
          menu_items: menuItems,
          payment: parsePaymentConfig(booth.payment),
          social_links: booth.social_links
            ? parseSocialLinks(booth.social_links)
            : null,
          requires_arrival_confirm: booth.requires_arrival_confirm,
        }}
```

- [ ] **Step 7: Typecheck and run the booth-form/booths test suites**

Run: `pnpm exec tsc --noEmit && pnpm test -- booths`
Expected: both pass. `new/page.tsx` (create-booth) renders `BoothForm` with
no `initial` at all, so it's unaffected — the state defaults to `false`.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/booths/booth-form.tsx src/app/dashboard/booths/actions.ts "src/app/dashboard/booths/[boothId]/page.tsx" src/app/dashboard/booths/actions.test.ts
git commit -m "$(cat <<'EOF'
feat: expose the arrival-confirm toggle in the booth settings form
EOF
)"
```

---

## Task 7: Migration — `orders.auto_completed` + `board_settings.ready_auto_clear_min`

**Files:**

- Create: `supabase/migrations/0065_ready_auto_clear.sql`

**Interfaces:**

- Produces: `orders.auto_completed boolean not null default false`;
  `vendors.board_settings` gains `ready_auto_clear_min` (default `3`,
  backfilled onto every existing row, same pattern as migration 0062).

- [ ] **Step 1: Write the migration**

```sql
-- Ready-order auto-clear (Phase 1 job board PR-E1): a vendor-configurable
-- timeout after which a 'ready' order that was never manually marked picked
-- up auto-flips to 'completed', so a forgotten ticket doesn't clutter the
-- board indefinitely. Default 3 minutes (conservative — see the job board's
-- own reasoning against the originally-floated 15s), vendor-tunable in
-- /dashboard/settings; null disables the sweep entirely.
--
-- auto_completed distinguishes a sweep-driven completion from a vendor's own
-- manual "Mark Picked Up" tap — set true ONLY by sweepReadyOrders
-- (order-actions.ts), reset false by restoreAutoCompleted or a fresh manual
-- advance. Gates the "Restore to ready" affordance on the completed-orders
-- page, which must not appear on an order the vendor genuinely completed
-- themselves.
ALTER TABLE qkit.orders
  ADD COLUMN auto_completed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE qkit.vendors
  ALTER COLUMN board_settings SET DEFAULT
    '{"aging_min":5,"overdue_min":10,"sound_id":"chime","desktop_notify":false,"undo_seconds":4,"daily_order_number_reset":false,"default_prep_minutes":null,"ready_auto_clear_min":3}'::jsonb;

UPDATE qkit.vendors
  SET board_settings = board_settings
    || '{"ready_auto_clear_min":3}'::jsonb
  WHERE NOT (board_settings ? 'ready_auto_clear_min');
```

- [ ] **Step 2: Apply the migration locally**

Run: `supabase db reset`
Expected: applies cleanly.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0065_ready_auto_clear.sql
git commit -m "$(cat <<'EOF'
db: add orders.auto_completed and board_settings.ready_auto_clear_min

Backfills the new board_settings key onto every existing vendor row,
same pattern as migration 0062.
EOF
)"
```

---

## Task 8: Types + Zod schema for `auto_completed` / `ready_auto_clear_min`

**Files:**

- Modify: `src/lib/types.ts` (`BoardSettings`, `DEFAULT_BOARD_SETTINGS`,
  `orders` `Row`/`Insert`/`Update`)
- Modify: `src/lib/schemas.ts` (`boardSettingsSchema`)

**Interfaces:**

- Produces: `BoardSettings.ready_auto_clear_min: number | null`;
  `Order.auto_completed: boolean`.

- [ ] **Step 1: Extend `BoardSettings` and its default**

In `src/lib/types.ts`:

```ts
export type BoardSettings = {
  aging_min: number;
  overdue_min: number;
  sound_id: SoundId;
  desktop_notify: boolean;
  undo_seconds: number;
  daily_order_number_reset: boolean;
  default_prep_minutes: number | null;
  // Minutes a 'ready' order can sit uncollected before it auto-flips to
  // 'completed' (sweepReadyOrders, order-actions.ts). null disables the
  // sweep. Default 3 — see migration 0065.
  ready_auto_clear_min: number | null;
};

export const DEFAULT_BOARD_SETTINGS: BoardSettings = {
  aging_min: 5,
  overdue_min: 10,
  sound_id: "chime",
  desktop_notify: false,
  daily_order_number_reset: false,
  default_prep_minutes: null,
  undo_seconds: 4,
  ready_auto_clear_min: 3,
};
```

- [ ] **Step 2: Add `auto_completed` to the `orders` table type**

In `src/lib/types.ts`'s `orders` table (around line 521-590), add to `Row`,
`Insert`, and `Update`:

```ts
      orders: {
        Row: {
          id: string;
          booth_id: string;
          order_number: string;
          customer_name: string;
          items: Json;
          status: OrderStatus;
          total_cents: number;
          payment_status: PaymentStatus;
          payment_method_kind: PaymentKind | null;
          paid_at: string | null;
          created_at: string;
          ready_at: string | null;
          completed_at: string | null;
          updated_at: string;
          idempotency_key: string | null;
          access_token: string;
          priority_bumped_at: string | null;
          source: OrderSource;
          auto_completed: boolean;
        };
        Insert: {
          id?: string;
          booth_id: string;
          order_number: string;
          customer_name: string;
          items: Json;
          status?: OrderStatus;
          total_cents: number;
          payment_status?: PaymentStatus;
          payment_method_kind?: PaymentKind | null;
          paid_at?: string | null;
          created_at?: string;
          ready_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
          idempotency_key?: string | null;
          access_token?: string;
          priority_bumped_at?: string | null;
          source?: OrderSource;
          auto_completed?: boolean;
        };
        Update: {
          id?: string;
          booth_id?: string;
          order_number?: string;
          customer_name?: string;
          items?: Json;
          status?: OrderStatus;
          total_cents?: number;
          payment_status?: PaymentStatus;
          payment_method_kind?: PaymentKind | null;
          paid_at?: string | null;
          created_at?: string;
          ready_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
          idempotency_key?: string | null;
          access_token?: string;
          priority_bumped_at?: string | null;
          source?: OrderSource;
          auto_completed?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "orders_booth_id_fkey";
            columns: ["booth_id"];
            referencedRelation: "booths";
            referencedColumns: ["id"];
          },
        ];
      };
```

- [ ] **Step 3: Extend `boardSettingsSchema`**

In `src/lib/schemas.ts` (around line 439-460):

```ts
export const boardSettingsSchema = z
  .object({
    aging_min: z.number().int().min(1).max(240),
    overdue_min: z.number().int().min(1).max(240),
    sound_id: z.enum(["chime", "bell", "ding", "horn", "triple", "none"]),
    desktop_notify: z.boolean(),
    undo_seconds: z.number().int().min(2).max(15),
    daily_order_number_reset: z.boolean(),
    default_prep_minutes: z.number().int().min(1).max(60).nullable(),
    // null = the auto-clear sweep is off. 1-60min mirrors default_prep_minutes'
    // bound rationale — generous headroom against a fat-fingered value.
    ready_auto_clear_min: z.number().int().min(1).max(60).nullable(),
  })
  .refine((d) => d.overdue_min > d.aging_min, {
    message: "Overdue must be later than amber",
    path: ["overdue_min"],
  });
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: errors surface at every object literal that builds a
`BoardSettings`/`Order` without the new required field — this is expected
and fixed in this task's remaining steps plus Tasks 9-13 (test fixtures).
Fix any you find in this task's own files now; leave test-fixture fixes for
their owning tasks below.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/schemas.ts
git commit -m "$(cat <<'EOF'
feat: add ready_auto_clear_min and orders.auto_completed to types/schema
EOF
)"
```

---

## Task 9: `BOARD_ORDER_COLUMNS` gains `auto_completed`

**Files:**

- Modify: `src/lib/orders.ts:7-8`

**Interfaces:**

- Produces: every order read that uses `BOARD_ORDER_COLUMNS` (live board
  initial load + realtime resync, completed-orders page) now selects
  `auto_completed` — same mechanism migration 0057's `priority_bumped_at`
  used, no other plumbing needed.

- [ ] **Step 1: Add the column**

```ts
export const BOARD_ORDER_COLUMNS =
  "id, booth_id, order_number, customer_name, items, status, total_cents, payment_status, payment_method_kind, paid_at, created_at, ready_at, completed_at, updated_at, idempotency_key, priority_bumped_at, source, auto_completed" as const;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors from this file (the constant's type is a plain
string literal — consumers derive their row shape from the `Database` type
in Task 8, not from parsing this string).

- [ ] **Step 3: Commit**

```bash
git add src/lib/orders.ts
git commit -m "$(cat <<'EOF'
feat: select auto_completed in every board order read
EOF
)"
```

---

## Task 10: `sweepReadyOrders` + `restoreAutoCompleted` actions

**Files:**

- Modify: `src/app/dashboard/order-actions.ts`
- Test: `src/app/dashboard/order-actions.test.ts`

**Interfaces:**

- Consumes: `getUser` (`@/lib/supabase/get-user`), `createServerClient`
  (`@/lib/supabase/server`), `boardSettingsSchema` (`@/lib/schemas`).
- Produces: `sweepReadyOrders(): Promise<void>`,
  `restoreAutoCompleted(orderId: string): Promise<StatusResult>`.

- [ ] **Step 1: Write the failing tests**

Add to `order-actions.test.ts`. `restoreAutoCompleted` reuses the file's
existing `maybeSingle`/`update`/`updateSelect` mock (its guarded UPDATE is
`.eq("id").eq("status").select("id")` — the same 2-`eq` shape `advanceOrder`
already uses), so add its `describe` block using the existing fixtures:

```ts
describe("restoreAutoCompleted", () => {
  it("restores an auto-cleared order back to ready", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "completed",
        payment_status: "not_required",
        auto_completed: true,
      },
    });
    const res = await restoreAutoCompleted(ID);
    expect(res).toEqual({ success: true, status: "ready" });
    expect(update).toHaveBeenCalledWith({
      status: "ready",
      completed_at: null,
      auto_completed: false,
    });
  });

  it("rejects an order the vendor completed manually", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "completed",
        payment_status: "not_required",
        auto_completed: false,
      },
    });
    const res = await restoreAutoCompleted(ID);
    expect(res.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an order that isn't completed at all", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "ready",
        payment_status: "not_required",
        auto_completed: false,
      },
    });
    const res = await restoreAutoCompleted(ID);
    expect(res.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a refresh when the order changed concurrently (0 rows)", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "completed",
        payment_status: "not_required",
        auto_completed: true,
      },
    });
    updateSelect.mockResolvedValue({ data: [], error: null });
    const res = await restoreAutoCompleted(ID);
    expect(res).toEqual({
      success: false,
      error: "Order changed — please refresh.",
    });
  });
});
```

`sweepReadyOrders` touches a different table (`vendors`, then a bulk
`orders` update with no id, chained with `.lt(...)` instead of a second
`.eq(...)` + `.select(...)`) than every existing test in this file, so the
shared mock needs two changes: `from(...)` must branch on the table name,
and the `orders` branch's `update(...)` return value must expose both
continuations an existing action's chain needs (`.eq().eq().select(...)`)
and the sweep's chain needs (`.eq().lt(...)`). Replace the file's existing
top-of-file `vi.hoisted`/`vi.mock("@/lib/supabase/server", ...)` block with:

```ts
const {
  getUserMock,
  maybeSingle,
  update,
  updateSelect,
  vendorSingle,
  sweepLt,
} = vi.hoisted(() => {
  const updateSelect = vi.fn();
  const sweepLt = vi.fn();
  const vendorSingle = vi.fn();
  return {
    getUserMock: vi.fn(),
    maybeSingle: vi.fn(),
    update: vi.fn(() => ({
      eq: () => ({
        eq: () => ({ select: updateSelect }),
        lt: sweepLt,
      }),
    })),
    updateSelect,
    vendorSingle,
    sweepLt,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () =>
    Promise.resolve({
      from: (table: string) => {
        if (table === "vendors")
          return {
            select: () => ({ eq: () => ({ maybeSingle: vendorSingle }) }),
          };
        return {
          select: () => ({ eq: () => ({ maybeSingle }) }),
          update,
        };
      },
    }),
}));
```

Every existing test's assertion (`expect(update).toHaveBeenCalledWith(...)`
followed by reading `updateSelect`'s resolved value) is unaffected — those
calls only ever use the `.eq().eq().select(...)` branch, which is unchanged
from today. Update the shared `beforeEach` to also reset the two new mocks:

```ts
beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ id: "v1" });
  maybeSingle.mockReset();
  update.mockClear();
  updateSelect
    .mockReset()
    .mockResolvedValue({ data: [{ id: ID }], error: null });
  vendorSingle.mockReset().mockResolvedValue({
    data: { board_settings: { ready_auto_clear_min: 3 } },
  });
  sweepLt.mockReset().mockResolvedValue({ error: null });
});
```

Import both new functions on the file's existing top import line, then add:

```ts
describe("sweepReadyOrders", () => {
  it("sweeps ready orders older than the vendor's configured minutes", async () => {
    await sweepReadyOrders();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", auto_completed: true }),
    );
    expect(sweepLt).toHaveBeenCalledWith("ready_at", expect.any(String));
  });

  it("does nothing when the vendor has disabled the sweep (null)", async () => {
    vendorSingle.mockResolvedValue({
      data: { board_settings: { ready_auto_clear_min: null } },
    });
    await sweepReadyOrders();
    expect(sweepLt).not.toHaveBeenCalled();
  });

  it("does nothing when not signed in", async () => {
    getUserMock.mockResolvedValue(null);
    await sweepReadyOrders();
    expect(vendorSingle).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- order-actions.test.ts`
Expected: FAIL — `restoreAutoCompleted`/`sweepReadyOrders` aren't exported
yet.

- [ ] **Step 3: Implement both actions**

In `src/app/dashboard/order-actions.ts`, extend `loadOwnOrder`'s select to
include `auto_completed`:

```ts
async function loadOwnOrder(orderId: string) {
  const user = await getUser();
  if (!user) return { supabase: null, order: null } as const;

  const supabase = await createServerClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, payment_status, auto_completed")
    .eq("id", orderId)
    .maybeSingle();
  if (error) console.error("loadOwnOrder failed", error.message);
  return { supabase, order } as const;
}
```

Add the import for `boardSettingsSchema`:

```ts
import { boardSettingsSchema } from "@/lib/schemas";
```

Append `restoreAutoCompleted` (near `revertOrderAdvance`, since both are
"undo a completion" actions, though independent of each other):

```ts
/**
 * Restore an order the auto-clear sweep completed prematurely back to
 * 'ready'. Deliberately narrower than revertOrderAdvance — this is a fresh
 * page load with no client-held prior state (the completed-orders history
 * page, not the live board's short undo window) — and only ever applies to
 * a sweep-driven completion (auto_completed=true), never a vendor's own
 * manual "Mark Picked Up" tap.
 */
export async function restoreAutoCompleted(
  orderId: string,
): Promise<StatusResult> {
  if (!idSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, order } = await loadOwnOrder(orderId);
  if (!supabase || !order) return { success: false, error: "Order not found" };
  if (order.status !== "completed" || !order.auto_completed)
    return { success: false, error: "This order can't be restored" };

  const { data: rows, error } = await supabase
    .from("orders")
    .update({ status: "ready", completed_at: null, auto_completed: false })
    .eq("id", orderId)
    .eq("status", "completed")
    .select("id");
  if (error) {
    console.error("restoreAutoCompleted failed", error.message);
    return { success: false, error: "Failed to restore order" };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed — please refresh." };

  return { success: true, status: "ready" };
}

/**
 * Auto-clear sweep: flips every 'ready' order older than the vendor's
 * configured ready_auto_clear_min (board_settings) to 'completed'. No id
 * param — bulk, RLS-scoped to the caller's own booths (orders_vendor_update)
 * exactly like every other mutation here. Called on a client poll (see
 * realtime-order-board.tsx) rather than a DB cron job, matching this
 * codebase's existing usePolling pattern. Returns void: this is a background
 * sweep the caller doesn't surface a toast for — a real failure is logged,
 * and the next poll simply retries.
 */
export async function sweepReadyOrders(): Promise<void> {
  const user = await getUser();
  if (!user) return;

  const supabase = await createServerClient();
  const { data: vendor } = await supabase
    .from("vendors")
    .select("board_settings")
    .eq("id", user.id)
    .maybeSingle();
  const settings = boardSettingsSchema.safeParse(vendor?.board_settings);
  const minutes = settings.success ? settings.data.ready_auto_clear_min : null;
  if (minutes === null) return;

  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
  const { error } = await supabase
    .from("orders")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      auto_completed: true,
    })
    .eq("status", "ready")
    .lt("ready_at", cutoff);
  if (error) console.error("sweepReadyOrders failed", error.message);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- order-actions.test.ts`
Expected: PASS, including every pre-existing test in the file (the
`from(table)` branch added in Step 1 must not change behavior for the
`"orders"`-table tests already there).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/order-actions.ts src/app/dashboard/order-actions.test.ts
git commit -m "$(cat <<'EOF'
feat: add sweepReadyOrders and restoreAutoCompleted actions

sweepReadyOrders bulk-completes stale ready orders per the vendor's
board_settings.ready_auto_clear_min. restoreAutoCompleted lets a vendor
undo a sweep-driven completion specifically (never a manual one).
EOF
)"
```

---

## Task 11: Wire the sweep into the live board

**Files:**

- Modify: `src/app/dashboard/realtime-order-board.tsx`

**Interfaces:**

- Consumes: `sweepReadyOrders` (Task 10), `usePolling` (`@/hooks/
use-polling`).

- [ ] **Step 1: Add the import**

```ts
import { usePolling } from "@/hooks/use-polling";
import { sweepReadyOrders } from "./order-actions";
```

- [ ] **Step 2: Add the polling tick**

Place near the component's other `useEffect`/hook calls (after the
`useRealtimeOrders` call, since it doesn't depend on `orders`):

```ts
// Auto-clear sweep for stale 'ready' orders (board_settings.
// ready_auto_clear_min) — a plain periodic tick, not tied to any local
// state. The board's own realtime channel (useRealtimeOrders above)
// already reflects whatever this flips, so no client-side merge is
// needed here.
usePolling(
  useCallback(async () => {
    await sweepReadyOrders();
  }, []),
  { intervalMs: 30_000, enabled: boardSettings.ready_auto_clear_min != null },
);
```

- [ ] **Step 3: Typecheck and run the board's test suite**

Run: `pnpm exec tsc --noEmit && pnpm test -- realtime-order-board`
Expected: both pass (the board's existing tests don't assert anything about
polling calls, so this is additive and shouldn't break them; if any test
mocks `./order-actions` without `sweepReadyOrders`, add it to that mock's
returned object as `vi.fn()` so the import doesn't resolve to `undefined`).

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/realtime-order-board.tsx
git commit -m "$(cat <<'EOF'
feat: poll the ready-order auto-clear sweep from the live board
EOF
)"
```

---

## Task 12: Settings form — `ready_auto_clear_min` input

**Files:**

- Modify: `src/app/dashboard/settings/settings-form.tsx`
- Test: `src/app/dashboard/settings/settings-form.dom.test.tsx`

**Interfaces:**

- Consumes: `boardSettingsSchema` (Task 8), `updateBoardSettings` (existing,
  unchanged — already saves the full JSONB blob generically).

- [ ] **Step 1: Update the test fixture and write the failing test**

In `settings-form.dom.test.tsx`, add the new field to the `DEFAULTS` fixture
(required now that the type demands it):

```ts
const DEFAULTS: BoardSettings = {
  aging_min: 5,
  overdue_min: 10,
  sound_id: "chime",
  desktop_notify: false,
  undo_seconds: 4,
  daily_order_number_reset: false,
  default_prep_minutes: null,
  ready_auto_clear_min: 3,
};
```

Add a new test (find the existing `describe`/render helper in the file —
mirror its pattern for an input in the "Board timing" section, e.g. the
existing `undo-seconds` test):

```ts
it("saves a changed ready-auto-clear minutes value", async () => {
  render(
    <TooltipProvider>
      <SettingsForm initial={DEFAULTS} />
    </TooltipProvider>,
  );
  const user = userEvent.setup();
  const input = screen.getByLabelText(/auto-clear a ready order after/i);
  await user.clear(input);
  await user.type(input, "5");
  await user.click(screen.getByRole("button", { name: /save timing/i }));
  expect(updateBoardSettings).toHaveBeenCalledWith(
    expect.objectContaining({ ready_auto_clear_min: 5 }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- settings-form.dom.test.tsx -t "ready-auto-clear"`
Expected: FAIL — no such labelled input exists yet.

- [ ] **Step 3: Add the field to `SettingsForm`**

In `settings-form.tsx`, add state near `undoSeconds`:

```ts
const [readyAutoClearMin, setReadyAutoClearMin] = useState(
  initial.ready_auto_clear_min != null
    ? String(initial.ready_auto_clear_min)
    : "",
);
```

Include it in `currentSettings()`:

```ts
function currentSettings() {
  return {
    aging_min: Number(agingMin),
    overdue_min: Number(overdueMin),
    sound_id: soundId,
    desktop_notify: desktopNotify,
    undo_seconds: Number(undoSeconds),
    daily_order_number_reset: dailyReset,
    default_prep_minutes:
      defaultPrepMin.trim() === "" ? null : Number(defaultPrepMin),
    ready_auto_clear_min:
      readyAutoClearMin.trim() === "" ? null : Number(readyAutoClearMin),
  };
}
```

Add it to `thresholdsUnchanged`:

```ts
const thresholdsUnchanged =
  agingMin === String(initial.aging_min) &&
  overdueMin === String(initial.overdue_min) &&
  undoSeconds === String(initial.undo_seconds) &&
  readyAutoClearMin ===
    (initial.ready_auto_clear_min != null
      ? String(initial.ready_auto_clear_min)
      : "");
```

Add the input to the "Board timing" `Section`, inside its `grid` alongside
`aging-min`/`overdue-min`/`undo-seconds`:

```tsx
<div className="space-y-2">
  <Label htmlFor="ready-auto-clear-min" className={FORM_LABEL_CLASS}>
    Auto-clear a ready order after
  </Label>
  <div className="flex items-center gap-2">
    <Input
      id="ready-auto-clear-min"
      type="number"
      min={1}
      max={60}
      placeholder="Off"
      value={readyAutoClearMin}
      onChange={(e) => setReadyAutoClearMin(e.target.value)}
      className="h-11 rounded-xl"
      aria-invalid={!!thresholdError}
      aria-describedby={thresholdError ? "threshold-error" : undefined}
    />
    <span className="text-sm text-muted-foreground">min</span>
  </div>
</div>
```

Update the `Section`'s `description` prop to mention it:

```tsx
        <Section
          icon={<Clock className="size-5" />}
          title="Board timing"
          description="How fast a waiting ticket changes color, how long staff have to undo an accidental tap, and whether a forgotten ready order clears itself."
        >
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- settings-form.dom.test.tsx`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/settings/settings-form.tsx src/app/dashboard/settings/settings-form.dom.test.tsx
git commit -m "$(cat <<'EOF'
feat: vendor-configurable ready-order auto-clear timeout in settings
EOF
)"
```

---

## Task 13: "Restore to ready" on the completed-orders page

**Files:**

- Modify: `src/components/order-card.tsx`
- Test: `src/components/order-card.dom.test.tsx`

**Interfaces:**

- Consumes: `restoreAutoCompleted` (Task 10).

- [ ] **Step 1: Update the test fixture and write the failing test**

In `order-card.dom.test.tsx`, add `auto_completed: false` to `makeOrder`'s
default object (required now that `Order` demands it):

```ts
function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    booth_id: "b1",
    order_number: "0007",
    customer_name: "Ada",
    items: [{ menuItemId: "m1", name: "Kopi", price_cents: 350, quantity: 2 }],
    status: "preparing",
    total_cents: 700,
    payment_status: "not_required",
    payment_method_kind: null,
    paid_at: null,
    created_at: new Date(0).toISOString(),
    ready_at: null,
    completed_at: null,
    updated_at: new Date(0).toISOString(),
    idempotency_key: null,
    access_token: "tok-test",
    priority_bumped_at: null,
    source: "qr",
    auto_completed: false,
    ...overrides,
  };
}
```

Add `restoreAutoCompleted` to the file's mocked action module:

```ts
const {
  advanceOrder,
  confirmOrderPayment,
  cancelOrder,
  bumpOrder,
  revertOrderAdvance,
  restoreAutoCompleted,
} = vi.hoisted(() => ({
  advanceOrder: vi.fn(),
  confirmOrderPayment: vi.fn(),
  cancelOrder: vi.fn(),
  bumpOrder: vi.fn(),
  revertOrderAdvance: vi.fn(),
  restoreAutoCompleted: vi.fn(),
}));

vi.mock("@/app/dashboard/order-actions", () => ({
  advanceOrder,
  confirmOrderPayment,
  cancelOrder,
  bumpOrder,
  revertOrderAdvance,
  restoreAutoCompleted,
}));
```

Add `restoreAutoCompleted.mockReset()` and a default resolved value
(`{ success: true, status: "ready" }`) to the file's existing `beforeEach`.
Add a new `describe` block:

```ts
describe("OrderCard — restore auto-completed", () => {
  it("shows Restore to ready only for a sweep-completed order", () => {
    render(
      <TooltipProvider>
        <OrderCard
          order={makeOrder({ status: "completed", auto_completed: true })}
        />
      </TooltipProvider>,
    );
    expect(
      screen.getByRole("button", { name: /restore to ready/i }),
    ).toBeInTheDocument();
  });

  it("hides the button for a manually completed order", () => {
    render(
      <TooltipProvider>
        <OrderCard
          order={makeOrder({ status: "completed", auto_completed: false })}
        />
      </TooltipProvider>,
    );
    expect(
      screen.queryByRole("button", { name: /restore to ready/i }),
    ).not.toBeInTheDocument();
  });

  it("calls restoreAutoCompleted and updates the badge on success", async () => {
    render(
      <TooltipProvider>
        <OrderCard
          order={makeOrder({ status: "completed", auto_completed: true })}
        />
      </TooltipProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /restore to ready/i }));
    expect(restoreAutoCompleted).toHaveBeenCalledWith("o1");
    await waitFor(() =>
      expect(screen.getByText("Ready")).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- order-card.dom.test.tsx -t "restore auto-completed"`
Expected: FAIL — no such button renders yet.

- [ ] **Step 3: Implement the restore button**

In `order-card.tsx`, add the import:

```ts
import {
  advanceOrder,
  bumpOrder,
  cancelOrder as cancelOrderAction,
  confirmOrderPayment,
  revertOrderAdvance,
  restoreAutoCompleted,
} from "@/app/dashboard/order-actions";
```

Add the handler alongside the component's other action functions (near
`bump`):

```ts
function restoreToReady() {
  return run(async () => {
    const res = await restoreAutoCompleted(order.id);
    if (!res.success) toast.error(res.error);
    else setStatus(res.status);
  });
}
```

Add the button, gated on `closed && !pendingUndo && order.auto_completed`
(the existing undo-window button already covers the `pendingUndo` case, so
this must not double-render there). Insert it as a sibling condition right
after the existing `{(!closed || pendingUndo) && (...)}` action-row block
(same indentation level, inside the `<div className="mt-auto">` wrapper):

```tsx
{
  closed && !pendingUndo && order.auto_completed && (
    <div className="flex gap-2 px-4 pb-4">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-11 flex-1 rounded-lg font-semibold"
        onClick={restoreToReady}
        disabled={updating}
      >
        <Undo2 className="size-4" /> Restore to ready
      </Button>
    </div>
  );
}
```

`Undo2` is already imported (used by the existing undo-window button).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- order-card.dom.test.tsx`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
git add src/components/order-card.tsx src/components/order-card.dom.test.tsx
git commit -m "$(cat <<'EOF'
feat: let a vendor restore a sweep-completed order back to ready

Scoped strictly to auto_completed orders — a manually completed order
never shows this affordance.
EOF
)"
```

---

## Task 14: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full check + test suite**

Run: `pnpm check && pnpm test`
Expected: both exit 0. Fix anything red before proceeding — do not skip or
disable a check.

- [ ] **Step 2: Update relevant READMEs**

The AI harness's PostToolUse hook flags folders whose `README.md` may now be
stale. At minimum, check and update:

- `src/app/order/[boothId]/[orderNumber]/README.md` — mention
  `confirmArrival` and the pending-state UI branch.
- `src/app/dashboard/booths/README.md` — mention
  `requires_arrival_confirm`.
- `src/app/dashboard/order-actions.ts` has no dedicated README (folder-level
  README is `src/app/dashboard/README.md`) — check whether it documents
  individual actions; if so, add `sweepReadyOrders`/`restoreAutoCompleted`.
- `src/app/dashboard/settings/README.md` — mention the new timing field.
- `supabase/migrations/README.md` — add entries for `0064`/`0065` if this
  file maintains a running list (check its existing format first).

- [ ] **Step 3: Add a changelog entry**

Use the `/changelog` skill (`.claude/skills/changelog`) to append an entry
under `[Unreleased]` in `CHANGELOG.md` summarizing all three features in
plain, human-readable language — no em dashes.

- [ ] **Step 4: Commit any README/changelog updates**

```bash
git add -A
git commit -m "$(cat <<'EOF'
docs: update READMEs and changelog for arrival-confirm and auto-clear
EOF
)"
```
