# qkit Upgrade-Request Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Merqo a way to file a monthly-Pro upgrade request on a vendor's behalf — `POST /api/merqo/upgrade-request` — mirroring what `requestUpgrade("monthly")` already does when the vendor clicks it themselves on qkit's own `/dashboard/plan` page.

**Architecture:** One new route, bearer-authed the same way as the sibling `/api/merqo/vendor-status` and `/api/merqo/metrics` routes. The route resolves an email to a vendor row (same two-step lookup as vendor-status: email → `auth.users` id → `qkit.vendors` row), then checks for an existing pending `monthly` `purchase_requests` row before inserting one — the branching is a pure, unit-tested function; the route itself stays thin HTTP+DB glue.

**Tech Stack:** Next.js 16 route handler, Supabase service client, Vitest.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore` (AGENTS.md).
- Validate all user input with Zod `safeParse()` at every boundary (AGENTS.md) — the request body's `email` field.
- Use the service-role client only in Server Actions / Route Handlers (AGENTS.md).
- No secrets in `NEXT_PUBLIC_*`.
- Reuse the existing `MERQO_METRICS_SECRET` env var — do not introduce a new secret.
- `bearerOk()` must be copied verbatim from `src/app/api/merqo/metrics/route.ts` (byte-identical — the existing `/api/merqo/vendor-status/route.ts` already does this and is the closer reference for this task).
- The insert must use `kind: "monthly"` only — never `"event"`.
- Idempotent: a pending `monthly` request for the same vendor must not create a second row.

---

### Task 1: `resolveUpgradeOutcome` — pure branching logic + test

**Files:**

- Create: `src/lib/merqo-upgrade-request.ts`
- Test: `src/lib/merqo-upgrade-request.test.ts`

**Interfaces:**

- Consumes: nothing (pure function, takes two booleans).
- Produces: `type UpgradeOutcome = "not_found" | "already_pending" | "create"`; `resolveUpgradeOutcome(hasVendorRow: boolean, hasPendingRequest: boolean): UpgradeOutcome` — consumed by Task 2's route handler.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/merqo-upgrade-request.test.ts
import { describe, it, expect } from "vitest";
import { resolveUpgradeOutcome } from "./merqo-upgrade-request";

describe("resolveUpgradeOutcome", () => {
  it("returns not_found when there's no vendor row, regardless of pending state", () => {
    expect(resolveUpgradeOutcome(false, false)).toBe("not_found");
    expect(resolveUpgradeOutcome(false, true)).toBe("not_found");
  });

  it("returns already_pending when a vendor row exists and a pending request already exists", () => {
    expect(resolveUpgradeOutcome(true, true)).toBe("already_pending");
  });

  it("returns create when a vendor row exists and no pending request exists", () => {
    expect(resolveUpgradeOutcome(true, false)).toBe("create");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/merqo-upgrade-request.test.ts`
Expected: FAIL — `Cannot find module './merqo-upgrade-request'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/merqo-upgrade-request.ts
export type UpgradeOutcome = "not_found" | "already_pending" | "create";

/**
 * Whether to create a new monthly upgrade request, treat this call as an
 * idempotent no-op (a pending one already exists), or reject because the
 * email didn't resolve to an actual vendor. Pure — the route resolves both
 * booleans via DB reads and just carries the decision here.
 */
export function resolveUpgradeOutcome(
  hasVendorRow: boolean,
  hasPendingRequest: boolean,
): UpgradeOutcome {
  if (!hasVendorRow) return "not_found";
  if (hasPendingRequest) return "already_pending";
  return "create";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/merqo-upgrade-request.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/merqo-upgrade-request.ts src/lib/merqo-upgrade-request.test.ts
git commit -m "feat: add resolveUpgradeOutcome for the merqo upgrade-request endpoint"
```

---

### Task 2: `POST /api/merqo/upgrade-request` route

**Files:**

- Create: `src/app/api/merqo/upgrade-request/route.ts`

**Interfaces:**

- Consumes: `resolveUpgradeOutcome` from Task 1 (`src/lib/merqo-upgrade-request.ts`).
- Produces: the HTTP contract Merqo's `requestKitUpgrade` (Merqo plan, separate repo) calls: `POST /api/merqo/upgrade-request` with `Authorization: Bearer <MERQO_METRICS_SECRET>` and JSON body `{email: string}` → `200 {success: true}` (created or already-pending), `404 {success: false, error: "..."}` (no matching vendor), `401 {error: "Unauthorized"}` (bad bearer), `400 {error: "..."}` (missing/invalid email), `503 {success: false, error: "..."}` (DB error).

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/merqo/upgrade-request/route.ts
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveUpgradeOutcome } from "@/lib/merqo-upgrade-request";

export const revalidate = 0;

// Verbatim copy of api/merqo/metrics/route.ts's bearerOk — keep in lockstep.
function bearerOk(request: Request): boolean {
  const secret = process.env.MERQO_METRICS_SECRET;
  // never allow an unset secret to authorize
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  // Constant-time compare so the endpoint doesn't leak the secret one byte at a
  // time via response timing. timingSafeEqual requires equal-length buffers, so
  // gate on length first (length is not itself sensitive here).
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

const bodySchema = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  if (!bearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const supabase = await createServiceClient();

  const usersRes = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersRes.error) {
    console.error("merqo upgrade-request: read failed", usersRes.error.message);
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  const key = parsed.data.email.toLowerCase();
  const authUser = (usersRes.data?.users ?? []).find(
    (u) => u.email?.toLowerCase() === key,
  );

  const vendorRes = authUser
    ? await supabase
        .from("vendors")
        .select("id")
        .eq("id", authUser.id)
        .maybeSingle()
    : null;
  if (vendorRes?.error) {
    console.error(
      "merqo upgrade-request: read failed",
      vendorRes.error.message,
    );
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  const vendorId = vendorRes?.data?.id ?? null;

  const pendingRes = vendorId
    ? await supabase
        .from("purchase_requests")
        .select("id")
        .eq("vendor_id", vendorId)
        .eq("kind", "monthly")
        .eq("status", "pending")
        .limit(1)
        .maybeSingle()
    : null;
  if (pendingRes?.error) {
    console.error(
      "merqo upgrade-request: read failed",
      pendingRes.error.message,
    );
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  const outcome = resolveUpgradeOutcome(vendorId !== null, !!pendingRes?.data);

  if (outcome === "not_found") {
    return NextResponse.json(
      { success: false, error: "No matching vendor" },
      { status: 404 },
    );
  }
  if (outcome === "already_pending") {
    return NextResponse.json({ success: true });
  }

  const insertRes = await supabase
    .from("purchase_requests")
    .insert({ vendor_id: vendorId, kind: "monthly" });
  if (insertRes.error) {
    console.error(
      "merqo upgrade-request: insert failed",
      insertRes.error.message,
    );
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Manual verification (no colocated route test — matches the existing `/api/merqo/vendor-status` and `/api/merqo/metrics` routes, neither of which has a route-level test; only the pure branching function is unit-tested per Task 1)**

Run: `pnpm dev`, then in another terminal:

```bash
curl -s -X POST "http://localhost:3000/api/merqo/upgrade-request" \
  -H "Authorization: Bearer $MERQO_METRICS_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email":"a-real-vendor-email@example.com"}'
```

Expected: `{"success":true}` for a real vendor's email (creates a `pending`/`monthly` row in `purchase_requests` on first call; a second identical call still returns `{"success":true}` with no second row). For an email with no matching vendor: `{"success":false,"error":"No matching vendor"}` with a `404`.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://localhost:3000/api/merqo/upgrade-request" \
  -H "Content-Type: application/json" -d '{"email":"a@x.com"}'
```

Expected: `401` (no bearer header)

- [ ] **Step 3: Run full verification**

Run: `pnpm check`
Expected: prettier/eslint/tsc all clean

Run: `pnpm vitest run`
Expected: all tests pass (including Task 1's new tests)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/merqo/upgrade-request/route.ts
git commit -m "feat: add /api/merqo/upgrade-request endpoint for Merqo's self-serve toggle"
```

---

## Self-Review Notes

- **Spec coverage:** qkit section of the design spec (bearer auth reuse, email→vendor resolution, idempotent pending-check, `kind: "monthly"` only, `{success, error?}` contract, 401/400/404/503 status codes) — covered by Tasks 1–2.
- **No placeholders** — every step has complete, runnable code.
- **Type consistency** — `UpgradeOutcome` (Task 1) is the sole input/output of `resolveUpgradeOutcome`, consumed directly in Task 2's route without any adaptation layer.
