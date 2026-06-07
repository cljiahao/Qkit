# Google-primary Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Google OAuth the primary vendor sign-in (email/password secondary) with a single `/login` screen and one unified post-login onboarding path that creates the `vendors` row.

**Architecture:** Auth only authenticates. A server-component gate (`getVendor()`) routes any logged-in vendor with no `vendors` row to `/onboarding`, where a single `createVendor` server action writes the row. `proxy.ts` stays auth-only. Google is configured via Supabase external provider.

**Tech Stack:** Next.js 16 (App Router), `@supabase/ssr`, TypeScript strict, Zod, React Hook Form, shadcn/ui, Vitest.

---

## File Structure

- Create: `src/lib/supabase/get-vendor.ts` — `getVendor()` gate helper.
- Create: `src/app/auth/callback/route.ts` — OAuth code exchange.
- Create: `src/app/onboarding/page.tsx` — gated onboarding (server).
- Create: `src/app/onboarding/onboarding-form.tsx` — client form calling the action.
- Create: `src/app/onboarding/actions.ts` — `createVendor` server action.
- Modify: `src/lib/schemas.ts` — remove `registerSchema`, add `vendorSchema`.
- Modify: `src/lib/schemas.test.ts` — new (schema unit tests).
- Modify: `src/app/(auth)/login/page.tsx` — Google + email/password, signin/signup toggle.
- Delete: `src/app/(auth)/register/page.tsx`.
- Modify: `next.config.ts` — redirect `/register` → `/login`.
- Modify: `src/lib/supabase/middleware.ts` — also guard `/onboarding`.
- Modify: `src/app/dashboard/page.tsx` — use `getVendor()`, redirect to `/onboarding` if no vendor.
- Modify: `supabase/config.toml` — enable `[auth.external.google]`.
- Modify: `.env.example` — document Google client id/secret (CLI env).

**Testing note:** Only the Zod schema is cleanly unit-testable. The Supabase-touching units (`getVendor`, `createVendor`, callback, login) have no mock infrastructure in this repo and adding it is YAGNI — they are verified by `pnpm build` (type/compile correctness) plus the manual flow in Task 10. This is intentional and called out per task.

---

### Task 1: Schema changes (remove registerSchema, add vendorSchema)

**Files:**
- Modify: `src/lib/schemas.ts`
- Test: `src/lib/schemas.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { vendorSchema } from "./schemas";

describe("vendorSchema", () => {
  it("accepts a valid stall name", () => {
    expect(vendorSchema.safeParse({ name: "Mama's Kitchen" }).success).toBe(
      true,
    );
  });

  it("rejects an empty name", () => {
    expect(vendorSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a name over 100 chars", () => {
    expect(
      vendorSchema.safeParse({ name: "x".repeat(101) }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/schemas.test.ts`
Expected: FAIL — `vendorSchema` is not exported.

- [ ] **Step 3: Edit `src/lib/schemas.ts`**

Remove the `registerSchema` block and its `RegisterInput` export:

```ts
// DELETE these:
export const registerSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  vendorName: z.string().min(1, "Vendor name is required").max(100),
});
// ...
export type RegisterInput = z.infer<typeof registerSchema>;
```

Add `vendorSchema` after `placeOrderSchema` (before the read schemas):

```ts
export const vendorSchema = z.object({
  name: z.string().min(1, "Stall name is required").max(100),
});
```

Add to the type exports section:

```ts
export type VendorInput = z.infer<typeof vendorSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/schemas.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas.ts src/lib/schemas.test.ts
git commit -m "feat(auth): replace registerSchema with vendorSchema"
```

---

### Task 2: `getVendor()` gate helper

**Files:**
- Create: `src/lib/supabase/get-vendor.ts`

No unit test (Supabase-touching; verified by build + Task 7/10). Type-checked.

- [ ] **Step 1: Create `src/lib/supabase/get-vendor.ts`**

```ts
import { createServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import type { Vendor } from "@/lib/types";

/**
 * Single source of truth for the auth/onboarding gate.
 * Returns the current user and their vendor row (null if not signed in
 * or not yet onboarded).
 */
export async function getVendor(): Promise<{
  user: User | null;
  vendor: Vendor | null;
}> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, vendor: null };

  const { data: vendor } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { user, vendor: vendor ?? null };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/get-vendor.ts
git commit -m "feat(auth): add getVendor gate helper"
```

---

### Task 3: `createVendor` server action + onboarding page

**Files:**
- Create: `src/app/onboarding/actions.ts`
- Create: `src/app/onboarding/onboarding-form.tsx`
- Create: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Create `src/app/onboarding/actions.ts`**

```ts
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { vendorSchema, type VendorInput } from "@/lib/schemas";

type CreateVendorResult = { success: true } | { success: false; error: string };

export async function createVendor(
  input: VendorInput,
): Promise<CreateVendorResult> {
  const parsed = vendorSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid stall name" };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("vendors")
    .insert({ id: user.id, name: parsed.data.name });

  // 23505 = unique violation: the row already exists, treat as success.
  if (error && error.code !== "23505")
    return { success: false, error: "Could not create vendor" };

  return { success: true };
}
```

- [ ] **Step 2: Create `src/app/onboarding/onboarding-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { vendorSchema, type VendorInput } from "@/lib/schemas";
import { createVendor } from "./actions";

export function OnboardingForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VendorInput>({ resolver: zodResolver(vendorSchema) });

  async function onSubmit(data: VendorInput) {
    setLoading(true);
    const result = await createVendor(data);
    if (!result.success) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Set up your stall</CardTitle>
          <CardDescription>
            Name the stall customers will order from.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Stall name</Label>
              <Input
                id="name"
                placeholder="Mama's Kitchen"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving…" : "Continue"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/onboarding/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getVendor } from "@/lib/supabase/get-vendor";
import { OnboardingForm } from "./onboarding-form";

export const revalidate = 0;

export default async function OnboardingPage() {
  const { user, vendor } = await getVendor();
  if (!user) redirect("/login");
  if (vendor) redirect("/dashboard");
  return <OnboardingForm />;
}
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/onboarding
git commit -m "feat(auth): add onboarding page and createVendor action"
```

---

### Task 4: OAuth callback route

**Files:**
- Create: `src/app/auth/callback/route.ts`

- [ ] **Step 1: Create `src/app/auth/callback/route.ts`**

```ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) return NextResponse.redirect(`${origin}/login?error=oauth`);

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=oauth`);

  return NextResponse.redirect(`${origin}/dashboard`);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/auth/callback/route.ts
git commit -m "feat(auth): add Google OAuth callback route"
```

---

### Task 5: Rewrite `/login` (Google + email/password, signin/signup toggle)

**Files:**
- Modify: `src/app/(auth)/login/page.tsx` (full replace)

- [ ] **Step 1: Replace `src/app/(auth)/login/page.tsx` entirely**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { loginSchema, type LoginInput } from "@/lib/schemas";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("signin");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function signInWithGoogle() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
    }
    // On success the browser navigates to Google; no further action here.
  }

  async function onSubmit(data: LoginInput) {
    setLoading(true);
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword(data)
        : await supabase.auth.signUp(data);

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">
            {mode === "signin" ? "Sign in" : "Create account"}
          </CardTitle>
          <CardDescription>
            Access your QKit vendor dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={signInWithGoogle}
            disabled={loading}
          >
            Continue with Google
          </Button>

          <div className="flex items-center gap-2">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...register("password")} />
              {errors.password && (
                <p className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground text-center w-full">
            {mode === "signin" ? "No account? " : "Already have an account? "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() =>
                setMode((m) => (m === "signin" ? "signup" : "signin"))
              }
            >
              {mode === "signin" ? "Create account" : "Sign in"}
            </button>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (If `separator` is missing from `src/components/ui/`, add it: `pnpm dlx shadcn@latest add separator` — but it is already used by `order-card.tsx`, so it exists.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(auth)/login/page.tsx"
git commit -m "feat(auth): unify login screen with Google + email/password"
```

---

### Task 6: Remove `/register`, redirect to `/login`

**Files:**
- Delete: `src/app/(auth)/register/page.tsx`
- Modify: `next.config.ts`

- [ ] **Step 1: Delete the register page**

```bash
git rm "src/app/(auth)/register/page.tsx"
```

- [ ] **Step 2: Add the redirect to `next.config.ts`**

Insert this method into the `nextConfig` object (alongside `headers`):

```ts
  async redirects() {
    return [{ source: "/register", destination: "/login", permanent: false }];
  },
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git commit -m "feat(auth): redirect /register to unified /login"
```

---

### Task 7: Dashboard gate + middleware guard for /onboarding

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/lib/supabase/middleware.ts:33`

- [ ] **Step 1: Update `src/app/dashboard/page.tsx`**

Replace the top of the component (the `createServerClient` + `getUser` + redirect block and the booths query's `user.id`) so it uses `getVendor()`:

```tsx
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getVendor } from "@/lib/supabase/get-vendor";
import { RealtimeOrderBoard } from "./realtime-order-board";
import type { Order } from "@/lib/types";

export const revalidate = 0;

export default async function DashboardPage() {
  const { user, vendor } = await getVendor();
  if (!user) redirect("/login");
  if (!vendor) redirect("/onboarding");

  const supabase = await createServerClient();

  const { data: booths } = await supabase
    .from("booths")
    .select("id, name")
    .eq("vendor_id", vendor.id)
    .order("created_at", { ascending: true });

  const boothIds = (booths ?? []).map((b) => b.id);

  let orders: Order[] = [];
  if (boothIds.length) {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .in("booth_id", boothIds)
      .not("status", "in", "(completed,cancelled)")
      .order("created_at", { ascending: false });
    orders = data ?? [];
  }

  return <RealtimeOrderBoard booths={booths ?? []} initialOrders={orders} />;
}
```

- [ ] **Step 2: Update the middleware guard at `src/lib/supabase/middleware.ts`**

Change the protected-path check (currently line 33) from:

```ts
  if (!user && request.nextUrl.pathname.startsWith("/dashboard")) {
```

to:

```ts
  const path = request.nextUrl.pathname;
  if (!user && (path.startsWith("/dashboard") || path.startsWith("/onboarding"))) {
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx src/lib/supabase/middleware.ts
git commit -m "feat(auth): gate dashboard on vendor row, guard onboarding"
```

---

### Task 8: Enable Google provider in Supabase + document env

**Files:**
- Modify: `supabase/config.toml` (after the `[auth.external.apple]` block, ~line 335)
- Modify: `.env.example`

- [ ] **Step 1: Add the Google provider block to `supabase/config.toml`**

After the existing `[auth.external.apple]` block, add:

```toml
[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
# DO NOT commit your OAuth provider secret to git. Use environment variable substitution instead:
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
# Required for local sign in with Google auth.
skip_nonce_check = true
```

- [ ] **Step 2: Document the CLI env in `.env.example`**

Append:

```
# Google OAuth (read by the Supabase CLI when running `supabase start`, NOT by Next).
# Create an OAuth 2.0 Web client in Google Cloud Console; authorized redirect URI:
#   local: http://127.0.0.1:54321/auth/v1/callback
#   prod:  https://<project-ref>.supabase.co/auth/v1/callback
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=
```

- [ ] **Step 3: Commit**

```bash
git add supabase/config.toml .env.example
git commit -m "feat(auth): enable Google external provider config"
```

---

### Task 9: Restart local stack with Google credentials (manual, requires user)

**This task needs the user's Google Cloud OAuth client ID + secret.**

- [ ] **Step 1: User supplies credentials**

Set them in the shell that runs Supabase (PowerShell):

```powershell
$env:SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID = "<client-id>"
$env:SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET = "<client-secret>"
```

- [ ] **Step 2: Restart the stack so config.toml + env take effect**

Run: `pnpm supabase stop; pnpm supabase start`
Expected: starts cleanly, no config error.

---

### Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Static checks**

Run: `pnpm check`
Expected: prettier + eslint + tsc all pass.

- [ ] **Step 2: Tests**

Run: `pnpm test`
Expected: all pass (utils 8 + schemas 3).

- [ ] **Step 3: Build**

Run (with the local Next env present in `.env.local`): `pnpm build`
Expected: compiles; routes include `/login`, `/onboarding`, `/auth/callback`; no `/register` page route (it's a redirect).

- [ ] **Step 4: Manual flow (dev server on http://localhost:3000)**

Verify each:
1. Google sign-in (new user) → `/onboarding` → enter stall name → `/dashboard`.
2. Google sign-in (returning) → straight to `/dashboard`.
3. Email "Create account" → `/onboarding` → `/dashboard`.
4. Email "Sign in" (existing vendor) → `/dashboard`.
5. Visiting `/onboarding` once a vendor row exists → redirected to `/dashboard`.
6. Visiting `/dashboard` with no vendor row → redirected to `/onboarding`.
7. Visiting `/register` → redirected to `/login`.

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore(auth): verification fixups"
```

---

## Self-Review Notes

- **Spec coverage:** single `/login` (T5), `/register` redirect (T6), OAuth callback (T4), onboarding page + createVendor sole writer (T3), getVendor gate (T2, used in T3/T7), schema cleanup (T1), Google config (T8), error handling (callback no-code → `/login?error=oauth`, dup row → success), testing (T1 unit + T10 manual). All spec sections mapped.
- **Types:** `VendorInput`/`vendorSchema` (T1) consumed by `createVendor` (T3) and `OnboardingForm` (T3). `getVendor` returns `{ user, vendor }` (T2) consumed identically in T3/T7. `LoginInput` reused for both signin/signup (T5).
- **Client-side vendor insert removed:** old register page deleted (T6); `createVendor` (T3) is the only writer.
