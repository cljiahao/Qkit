# qkit Vendor-Status Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Merqo a way to ask qkit "is `<email>` an active vendor, and what plan?" over HTTP, so Merqo can auto-discover vendors who signed up directly on qkit.

**Architecture:** One new route, `GET /api/merqo/vendor-status`, guarded by the same constant-time bearer check already used by `/api/merqo/metrics`. The route resolves the query-string email to an `auth.users` id via the admin API (qkit's `vendors` table has no email column), then looks that id up in `qkit.vendors`. The id/plan resolution logic is extracted into a pure, unit-testable function; the route itself stays a thin HTTP wrapper (matching how `computeMerqoMetrics` is tested but the metrics route itself isn't).

**Tech Stack:** Next.js 16 route handler, Supabase service client, Vitest.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore` (AGENTS.md).
- Validate all user input with Zod `safeParse()` at every boundary (AGENTS.md) — the `email` query param must be validated before use.
- Use the service-role client only in Server Actions / Route Handlers (AGENTS.md).
- No secrets in `NEXT_PUBLIC_*`.
- Reuse the existing `MERQO_METRICS_SECRET` env var — do not introduce a new secret.
- `bearerOk()` must be copied verbatim from `src/app/api/merqo/metrics/route.ts` (byte-identical, per that file's own pattern of being the canonical source other repos port from).

---

### Task 1: `resolveVendorStatus` — pure lookup logic + test

**Files:**

- Create: `src/lib/merqo-vendor-status.ts`
- Test: `src/lib/merqo-vendor-status.test.ts`

**Interfaces:**

- Consumes: nothing (pure function, takes plain data).
- Produces: `resolveVendorStatus(email: string, authUsers: {id: string; email: string | null}[], vendors: {id: string; plan: Plan}[]): VendorStatus` — used by Task 2's route handler. `Plan` is imported from `@/lib/types` (already `"free" | "pro"`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/merqo-vendor-status.test.ts
import { describe, it, expect } from "vitest";
import { resolveVendorStatus } from "./merqo-vendor-status";

const authUsers = [
  { id: "u1", email: "alice@example.com" },
  { id: "u2", email: "BOB@Example.com" },
];
const vendors = [{ id: "u1", plan: "pro" as const }];

describe("resolveVendorStatus", () => {
  it("active + plan when the email's auth user has a vendors row", () => {
    const r = resolveVendorStatus("alice@example.com", authUsers, vendors);
    expect(r).toEqual({ active: true, plan: "pro" });
  });

  it("matches email case-insensitively", () => {
    const r = resolveVendorStatus("bob@example.com", authUsers, [
      { id: "u2", plan: "free" as const },
    ]);
    expect(r).toEqual({ active: true, plan: "free" });
  });

  it("inactive when no auth user matches the email", () => {
    const r = resolveVendorStatus("nobody@example.com", authUsers, vendors);
    expect(r).toEqual({ active: false, plan: null });
  });

  it("inactive when the auth user exists but has no vendors row", () => {
    const r = resolveVendorStatus("bob@example.com", authUsers, vendors);
    expect(r).toEqual({ active: false, plan: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/merqo-vendor-status.test.ts`
Expected: FAIL — `Cannot find module './merqo-vendor-status'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/merqo-vendor-status.ts
import type { Plan } from "@/lib/types";

export type VendorStatus =
  | { active: true; plan: Plan }
  | { active: false; plan: null };

/**
 * qkit.vendors has no email column (id references auth.users(id) directly),
 * so the caller supplies the auth-user list (from supabase.auth.admin.listUsers)
 * alongside the vendors rows, and this pure function does the two-step lookup.
 */
export function resolveVendorStatus(
  email: string,
  authUsers: { id: string; email: string | null }[],
  vendors: { id: string; plan: Plan }[],
): VendorStatus {
  const key = email.toLowerCase();
  const user = authUsers.find((u) => u.email?.toLowerCase() === key);
  if (!user) return { active: false, plan: null };
  const vendor = vendors.find((v) => v.id === user.id);
  if (!vendor) return { active: false, plan: null };
  return { active: true, plan: vendor.plan };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/merqo-vendor-status.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/merqo-vendor-status.ts src/lib/merqo-vendor-status.test.ts
git commit -m "feat: add pure vendor-status lookup for the merqo sync endpoint"
```

---

### Task 2: `GET /api/merqo/vendor-status` route

**Files:**

- Create: `src/app/api/merqo/vendor-status/route.ts`

**Interfaces:**

- Consumes: `resolveVendorStatus` from Task 1 (`src/lib/merqo-vendor-status.ts`).
- Produces: the HTTP contract Merqo's `checkVendorStatus` (Merqo plan, separate repo) calls: `GET /api/merqo/vendor-status?email=<email>` with `Authorization: Bearer <MERQO_METRICS_SECRET>` → `200 {active: boolean, plan: "free"|"pro"|null}` or `401 {error: "Unauthorized"}` or `400 {error: "..."}` on a missing/invalid email param.

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/merqo/vendor-status/route.ts
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveVendorStatus } from "@/lib/merqo-vendor-status";
import type { Plan } from "@/lib/types";

export const revalidate = 0;

// Verbatim copy of api/merqo/metrics/route.ts's bearerOk — keep in lockstep.
function bearerOk(request: Request): boolean {
  const secret = process.env.MERQO_METRICS_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

const querySchema = z.object({ email: z.string().email() });

export async function GET(request: Request) {
  if (!bearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    email: searchParams.get("email") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const supabase = await createServiceClient();

  const [usersRes, vendorsRes] = await Promise.all([
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("vendors").select("id, plan"),
  ]);
  if (vendorsRes.error) {
    console.error("merqo vendor-status: read failed", vendorsRes.error.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  const status = resolveVendorStatus(
    parsed.data.email,
    usersRes.data?.users ?? [],
    (vendorsRes.data ?? []) as { id: string; plan: Plan }[],
  );

  return NextResponse.json(status);
}
```

- [ ] **Step 2: Manual verification (no colocated route test — matches the existing `/api/merqo/metrics` route, which also has no route-level test; only its pure compute function is unit-tested per Task 1)**

Run: `pnpm dev`, then in another terminal:

```bash
curl -s "http://localhost:3000/api/merqo/vendor-status?email=test@example.com" \
  -H "Authorization: Bearer $MERQO_METRICS_SECRET"
```

Expected: `{"active":false,"plan":null}` for an email with no matching auth user (or `{"active":true,"plan":"free"}` / `"pro"` for a real vendor's email in your dev DB).

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/merqo/vendor-status?email=test@example.com"
```

Expected: `401` (no bearer header)

- [ ] **Step 3: Run full verification**

Run: `pnpm check`
Expected: prettier/eslint/tsc all clean

Run: `pnpm vitest run`
Expected: all tests pass (including Task 1's new tests)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/merqo/vendor-status/route.ts
git commit -m "feat: add /api/merqo/vendor-status endpoint for Merqo's vendor sync"
```

---

## Self-Review Notes

- **Spec coverage:** qkit section of the design spec (bearer auth reuse, email→id resolution via admin API, `{active, plan}` contract, 401 on bad bearer) — covered by Tasks 1–2.
- **No placeholders** — every step has complete, runnable code.
- **Type consistency** — `VendorStatus` (Task 1) is exactly what the route (Task 2) returns via `NextResponse.json(status)`; `Plan` imported from the existing `@/lib/types`, not redefined.
