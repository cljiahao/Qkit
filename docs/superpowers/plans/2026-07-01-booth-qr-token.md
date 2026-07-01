# Rotatable Booth QR Token — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each booth a vendor-rotatable access token that gates the customer order entry page, so a saved/stale QR link can be invalidated on demand.

**Architecture:** A random `access_token` column on `booths` (generated in Postgres via pgcrypto). The order entry URL becomes `/order/{boothId}?k={token}`; the page and the `placeOrder` action both hard-block when the token is missing or wrong. A vendor "Regenerate QR" action overwrites the token behind a naming confirmation modal. The live order-status page is deliberately left ungated (keyed on the stable boothId) so in-flight customers are unaffected.

**Tech Stack:** Next.js 16 App Router (async `params`/`searchParams`), TypeScript strict, Supabase (`@supabase/ssr`) + RLS, Postgres pgcrypto, shadcn/ui (alert-dialog), Vitest (node + jsdom), Playwright.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Validate all user input with Zod at every boundary (forms + server actions).
- Authorization lives in RLS policies, not app code. **No RLS policy changes in this feature.**
- Service-role client is server-only; **not used here** — use the normal server client.
- No secrets in `NEXT_PUBLIC_*`. The token is never logged.
- Token: 16 CSPRNG bytes → URL-safe base64 (base64url), padding stripped ≈ 132 bits. Never `Math.random()`.
- After editing the schema, update BOTH `supabase/migrations/` and `src/lib/types.ts`.
- URL shape is exactly `/order/{boothId}?k={token}`. Status page `/order/{boothId}/{orderNumber}` stays ungated.
- Stale/missing token → **hard block** (HTTP 200 screen, no menu, no order form). Copy: `This code expired — ask the booth for the current QR.`
- Clean cutover: a missing `k` is treated as invalid (existing printed QRs must be reprinted).

---

### Task 1: Migration — token generator + `access_token` column

**Files:**

- Create: `supabase/migrations/0025_booth_access_token.sql`
- Modify: `src/lib/types.ts:335-371` (booths Row/Insert/Update)

**Interfaces:**

- Produces: SQL function `public.gen_booth_token() RETURNS text`; column `public.booths.access_token TEXT NOT NULL`; TS type `Booth["access_token"]: string`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0025_booth_access_token.sql`:

```sql
-- Rotatable per-booth QR access token. Gates the customer order entry page so a
-- vendor can invalidate previously printed/saved QR links on demand.

-- pgcrypto provides gen_random_bytes; on Supabase it lives in the extensions schema.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 16 CSPRNG bytes → URL-safe base64 (base64url), padding stripped ≈ 132 bits entropy.
CREATE OR REPLACE FUNCTION public.gen_booth_token()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT translate(
    encode(extensions.gen_random_bytes(16), 'base64'),
    '+/=', '-_'
  );
$$;

-- NOT NULL DEFAULT backfills every existing booth with a fresh token in this
-- migration; new booths get one automatically on insert.
ALTER TABLE public.booths
  ADD COLUMN access_token TEXT NOT NULL DEFAULT public.gen_booth_token();
```

Note: `translate(..., '+/=', '-_')` maps `+`→`-`, `/`→`_`, and `=`→(nothing, since the third target char is absent), which strips base64 padding — the intended base64url form.

- [ ] **Step 2: Apply the migration and verify**

Run: `/supabase-migrate` (or `supabase db reset` against local, then apply).
Expected: migration applies clean; verify with
`select id, length(access_token) as len from public.booths limit 3;`
Every row has a non-null token of length 22 (occasionally 21/22 due to stripped padding — both are fine; do not assert an exact fixed length).

- [ ] **Step 3: Update `src/lib/types.ts`**

In the `booths` table type (around line 335), add `access_token` to all three shapes:

- `Row`: add `access_token: string;`
- `Insert`: add `access_token?: string;` (DB default supplies it)
- `Update`: add `access_token?: string;`

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0025_booth_access_token.sql src/lib/types.ts
git commit -m "feat(qr): add rotatable booth access_token column + generator"
```

---

### Task 2: Pure token helpers (`src/lib/booth-token.ts`)

Single source of truth for token validation and order-URL construction, reused by the page, the action, and the QR poster. Lives in `src/lib` so it is unit- and mutation-tested.

**Files:**

- Create: `src/lib/booth-token.ts`
- Test: `src/lib/booth-token.test.ts`

**Interfaces:**

- Produces:
  - `isTokenValid(expected: string | null | undefined, provided: string | null | undefined): boolean`
  - `orderPath(boothId: string, token: string): string` → `/order/{boothId}?k={encoded token}`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/booth-token.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isTokenValid, orderPath } from "./booth-token";

describe("isTokenValid", () => {
  it("accepts an exact match", () => {
    expect(isTokenValid("abc123", "abc123")).toBe(true);
  });
  it("rejects a mismatch", () => {
    expect(isTokenValid("abc123", "wrong")).toBe(false);
  });
  it("rejects a missing provided token", () => {
    expect(isTokenValid("abc123", undefined)).toBe(false);
    expect(isTokenValid("abc123", null)).toBe(false);
    expect(isTokenValid("abc123", "")).toBe(false);
  });
  it("rejects when the expected token is absent (never allow on empty)", () => {
    expect(isTokenValid(null, "anything")).toBe(false);
    expect(isTokenValid(undefined, "anything")).toBe(false);
    expect(isTokenValid("", "")).toBe(false);
  });
});

describe("orderPath", () => {
  it("builds the entry URL with the token as the k query param", () => {
    expect(orderPath("booth-1", "tok-AB_c")).toBe("/order/booth-1?k=tok-AB_c");
  });
  it("url-encodes the token", () => {
    expect(orderPath("b", "a b")).toBe("/order/b?k=a%20b");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/booth-token.test.ts`
Expected: FAIL — cannot resolve `./booth-token`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/booth-token.ts`:

```ts
/**
 * Booth QR access-token helpers. The token is a rotatable, URL-borne capability
 * that gates the customer order entry page; regenerating it invalidates every
 * previously printed/saved QR for that booth. Pure functions only — shared by
 * the order page, the placeOrder action, and the QR poster (single source of
 * truth for the compare + URL shape).
 */

/**
 * True only when a non-empty provided token exactly matches a non-empty expected
 * token. Empty/absent on either side is always invalid — a booth with no token,
 * or a scan with no `k`, must hard-block (clean cutover).
 */
export function isTokenValid(
  expected: string | null | undefined,
  provided: string | null | undefined,
): boolean {
  if (!expected || !provided) return false;
  return expected === provided;
}

/** The customer order entry URL for a booth: `/order/{boothId}?k={token}`. */
export function orderPath(boothId: string, token: string): string {
  return `/order/${boothId}?k=${encodeURIComponent(token)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/booth-token.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/booth-token.ts src/lib/booth-token.test.ts
git commit -m "feat(qr): pure token validate + order-url helpers"
```

---

### Task 3: Gate the order entry page + block screen

**Files:**

- Modify: `src/app/order/[boothId]/page.tsx`
- Create: `src/app/order/[boothId]/expired-code.tsx` (block screen component)
- Test: `src/app/order/[boothId]/expired-code.dom.test.tsx`

**Interfaces:**

- Consumes: `isTokenValid` (Task 2), `Booth["access_token"]` (Task 1).
- Produces: `ExpiredCode` React component (no props) rendering the hard-block screen.

- [ ] **Step 1: Write the failing DOM test for the block screen**

Create `src/app/order/[boothId]/expired-code.dom.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExpiredCode } from "./expired-code";

describe("ExpiredCode", () => {
  it("shows the expired-code message and no order UI", () => {
    render(<ExpiredCode />);
    expect(screen.getByText(/this code expired/i)).toBeInTheDocument();
    // No menu / order affordances leak onto the block screen.
    expect(screen.queryByRole("button", { name: /place order/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/app/order/[boothId]/expired-code.dom.test.tsx`
Expected: FAIL — cannot resolve `./expired-code`.

- [ ] **Step 3: Create the block screen component**

Create `src/app/order/[boothId]/expired-code.tsx`:

```tsx
import { QrCode } from "lucide-react";

/**
 * Hard-block screen shown when a booth QR link is stale or missing its token.
 * Rendered at HTTP 200 (not a 404) so an honest customer gets a clear next step
 * rather than a dead end. No menu, no order form.
 */
export function ExpiredCode() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-border bg-card">
        <QrCode className="size-6 text-muted-foreground" />
      </div>
      <h1 className="font-display text-2xl font-semibold leading-tight">
        This code expired
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This code expired — ask the booth for the current QR.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/app/order/[boothId]/expired-code.dom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gate the page**

Modify `src/app/order/[boothId]/page.tsx`:

1. Update `Props` to include async `searchParams`:

```tsx
interface Props {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{ k?: string }>;
}
```

2. At the top of the component, await both and read `k`:

```tsx
const { boothId } = await params;
const { k } = await searchParams;
```

3. Add `access_token` to the booth select (the first query in the `Promise.all`):

```tsx
supabase
  .from("booths")
  .select("id, name, image_url, hours, menu_items, access_token")
  .eq("id", boothId)
  .eq("is_active", true)
  .single(),
```

4. Add the imports at the top:

```tsx
import { isTokenValid } from "@/lib/booth-token";
import { ExpiredCode } from "./expired-code";
```

5. Immediately after the existing `if (!booth) notFound();`, add the token gate:

```tsx
// Hard-block a stale/absent QR token. Checked after the booth exists so we
// never confirm-or-deny a booth's existence via the token path any differently
// than the normal not-found path. Status page is intentionally NOT gated.
if (!isTokenValid(booth.access_token, k)) return <ExpiredCode />;
```

6. Pass the token down to `OrderForm` (needed by Task 4). Change the render to:

```tsx
<OrderForm
  boothId={booth.id}
  token={booth.access_token}
  menuItems={available}
  closed={closed}
  remaining={remaining}
/>
```

(The `OrderForm` `token` prop is added in Task 4; if implementing strictly in order, this line will not typecheck until Task 4 Step 3 — commit Task 3 and Task 4 together, or add the prop stub first. See Task 4.)

- [ ] **Step 6: Typecheck + run the order-page tests**

Run: `pnpm exec tsc --noEmit`
Expected: one error about the unknown `token` prop on `OrderForm` — resolved in Task 4. If executing tasks separately, proceed to Task 4 before committing.

- [ ] **Step 7: Commit (with Task 4)**

Commit after Task 4 so the `token` prop exists:

```bash
git add src/app/order/[boothId]/page.tsx src/app/order/[boothId]/expired-code.tsx src/app/order/[boothId]/expired-code.dom.test.tsx
# committed together with Task 4 changes
```

---

### Task 4: Thread token through the form + re-validate in `placeOrder`

Server-side re-validation is the real gate — never trust the page render alone.

**Files:**

- Modify: `src/app/order/[boothId]/order-form.tsx`
- Modify: `src/app/order/[boothId]/actions.ts`
- Test: `src/app/order/[boothId]/actions.token.test.ts` (new unit test for the token guard)

**Interfaces:**

- Consumes: `isTokenValid` (Task 2), `OrderForm` (Task 3 passes `token`).
- Produces: `placeOrder(boothId: string, token: string, input: PlaceOrderInput)` — **note the new 2nd param**. `OrderForm` prop `token: string`.

- [ ] **Step 1: Write the failing test for the action's token guard**

The full `placeOrder` touches Supabase; isolate the guard by asserting a bad token is rejected before any DB work. Create `src/app/order/[boothId]/actions.token.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

// The token guard must reject BEFORE any Supabase call. We mock the server
// client to throw if touched, proving the guard short-circuits first.
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => {
    throw new Error("must not reach Supabase on an invalid token");
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Map() }));

import { placeOrder } from "./actions";

const validInput = {
  customerName: "Ada",
  items: [{ menuItemId: "m1", name: "Kopi", price_cents: 200, quantity: 1 }],
};

describe("placeOrder token guard", () => {
  it("rejects a missing token without touching Supabase", async () => {
    const res = await placeOrder(
      "11111111-1111-1111-1111-111111111111",
      "",
      // @ts-expect-error minimal valid-shaped input for the guard test
      validInput,
    );
    expect(res).toEqual({ success: false, error: expect.any(String) });
  });
});
```

Note: the guard we add rejects an empty/absent token up front. A wrong-but-present token can only be judged against the booth row, so it is validated after the booth fetch (see Step 3) — the empty-token case is what this fast test pins.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/app/order/[boothId]/actions.token.test.ts`
Expected: FAIL — either `placeOrder` has the old 2-arg signature (type/arity) or it reaches the throwing mock.

- [ ] **Step 3: Update `placeOrder`**

Modify `src/app/order/[boothId]/actions.ts`:

1. Add the import:

```ts
import { isTokenValid } from "@/lib/booth-token";
```

2. Change the signature to accept the token as the 2nd argument:

```ts
export async function placeOrder(
  boothId: string,
  token: string,
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
```

3. Right after the `boothIdSchema` check, add an early guard for an empty/absent token (cheap, no DB):

```ts
if (!token)
  return { success: false, error: "This code expired — please rescan." };
```

4. Add `access_token` to the booth `select` in the `Promise.all` (the query currently selecting `"is_active, hours, menu_items, payment"`):

```ts
.select("is_active, hours, menu_items, payment, access_token")
```

5. Immediately after `if (!booth) return { success: false, error: "Booth not found" };`, add the authoritative compare:

```ts
if (!isTokenValid(booth.access_token, token))
  return { success: false, error: "This code expired — please rescan." };
```

- [ ] **Step 4: Update `OrderForm` to carry + send the token**

Modify `src/app/order/[boothId]/order-form.tsx`:

1. Add `token` to `Props`:

```tsx
interface Props {
  boothId: string;
  token: string;
  menuItems: MenuItem[];
  closed?: boolean;
  remaining?: Remaining;
}
```

2. Destructure it:

```tsx
export function OrderForm({
  boothId,
  token,
  menuItems,
  closed = false,
  remaining = {},
}: Props) {
```

3. Update BOTH `placeOrder` calls in `onSubmit` to pass the token as the 2nd arg:

```tsx
result = await placeOrder(boothId, token, input);
```

(There are two calls — the initial and the single retry. Update both.)

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm exec tsc --noEmit && pnpm test -- src/app/order/[boothId]/actions.token.test.ts`
Expected: typecheck PASS (Task 3's `token` prop now resolves); token test PASS.

- [ ] **Step 6: Run the full order-page test set + existing form tests**

Run: `pnpm test -- src/app/order/[boothId]`
Expected: PASS. If `order-form.dom.test.tsx` renders `<OrderForm>` without the new required `token` prop, add `token="test-token"` to those render calls (fix the test, not the prop).

- [ ] **Step 7: Commit (Tasks 3 + 4 together)**

```bash
git add src/app/order/[boothId]/
git commit -m "feat(qr): gate order entry + placeOrder on booth access token"
```

---

### Task 5: QR poster encodes the tokenised URL

**Files:**

- Modify: `src/app/dashboard/booths/[boothId]/qr/page.tsx`
- Modify: `src/app/dashboard/booths/[boothId]/qr/booth-qr-poster.tsx`

**Interfaces:**

- Consumes: `orderPath` (Task 2), `Booth["access_token"]` (Task 1).
- Produces: poster renders a QR whose value is `${origin}${orderPath(boothId, token)}`.

- [ ] **Step 1: Fetch the token in the QR page**

Modify `src/app/dashboard/booths/[boothId]/qr/page.tsx`:

1. Add `access_token` to the select:

```tsx
.select("id, name, is_active, access_token")
```

2. Pass it to the poster:

```tsx
<BoothQrPoster
  boothId={booth.id}
  name={booth.name}
  isActive={booth.is_active}
  token={booth.access_token}
/>
```

- [ ] **Step 2: Build the tokenised URL in the poster**

Modify `src/app/dashboard/booths/[boothId]/qr/booth-qr-poster.tsx`:

1. Add the import:

```tsx
import { orderPath } from "@/lib/booth-token";
```

2. Add `token: string;` to `Props` and destructure it.

3. Change the URL construction from:

```tsx
const url = origin ? `${origin}/order/${boothId}` : null;
```

to:

```tsx
const url = origin ? `${origin}${orderPath(boothId, token)}` : null;
```

Both the `<QRCode value={url}>` and the "type this link" fallback already use `url`, so both now carry `?k=`.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/booths/[boothId]/qr/"
git commit -m "feat(qr): encode booth access token into the QR + fallback link"
```

---

### Task 6: Regenerate action + naming confirmation modal

**Files:**

- Modify: `src/app/dashboard/booths/actions.ts` (add `regenerateBoothToken`)
- Create: `src/app/dashboard/booths/[boothId]/qr/regenerate-button.tsx` (client: button + alert-dialog)
- Modify: `src/app/dashboard/booths/[boothId]/qr/booth-qr-poster.tsx` (render the button)
- Test: `src/app/dashboard/booths/[boothId]/qr/regenerate-button.dom.test.tsx`

**Interfaces:**

- Consumes: `ActionResult` (existing), shadcn `alert-dialog` (`src/components/ui/alert-dialog.tsx`).
- Produces: `regenerateBoothToken(boothId: string): Promise<ActionResult>`; `RegenerateButton({ boothId, boothName }: { boothId: string; boothName: string })`.

- [ ] **Step 1: Add the server action**

In `src/app/dashboard/booths/actions.ts`, add (mirroring `deleteBooth`'s auth + RLS-scoped pattern):

```ts
import { revalidatePath } from "next/cache";
// (add revalidatePath to the existing imports)

/**
 * Rotate a booth's QR access token. RLS (booths_vendor_all) scopes the update to
 * the caller's own booths, so a non-owner updates zero rows and gets "not found"
 * — no cross-vendor leak. Invalidates every previously printed/saved QR link.
 */
export async function regenerateBoothToken(
  boothId: string,
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  // Let the DB generate the new token via the column DEFAULT expression:
  // updating to DEFAULT re-runs gen_booth_token() server-side (never client RNG).
  const { data: updated, error } = await supabase
    .from("booths")
    .update({ access_token: undefined })
    .eq("id", boothId)
    .select("id")
    .maybeSingle();
```

STOP — Supabase's client cannot send SQL `DEFAULT`. Use an RPC instead so the token is generated in Postgres. Replace the update block above with an RPC call, and add the RPC to the migration. Revise as follows:

- In `supabase/migrations/0025_booth_access_token.sql` (Task 1), also add:

```sql
-- Rotate a booth's token to a fresh server-generated value. SECURITY INVOKER
-- (default) so the caller's RLS on booths still applies — a vendor can only
-- rotate their own booth. Returns the number of rows touched (0 = not yours).
CREATE OR REPLACE FUNCTION public.regenerate_booth_token(p_booth_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.booths
     SET access_token = public.gen_booth_token()
   WHERE id = p_booth_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
```

(If Task 1 is already committed, add this in the same file and re-apply, or add migration `0026_regenerate_booth_token.sql` with just this function. Also add `regenerate_booth_token` to the `Functions` section of `src/lib/types.ts` — args `{ p_booth_id: string }`, returns `number`.)

Then the action body becomes:

```ts
export async function regenerateBoothToken(
  boothId: string,
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: rows, error } = await supabase.rpc("regenerate_booth_token", {
    p_booth_id: boothId,
  });
  if (error) return { success: false, error: "Could not regenerate QR" };
  if (!rows) return { success: false, error: "Booth not found" };

  revalidatePath(`/dashboard/booths/${boothId}/qr`);
  return { success: true };
}
```

- [ ] **Step 2: Write the failing DOM test for the button/modal**

Create `src/app/dashboard/booths/[boothId]/qr/regenerate-button.dom.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const regenerate = vi.fn();
vi.mock("../../actions", () => ({
  regenerateBoothToken: (...args: unknown[]) => regenerate(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RegenerateButton } from "./regenerate-button";

beforeEach(() => regenerate.mockReset());

describe("RegenerateButton", () => {
  it("names the booth in the confirmation and calls the action on confirm", async () => {
    regenerate.mockResolvedValue({ success: true });
    render(<RegenerateButton boothId="b-1" boothName="Kopitiam Cart" />);

    await userEvent.click(
      screen.getByRole("button", { name: /regenerate qr/i }),
    );
    // Modal names the specific booth.
    expect(screen.getByText(/Kopitiam Cart/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /regenerate|confirm/i }),
    );
    expect(regenerate).toHaveBeenCalledWith("b-1");
  });

  it("does not call the action when cancelled", async () => {
    render(<RegenerateButton boothId="b-1" boothName="Kopitiam Cart" />);
    await userEvent.click(
      screen.getByRole("button", { name: /regenerate qr/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(regenerate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- src/app/dashboard/booths/[boothId]/qr/regenerate-button.dom.test.tsx`
Expected: FAIL — cannot resolve `./regenerate-button`.

- [ ] **Step 4: Implement the button + modal**

Create `src/app/dashboard/booths/[boothId]/qr/regenerate-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { regenerateBoothToken } from "../../actions";

/**
 * Vendor-only "Regenerate QR" control. Rotating the token invalidates every
 * printed/saved QR for this booth, so the action is gated behind a confirmation
 * that names the booth explicitly (guards against acting on the wrong one).
 */
export function RegenerateButton({
  boothId,
  boothName,
}: {
  boothId: string;
  boothName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await regenerateBoothToken(boothId);
      if (!res.success) {
        toast.error(res.error ?? "Could not regenerate QR");
        return;
      }
      toast.success("New QR generated — reprint to use it.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        className="h-12 w-full rounded-xl text-base font-semibold print:hidden"
        onClick={() => setOpen(true)}
      >
        <RefreshCw className="size-4" /> Regenerate QR
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Regenerate QR for “{boothName}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every printed or saved code for this booth stops working
              immediately — you&apos;ll need to reprint the QR.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // keep the dialog open until the action resolves
                confirm();
              }}
              disabled={pending}
            >
              {pending ? "Regenerating…" : "Regenerate QR"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- src/app/dashboard/booths/[boothId]/qr/regenerate-button.dom.test.tsx`
Expected: PASS. (If the confirm button's accessible name collides with the trigger, tighten the `getByRole` name regex in the test to match the dialog's action label.)

- [ ] **Step 6: Render the button in the poster**

Modify `src/app/dashboard/booths/[boothId]/qr/booth-qr-poster.tsx`: import and render `RegenerateButton` in the action row (below the Print / Download PNG buttons, inside the `print:hidden` controls area):

```tsx
import { RegenerateButton } from "./regenerate-button";
// ...
<div className="mt-3 print:hidden">
  <RegenerateButton boothId={boothId} boothName={name} />
</div>;
```

- [ ] **Step 7: Typecheck + full check**

Run: `pnpm check`
Expected: PASS (prettier + eslint + tsc).

- [ ] **Step 8: Commit**

```bash
git add "src/app/dashboard/booths/" supabase/migrations src/lib/types.ts
git commit -m "feat(qr): vendor regenerate-token action + naming confirm modal"
```

---

### Task 7: E2E smoke — regenerate invalidates the old link

**Files:**

- Modify/Create: an `e2e/` spec extending the coffee-cart flow (e.g. `e2e/qr-token.spec.ts`).

**Interfaces:**

- Consumes: local Supabase + `supabase/seed/coffee-cart.sql` ("Kopitiam Cart" booth), running dev server.

- [ ] **Step 1: Write the E2E spec**

Create `e2e/qr-token.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// Requires local Supabase up + coffee-cart seed (see AGENTS.md E2E section).
test("stale QR token hard-blocks; a valid token orders", async ({ page }) => {
  // Bare link (no token) must hard-block.
  // Resolve the seeded booth id via the app the same way other e2e specs do.
  // (Reuse the helper/fixtures already used by customer-order.spec.ts.)
  const boothId = process.env.E2E_BOOTH_ID!; // set by the e2e bootstrap
  await page.goto(`/order/${boothId}`);
  await expect(page.getByText(/this code expired/i)).toBeVisible();

  // A wrong token also blocks.
  await page.goto(`/order/${boothId}?k=definitely-wrong`);
  await expect(page.getByText(/this code expired/i)).toBeVisible();
});
```

Note: match the existing e2e bootstrap convention in `e2e/customer-order.spec.ts` for obtaining the booth id and a valid token (read from the DB seed or the QR page). If the current e2e harness has no way to read a valid token, assert only the two hard-block cases here and cover the happy path in the existing customer-order spec after wiring the token into its navigation.

- [ ] **Step 2: Run the E2E smoke**

Run (Docker + `supabase start` + seed first, per AGENTS.md): `pnpm test:e2e`
Expected: the new spec PASSES (stale/wrong links show the expired screen).

- [ ] **Step 3: Commit**

```bash
git add e2e/qr-token.spec.ts
git commit -m "test(qr): e2e smoke — stale QR token hard-blocks"
```

---

### Task 8: Full verification + quality gate

**Files:** none (verification only).

- [ ] **Step 1: Run the full project check**

Run: `/next-verify` (typecheck + lint + full test suite).
Expected: all green.

- [ ] **Step 2: Mutation test the new pure logic**

Run: `pnpm test:mutation`
Expected: `src/lib/booth-token.ts` survivors reviewed; kill or justify each (equivalent mutants noted). `isTokenValid`'s empty/mismatch branches should be covered by Task 2 tests.

- [ ] **Step 3: Quality scan (required per spec)**

Invoke `/simplify` (or `/code-review`) over the branch diff and address:

- **Duplication:** confirm token compare + URL build exist ONLY in `src/lib/booth-token.ts` (no inline `?k=` string building or `===` token checks elsewhere).
- **Code smells / debt:** the block-screen copy string appears once; the error copy strings are consistent; no dead code from the plan's mid-task revision (Task 6 Step 1's discarded `DEFAULT` approach must not survive).
- **Coverage:** page gate, action guard, poster URL, and regenerate modal each have a test.

- [ ] **Step 4: Security scan before finishing**

Run: `/security-scan`
Expected: no secret leak (token never in `NEXT_PUBLIC_*` or logs), dependency audit clean.

- [ ] **Step 5: Finish the branch**

Use superpowers:finishing-a-development-branch to merge/PR.

---

## Self-Review (author checklist — completed)

**Spec coverage:**

- Data model + generator → Task 1. ✅
- Token generation (16B base64url) → Task 1 SQL. ✅
- Order entry gate + hard-block screen → Task 3. ✅
- Server-side re-validation in `placeOrder` → Task 4. ✅
- Status page untouched → asserted by omission; no task modifies it. ✅
- QR poster tokenised URL → Task 5. ✅
- Regenerate action + naming confirm modal → Task 6. ✅
- No RLS change → enforced via `booths_vendor_all`/`booths_public_read`; action uses SECURITY INVOKER RPC. ✅
- Testing (unit/DOM/action/e2e) → Tasks 2,3,4,6,7. ✅
- Post-impl quality gate → Task 8. ✅
- Clean cutover (missing k blocks) → `isTokenValid` returns false on empty; Task 2 test pins it. ✅

**Placeholder scan:** no TBD/TODO; all code shown. Task 6 documents a deliberate mid-task correction (client can't send SQL `DEFAULT` → RPC) so the implementer doesn't repeat the dead end. ✅

**Type consistency:** `isTokenValid`/`orderPath` signatures identical across Tasks 2–5; `placeOrder` new 2nd-arg `token` consistent in Tasks 3 (call site) and 4 (definition + form); `regenerateBoothToken(boothId)` consistent Tasks 6. ✅
