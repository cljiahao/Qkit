# qkit Downgrade-Request Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Merqo a way to instantly flip a vendor back to Free on the vendor's own behalf — `POST /api/merqo/downgrade-request` — no admin confirmation, no payment ledger row, clearing any stale pending monthly upgrade request in the process.

**Architecture:** One new route, bearer-authed the same way as the sibling `/api/merqo/vendor-status`, `/api/merqo/metrics`, and `/api/merqo/upgrade-request` routes. Resolves email → vendor row (same two-step lookup as the other two), then branches on the vendor's current `plan` via a pure, unit-tested function; the route itself stays thin HTTP+DB glue, same separation as `resolveUpgradeOutcome`/the upgrade-request route.

**Tech Stack:** Next.js 16 route handler, Supabase service client, Vitest.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore` (AGENTS.md).
- Validate all user input with Zod `safeParse()` at every boundary (AGENTS.md) — the request body's `email` field.
- Use the service-role client only in Server Actions / Route Handlers (AGENTS.md).
- No secrets in `NEXT_PUBLIC_*`.
- Reuse the existing `MERQO_METRICS_SECRET` env var — do not introduce a new secret.
- `bearerOk()` must be copied verbatim from `src/app/api/merqo/metrics/route.ts` (byte-identical — `upgrade-request/route.ts` already does this and is the closer reference for this task).
- The plan update must set `plan: "free"` only — never any other value.
- No `payments` row, no `admin_audit` row — this is a vendor-initiated action, not an admin one (see design spec's Context section for why).
- Idempotent: calling this a second time on an already-free vendor must succeed as a no-op, not error.
- Clearing pending requests is scoped to `kind = "monthly"` only and is best-effort — a failure to clear must not fail the downgrade itself.

---

### Task 1: `resolveDowngradeOutcome` — pure branching logic + test

**Files:**

- Create: `src/lib/merqo-downgrade-request.ts`
- Test: `src/lib/merqo-downgrade-request.test.ts`

**Interfaces:**

- Consumes: nothing (pure function, takes a boolean and a plan string).
- Produces: `type DowngradeOutcome = "not_found" | "already_free" | "downgrade"`; `resolveDowngradeOutcome(hasVendorRow: boolean, currentPlan: "free" | "pro"): DowngradeOutcome` — consumed by Task 2's route handler.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/merqo-downgrade-request.test.ts
import { describe, it, expect } from "vitest";
import { resolveDowngradeOutcome } from "./merqo-downgrade-request";

describe("resolveDowngradeOutcome", () => {
  it("returns not_found when there's no vendor row, regardless of plan", () => {
    expect(resolveDowngradeOutcome(false, "free")).toBe("not_found");
    expect(resolveDowngradeOutcome(false, "pro")).toBe("not_found");
  });

  it("returns already_free when a vendor row exists and is already on free", () => {
    expect(resolveDowngradeOutcome(true, "free")).toBe("already_free");
  });

  it("returns downgrade when a vendor row exists and is on pro", () => {
    expect(resolveDowngradeOutcome(true, "pro")).toBe("downgrade");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/merqo-downgrade-request.test.ts`
Expected: FAIL — `Cannot find module './merqo-downgrade-request'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/merqo-downgrade-request.ts
export type DowngradeOutcome = "not_found" | "already_free" | "downgrade";

/**
 * Whether to flip a vendor to free, treat this call as an idempotent no-op
 * (already free), or reject because the email didn't resolve to an actual
 * vendor. Pure — the route resolves both inputs via DB reads and just
 * carries the decision here.
 */
export function resolveDowngradeOutcome(
  hasVendorRow: boolean,
  currentPlan: "free" | "pro",
): DowngradeOutcome {
  if (!hasVendorRow) return "not_found";
  if (currentPlan === "free") return "already_free";
  return "downgrade";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/merqo-downgrade-request.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/merqo-downgrade-request.ts src/lib/merqo-downgrade-request.test.ts
git commit -m "feat: add resolveDowngradeOutcome for the merqo downgrade-request endpoint"
```

---

### Task 2: `POST /api/merqo/downgrade-request` route

**Files:**

- Create: `src/app/api/merqo/downgrade-request/route.ts`

**Interfaces:**

- Consumes: `resolveDowngradeOutcome` from Task 1 (`src/lib/merqo-downgrade-request.ts`).
- Produces: the HTTP contract Merqo's `requestKitDowngrade` (Merqo plan, separate repo) calls: `POST /api/merqo/downgrade-request` with `Authorization: Bearer <MERQO_METRICS_SECRET>` and JSON body `{email: string}` → `200 {success: true}` (downgraded or already-free), `404 {success: false, error: "..."}` (no matching vendor), `401 {error: "Unauthorized"}` (bad bearer), `400 {error: "..."}` (missing/invalid email), `503 {success: false, error: "..."}` (DB error).

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/merqo/downgrade-request/route.ts
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveDowngradeOutcome } from "@/lib/merqo-downgrade-request";

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

  // Known limitation: listUsers paginates but we only fetch page 1 (1000 users max).
  // Once qkit has >1000 auth users, vendors past this page silently resolve as
  // not_found. TODO: implement pagination to fetch all pages.
  const usersRes = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersRes.error) {
    console.error(
      "merqo downgrade-request: read failed",
      usersRes.error.message,
    );
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  if (usersRes.data?.users.length === 1000) {
    console.error(
      "merqo downgrade-request: listUsers returned a full page (1000) — pagination not implemented, some vendors past this page may resolve as not_found",
    );
  }

  const key = parsed.data.email.toLowerCase();
  const authUser = (usersRes.data?.users ?? []).find(
    (u) => u.email?.toLowerCase() === key,
  );

  const vendorRes = authUser
    ? await supabase
        .from("vendors")
        .select("id, plan")
        .eq("id", authUser.id)
        .maybeSingle()
    : null;
  if (vendorRes?.error) {
    console.error(
      "merqo downgrade-request: read failed",
      vendorRes.error.message,
    );
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  const vendorId = vendorRes?.data?.id ?? null;
  const currentPlan = vendorRes?.data?.plan ?? "free";

  const outcome = resolveDowngradeOutcome(vendorId !== null, currentPlan);

  if (outcome === "not_found") {
    return NextResponse.json(
      { success: false, error: "No matching vendor" },
      { status: 404 },
    );
  }
  if (outcome === "already_free") {
    return NextResponse.json({ success: true });
  }

  if (vendorId === null) {
    return NextResponse.json(
      { success: false, error: "No matching vendor" },
      { status: 404 },
    );
  }

  const updateRes = await supabase
    .from("vendors")
    .update({ plan: "free" })
    .eq("id", vendorId);
  if (updateRes.error) {
    console.error(
      "merqo downgrade-request: update failed",
      updateRes.error.message,
    );
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  // Clear any stale pending monthly request — best-effort, does not fail
  // the downgrade (the plan flip is the operation that matters).
  const clearRes = await supabase
    .from("purchase_requests")
    .update({ status: "resolved" })
    .eq("vendor_id", vendorId)
    .eq("kind", "monthly")
    .eq("status", "pending");
  if (clearRes.error) {
    console.error(
      "merqo downgrade-request: clearing pending requests failed",
      clearRes.error.message,
    );
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Manual verification (no colocated route test — matches the existing `/api/merqo/vendor-status` and `/api/merqo/upgrade-request` routes, neither of which has a route-level test; only the pure branching function is unit-tested per Task 1)**

Run: `pnpm dev`, then in another terminal:

```bash
curl -s -X POST "http://localhost:3000/api/merqo/downgrade-request" \
  -H "Authorization: Bearer $MERQO_METRICS_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email":"a-real-pro-vendor-email@example.com"}'
```

Expected: `{"success":true}` for a real Pro vendor's email (flips `vendors.plan` to `free`, resolves any pending `monthly` `purchase_requests` row). A second identical call still returns `{"success":true}` with `plan` unchanged (already free). For an email with no matching vendor: `{"success":false,"error":"No matching vendor"}` with a `404`.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://localhost:3000/api/merqo/downgrade-request" \
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
git add src/app/api/merqo/downgrade-request/route.ts
git commit -m "feat: add /api/merqo/downgrade-request endpoint for Merqo's cancel-Pro action"
```

---

## Self-Review Notes

- **Spec coverage:** qkit section of the design spec (bearer auth reuse, email→vendor resolution, idempotent already-free check, instant plan flip to free, best-effort clearing of pending `monthly` requests, no payments/audit row, `{success, error?}` contract, 401/400/404/503 status codes) — covered by Tasks 1–2.
- **No placeholders** — every step has complete, runnable code.
- **Type consistency** — `DowngradeOutcome` (Task 1) is the sole input/output of `resolveDowngradeOutcome`, consumed directly in Task 2's route without any adaptation layer. `currentPlan` is typed `"free" | "pro"` matching qkit's `Plan` type (`src/lib/types.ts`) throughout.
