# Drop Stale Vendor Identity Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop the stale `qkit.vendors.name`/`qkit.vendors.social_links` columns (superseded by `merqo.vendor_profile` since the 2026-07-17 cutover) and retire every remaining qkit code path — onboarding's write, and four admin pages' raw reads — that still touches them directly instead of going through the shared profile.

**Architecture:** One migration drops the two columns; `src/lib/types.ts`'s generated `vendors` Row/Insert/Update types lose the same two fields. Every consumer that read them off the raw DB row switches to `getOrCreateVendorProfile` (`src/lib/merqo-vendor-profile.ts`, already shipped) — either directly (single-vendor pages, onboarding) or through a new small helper, `vendorStallNames`, that resolves many vendor ids in parallel for the admin list/dashboard pages. `get-entitlement.ts`'s existing overlay becomes a `VendorWithProfile` type (`Vendor & { name; social_links }`) built as a new object instead of a same-shape in-place mutation, since the base `Vendor` type no longer carries those fields.

**Tech Stack:** Next.js 16 (App Router) · TypeScript strict · Supabase (`@supabase/ssr`) · Zod · Vitest · pnpm.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore` (qkit AGENTS.md).
- Validate all user input with Zod at every boundary (qkit AGENTS.md) — `vendorSchema` (onboarding) is unchanged by this plan, still the boundary.
- Authorization lives in RLS policies, not app code — never widen a policy to "fix" a query. This plan needs **no RLS change**: `vendors_self_update` is row-scoped (`auth.uid() = id`), confirmed unaffected by the column drop.
- Use the service-role client only in Server Actions/Route Handlers, never client components (qkit AGENTS.md) — not touched by this plan (no call site here uses the service-role client).
- After editing the schema, update both `supabase/migrations/` and `src/lib/types.ts` (qkit AGENTS.md).
- No client, and no kit's app code, ever queries `merqo.vendor_profile` directly — only through `merqo.get_or_create_vendor_profile`/`merqo.upsert_vendor_profile` (merqo design spec non-goal, still binding here).
- Design spec: `docs/superpowers/specs/2026-07-21-drop-vendor-identity-columns-design.md`.

---

## Task 1: Migration — drop the two columns

**Files:**

- Create: `supabase/migrations/0069_drop_vendor_identity_columns.sql`
- Test: `test/db/drop-vendor-identity-columns.test.ts`

**Interfaces:**

- Produces: `qkit.vendors` with `name`/`social_links` gone. Consumed by Task 2 (which removes the same two fields from `src/lib/types.ts`).

- [ ] **Step 1: Write the failing migration test**

```ts
// test/db/drop-vendor-identity-columns.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sql = readFileSync(
  fileURLToPath(
    new URL(
      "../../supabase/migrations/0069_drop_vendor_identity_columns.sql",
      import.meta.url,
    ),
  ),
  "utf8",
).toLowerCase();

describe("0069_drop_vendor_identity_columns migration", () => {
  it("drops the stale name and social_links columns from qkit.vendors", () => {
    expect(sql).toMatch(/alter table qkit\.vendors/);
    expect(sql).toMatch(/drop column name/);
    expect(sql).toMatch(/drop column social_links/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/db/drop-vendor-identity-columns.test.ts`
Expected: FAIL — `ENOENT` reading `0069_drop_vendor_identity_columns.sql` (file doesn't exist yet).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0069_drop_vendor_identity_columns.sql
-- Finishes the shared-vendor-profile cutover (see
-- docs/superpowers/specs/2026-07-21-drop-vendor-identity-columns-design.md,
-- deferred step 4 of merqo/docs/superpowers/plans/2026-07-16-shared-vendor-profile.md).
-- Stall name + social links have lived in merqo.vendor_profile since the
-- 2026-07-17 cutover (backfilled by migration 0054); these two qkit.vendors
-- columns have been dead weight since then, with one full deploy cycle
-- since passed.
alter table qkit.vendors
  drop column name,
  drop column social_links;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/db/drop-vendor-identity-columns.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit (do NOT apply the migration to any shared/live DB yet)**

`qkit.vendors.name` is still written by onboarding and `name`/`social_links` are still read raw by four admin pages until Task 2's code cutover lands — applying this migration to a shared/live environment before that would break vendor signup and the admin panel immediately. Applying it is deferred to the end of Task 2, once the dependent code no longer touches these columns.

```bash
git add supabase/migrations/0069_drop_vendor_identity_columns.sql test/db/drop-vendor-identity-columns.test.ts
git commit -m "feat: drop stale qkit.vendors.name/social_links columns"
```

---

## Task 2: Cut over every remaining direct reader/writer

**Why this is one task, not several:** `src/lib/types.ts`'s `vendors` Row/Insert/Update types are a single shared declaration. Removing `name`/`social_links` from it breaks `get-entitlement.ts`, `onboarding/actions.ts`, and four admin pages simultaneously — none of them can be reviewed or land independently of the others without leaving the repo's `pnpm check` red. This task fixes all of them together, ending in one green `pnpm check && pnpm test` and one commit.

**Files:**

- Modify: `src/lib/types.ts:183-211` (`vendors` Row/Insert/Update)
- Modify: `src/lib/supabase/get-entitlement.ts`
- Create: `src/lib/supabase/get-entitlement.test.ts`
- Modify: `src/app/onboarding/actions.ts`
- Create: `src/app/onboarding/actions.test.ts`
- Create: `src/lib/admin-vendor-names.ts`
- Create: `src/lib/admin-vendor-names.test.ts`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/admin/vendors/page.tsx`
- Modify: `src/app/admin/vendors/[id]/page.tsx`
- Modify: `src/app/admin/feedback/page.tsx`

**Interfaces:**

- Consumes: `getOrCreateVendorProfile(supabase, vendorId, defaultStallName): Promise<VendorProfile>` from `src/lib/merqo-vendor-profile.ts` (already shipped, unchanged by this plan).
- Produces: `export type VendorWithProfile = Vendor & { name: string; social_links: SocialLinks }` (`get-entitlement.ts`) — `loadEntitlement`/`requireEntitledVendor` return this instead of bare `Vendor`. `export async function vendorStallNames(supabase, vendorIds: string[]): Promise<Map<string, string>>` (`admin-vendor-names.ts`) — consumed by the three multi-vendor admin pages.

### Step 1: Drop the fields from the generated types

Edit `src/lib/types.ts:183-211`, removing `name`/`social_links` from all three shapes:

```ts
      vendors: {
        Row: {
          id: string;
          plan: Plan;
          created_at: string;
          tour_seen_at: string | null;
          board_settings: BoardSettings;
        };
        Insert: {
          id: string;
          plan?: Plan;
          created_at?: string;
          tour_seen_at?: string | null;
          board_settings?: BoardSettings;
        };
        Update: {
          id?: string;
          plan?: Plan;
          created_at?: string;
          tour_seen_at?: string | null;
          board_settings?: BoardSettings;
        };
        Relationships: [];
      };
```

- [ ] **Step 2: Run the typechecker to confirm the expected breakage**

Run: `pnpm check`
Expected: FAIL — compile errors in `src/lib/supabase/get-entitlement.ts`, `src/app/onboarding/actions.ts`, `src/app/admin/page.tsx`, `src/app/admin/vendors/page.tsx`, `src/app/admin/vendors/[id]/page.tsx`, and `src/app/admin/feedback/page.tsx` (all read/write `vendors.name`/`vendors.social_links`, fixed in the following steps of this same task — do not stop here).

- [ ] **Step 3: Refactor `get-entitlement.ts` to build a `VendorWithProfile`**

Replace the full contents of `src/lib/supabase/get-entitlement.ts`:

```ts
import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";
import { getEntitlement, type Entitlement } from "@/lib/plan";
import type { User } from "@supabase/supabase-js";
import {
  DEFAULT_BOARD_SETTINGS,
  type Vendor,
  type SocialLinks,
} from "@/lib/types";
import { getOrCreateVendorProfile } from "@/lib/merqo-vendor-profile";

/**
 * Vendor row merged with its shared merqo.vendor_profile fields. qkit.vendors
 * has no name/social_links columns at all since migration 0069 —
 * merqo.vendor_profile is the only source, so every consumer of `vendor`
 * (profile page, booth forms, order-status page) gets those two fields
 * attached here instead of reading them off the DB row directly.
 */
export type VendorWithProfile = Vendor & {
  name: string;
  social_links: SocialLinks;
};

/**
 * Resolve the current vendor's effective entitlement (plan + any live license).
 *
 * vendors.id === auth.users.id and licenses.vendor_id === vendors.id, so both
 * the vendor row and the license both key on user.id — they're fetched in
 * parallel (one round-trip, not two) on this hot dashboard path. A THIRD,
 * sequential round-trip follows once the vendor row is back: the
 * merqo.vendor_profile fetch below can't join the Promise.all above because
 * it needs to know the vendor row actually exists first — firing it
 * unconditionally would spuriously create a merqo profile for a
 * signed-in-but-not-yet-onboarded user (no vendors row yet).
 *
 * Defensive: if the licenses table predates migration 0010 the query errors and
 * `data` is null, so we degrade to the plan-only entitlement rather than throw.
 * The VENDOR read is not treated this way — a read error there is surfaced (like
 * get-vendor), because swallowing it would misroute a real vendor to /onboarding
 * on a transient DB hiccup.
 */
export const loadEntitlement = cache(
  async (): Promise<{
    user: User | null;
    vendor: VendorWithProfile | null;
    entitlement: Entitlement;
    licenseExpiresAt: string | null;
  }> => {
    const supabase = await createServerClient();
    const user = await getUser();
    const now = Date.now();

    if (!user) {
      return {
        user: null,
        vendor: null,
        entitlement: getEntitlement("free", null, now),
        licenseExpiresAt: null,
      };
    }

    // A pass counts only inside its window: valid_from <= now < expires_at. Among
    // currently-active licenses, take the latest-expiring (longest remaining).
    const nowIso = new Date(now).toISOString();
    const [{ data: vendor, error: vendorError }, { data: license }] =
      await Promise.all([
        supabase.from("vendors").select("*").eq("id", user.id).maybeSingle(),
        supabase
          .from("licenses")
          .select("expires_at")
          .eq("vendor_id", user.id)
          .lte("valid_from", nowIso)
          .gt("expires_at", nowIso)
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    // Fail loud on a vendor read error (see get-vendor) — a null-on-error would
    // bounce an onboarded vendor back to /onboarding. Caught by the error boundary.
    if (vendorError) {
      console.error("loadEntitlement: vendor read failed", vendorError.message);
      throw new Error("vendor lookup failed");
    }

    // board_settings can be missing if migration 0050 hasn't reached this DB
    // yet (deploy and migrate aren't atomic) — fall back rather than crash
    // every board render.
    if (vendor && !vendor.board_settings) {
      vendor.board_settings = DEFAULT_BOARD_SETTINGS;
    }

    // Stall name + social links live only in merqo.vendor_profile — qkit.vendors
    // has never had a row to fall back to since migration 0069. `null` default:
    // onboarding (src/app/onboarding/actions.ts) is what seeds the initial name
    // now, so by the time a vendor reaches the dashboard the profile already
    // exists; get_or_create_vendor_profile's own 'My Stall' fallback only
    // matters for the rare row with no profile at all.
    let vendorWithProfile: VendorWithProfile | null = null;
    if (vendor) {
      const profile = await getOrCreateVendorProfile(supabase, vendor.id, null);
      vendorWithProfile = {
        ...vendor,
        name: profile.stall_name,
        social_links: profile.social_links,
      };
    }

    const licenseExpiresAt = vendorWithProfile
      ? (license?.expires_at ?? null)
      : null;
    return {
      user,
      vendor: vendorWithProfile,
      entitlement: getEntitlement(
        vendorWithProfile?.plan ?? "free",
        licenseExpiresAt,
        now,
      ),
      licenseExpiresAt,
    };
  },
);

/**
 * Page guard variant of loadEntitlement: redirect when the gate fails
 * (`/login` if not signed in, `/onboarding` if not yet onboarded), otherwise
 * return the entitlement bundle with non-null user + vendor.
 */
export async function requireEntitledVendor(): Promise<{
  user: User;
  vendor: VendorWithProfile;
  entitlement: Entitlement;
  licenseExpiresAt: string | null;
}> {
  const { user, vendor, entitlement, licenseExpiresAt } =
    await loadEntitlement();
  if (!user) redirect("/login");
  if (!vendor) redirect("/onboarding");
  return { user, vendor, entitlement, licenseExpiresAt };
}
```

- [ ] **Step 4: Write `get-entitlement.test.ts`**

No test file exists for this module today. This one locks in the merge behavior so the refactor can't silently regress it.

```ts
// src/lib/supabase/get-entitlement.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getOrCreateVendorProfile, getUser } = vi.hoisted(() => ({
  getOrCreateVendorProfile: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/merqo-vendor-profile", () => ({ getOrCreateVendorProfile }));
vi.mock("@/lib/supabase/get-user", () => ({ getUser }));

const maybeSingleVendor = vi.fn();
const maybeSingleLicense = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn().mockResolvedValue({
    from: (table: string) => {
      if (table === "vendors") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: maybeSingleVendor }) }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            lte: () => ({
              gt: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: maybeSingleLicense }),
                }),
              }),
            }),
          }),
        }),
      };
    },
  }),
}));

import { loadEntitlement } from "./get-entitlement";

beforeEach(() => {
  getOrCreateVendorProfile.mockReset();
  getUser.mockReset();
  maybeSingleVendor.mockReset();
  maybeSingleLicense.mockReset();
  maybeSingleLicense.mockResolvedValue({ data: null });
});

describe("loadEntitlement", () => {
  it("merges the merqo profile's stall_name/social_links onto the vendor row", async () => {
    getUser.mockResolvedValue({ id: "v1" });
    maybeSingleVendor.mockResolvedValue({
      data: {
        id: "v1",
        plan: "free",
        created_at: "2026-01-01T00:00:00Z",
        tour_seen_at: null,
        board_settings: {
          aging_min: 5,
          overdue_min: 10,
          sound_id: "chime",
          desktop_notify: false,
          undo_seconds: 5,
          daily_order_number_reset: true,
          show_wait_estimate: true,
          default_prep_minutes: null,
          ready_auto_clear_min: null,
        },
      },
      error: null,
    });
    getOrCreateVendorProfile.mockResolvedValue({
      vendor_id: "v1",
      stall_name: "Kopitiam Cart",
      social_links: { website: "https://example.com" },
    });

    const { vendor } = await loadEntitlement();

    expect(vendor?.name).toBe("Kopitiam Cart");
    expect(vendor?.social_links).toEqual({ website: "https://example.com" });
    expect(getOrCreateVendorProfile).toHaveBeenCalledWith(
      expect.anything(),
      "v1",
      null,
    );
  });

  it("returns a null vendor without calling getOrCreateVendorProfile when there's no vendor row", async () => {
    getUser.mockResolvedValue({ id: "v1" });
    maybeSingleVendor.mockResolvedValue({ data: null, error: null });

    const { vendor } = await loadEntitlement();

    expect(vendor).toBeNull();
    expect(getOrCreateVendorProfile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run the new test to verify it passes**

Run: `pnpm vitest run src/lib/supabase/get-entitlement.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Rewrite `onboarding/actions.ts` to seed the profile instead of writing `vendors.name`**

Replace the full contents of `src/app/onboarding/actions.ts`:

```ts
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getOrCreateVendorProfile } from "@/lib/merqo-vendor-profile";
import { vendorSchema, type VendorInput } from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";

type CreateVendorResult = ActionResult;

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

  const { error } = await supabase.from("vendors").insert({ id: user.id });

  // 23505 = unique violation: the row already exists, treat as success.
  if (error && error.code !== "23505") {
    console.error("createVendor failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { success: false, error: "Could not create vendor" };
  }

  // Seed the shared merqo profile with the chosen stall name — qkit.vendors
  // has nowhere to put it since migration 0069. get_or_create_vendor_profile
  // is idempotent, so this is safe even on the 23505 (row-already-exists) path.
  try {
    await getOrCreateVendorProfile(supabase, user.id, parsed.data.name);
  } catch (err) {
    console.error(
      "createVendor: seeding merqo profile failed",
      err instanceof Error ? err.message : err,
    );
    return { success: false, error: "Could not create vendor" };
  }

  return { success: true };
}
```

- [ ] **Step 7: Write `onboarding/actions.test.ts`**

```ts
// src/app/onboarding/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getOrCreateVendorProfile, getUser, insert } = vi.hoisted(() => ({
  getOrCreateVendorProfile: vi.fn(),
  getUser: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/merqo-vendor-profile", () => ({ getOrCreateVendorProfile }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => getUser() },
    from: () => ({ insert }),
  }),
}));

import { createVendor } from "./actions";

beforeEach(() => {
  getOrCreateVendorProfile.mockReset();
  getUser.mockReset();
  insert.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "v1" } } });
  insert.mockResolvedValue({ error: null });
  getOrCreateVendorProfile.mockResolvedValue({
    vendor_id: "v1",
    stall_name: "Kopitiam Cart",
    social_links: {},
  });
});

describe("createVendor", () => {
  it("inserts a bare vendors row and seeds the merqo profile with the chosen name", async () => {
    const result = await createVendor({ name: "Kopitiam Cart" });

    expect(result.success).toBe(true);
    expect(insert).toHaveBeenCalledWith({ id: "v1" });
    expect(getOrCreateVendorProfile).toHaveBeenCalledWith(
      expect.anything(),
      "v1",
      "Kopitiam Cart",
    );
  });

  it("treats a duplicate-row error (23505) as success and still seeds the profile", async () => {
    insert.mockResolvedValue({ error: { code: "23505", message: "dup" } });

    const result = await createVendor({ name: "Kopitiam Cart" });

    expect(result.success).toBe(true);
    expect(getOrCreateVendorProfile).toHaveBeenCalled();
  });

  it("returns an error for an invalid name without inserting or seeding a profile", async () => {
    const result = await createVendor({ name: "" });

    expect(result.success).toBe(false);
    expect(insert).not.toHaveBeenCalled();
    expect(getOrCreateVendorProfile).not.toHaveBeenCalled();
  });

  it("surfaces a real insert error without seeding the profile", async () => {
    insert.mockResolvedValue({ error: { code: "500", message: "boom" } });

    const result = await createVendor({ name: "Kopitiam Cart" });

    expect(result.success).toBe(false);
    expect(getOrCreateVendorProfile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm vitest run src/app/onboarding/actions.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 9: Write the failing test for the new admin helper**

```ts
// src/lib/admin-vendor-names.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getOrCreateVendorProfile } = vi.hoisted(() => ({
  getOrCreateVendorProfile: vi.fn(),
}));
vi.mock("@/lib/merqo-vendor-profile", () => ({ getOrCreateVendorProfile }));

import { vendorStallNames } from "./admin-vendor-names";

beforeEach(() => {
  getOrCreateVendorProfile.mockReset();
});

describe("vendorStallNames", () => {
  it("resolves one stall name per unique vendor id, in parallel", async () => {
    getOrCreateVendorProfile.mockImplementation((_client, id: string) =>
      Promise.resolve({
        vendor_id: id,
        stall_name: `Stall ${id}`,
        social_links: {},
      }),
    );

    const result = await vendorStallNames({} as never, ["v1", "v2"]);

    expect(result.get("v1")).toBe("Stall v1");
    expect(result.get("v2")).toBe("Stall v2");
    expect(getOrCreateVendorProfile).toHaveBeenCalledTimes(2);
  });

  it("de-duplicates repeated vendor ids into a single RPC call each", async () => {
    getOrCreateVendorProfile.mockResolvedValue({
      vendor_id: "v1",
      stall_name: "Stall v1",
      social_links: {},
    });

    await vendorStallNames({} as never, ["v1", "v1", "v1"]);

    expect(getOrCreateVendorProfile).toHaveBeenCalledTimes(1);
  });

  it("returns an empty map for an empty id list without calling the RPC", async () => {
    const result = await vendorStallNames({} as never, []);

    expect(result.size).toBe(0);
    expect(getOrCreateVendorProfile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `pnpm vitest run src/lib/admin-vendor-names.test.ts`
Expected: FAIL — `Cannot find module './admin-vendor-names'`.

- [ ] **Step 11: Write the helper**

```ts
// src/lib/admin-vendor-names.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrCreateVendorProfile } from "@/lib/merqo-vendor-profile";

/**
 * Resolve each vendor id's stall name from merqo.vendor_profile, one RPC
 * call per unique id, run in parallel. Admin-only, low-traffic call sites —
 * no batch-read RPC exists on the merqo side, and building one isn't
 * justified for this volume (see
 * docs/superpowers/specs/2026-07-21-drop-vendor-identity-columns-design.md).
 */
export async function vendorStallNames<
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  vendorIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(vendorIds)];
  const profiles = await Promise.all(
    uniqueIds.map((id) => getOrCreateVendorProfile(supabase, id, null)),
  );
  return new Map(uniqueIds.map((id, i) => [id, profiles[i].stall_name]));
}
```

- [ ] **Step 12: Run it to verify it passes**

Run: `pnpm vitest run src/lib/admin-vendor-names.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 13: Wire `vendorStallNames` into `admin/page.tsx`**

In `src/app/admin/page.tsx`:

1. Add the import: `import { vendorStallNames } from "@/lib/admin-vendor-names";`
2. Change the `vendors` select at line 79-80 from `.select("id, name, plan, created_at")` to `.select("id, plan, created_at")`.
3. Right after the `Promise.all` destructure (after line 112), add:

```ts
const stallNames = await vendorStallNames(
  supabase,
  (vendorRows ?? []).map((v) => v.id),
);
```

4. Change the `vendors` mapping at line 132-135 to include the resolved name:

```ts
const vendors: AdminVendorRow[] = (vendorRows ?? []).map((v) => ({
  ...v,
  name: stallNames.get(v.id) ?? "Unknown vendor",
  passExpiresAt: passByVendor.get(v.id) ?? null,
}));
```

5. Replace the `vendorName` map at line 146 (`const vendorName = new Map((vendorRows ?? []).map((v) => [v.id, v.name]));`) with a reuse of `stallNames`:

```ts
const vendorName = stallNames;
```

- [ ] **Step 14: Wire `vendorStallNames` into `admin/vendors/page.tsx`**

In `src/app/admin/vendors/page.tsx`:

1. Add the import: `import { vendorStallNames } from "@/lib/admin-vendor-names";`
2. Change the `vendors` select at line 34-36 from `.select("id, name, plan, created_at")` to `.select("id, plan, created_at")`.
3. After `const rows = vendorRows ?? [];` (line 43), add:

```ts
const stallNames = await vendorStallNames(
  supabase,
  rows.map((v) => v.id),
);
```

4. Change the `items` mapping (line 61-76) to source `name` from `stallNames`:

```ts
const items: VendorListItem[] = rows
  .map((v) => {
    const h = health.get(v.id)!;
    const expiry = passByVendor.get(v.id);
    return {
      id: v.id,
      name: stallNames.get(v.id) ?? "Unknown vendor",
      plan: v.plan,
      created_at: v.created_at,
      passHoursLeft: passHoursLeft(expiry, now),
      status: h.status,
      orders7d: h.orders7d,
      lastOrderAt: h.lastOrderAt,
      boothCount: h.boothCount,
    };
  })
  .sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      b.created_at.localeCompare(a.created_at),
  );
```

- [ ] **Step 15: Wire the profile fetch into `admin/vendors/[id]/page.tsx`**

Single vendor — call `getOrCreateVendorProfile` directly rather than the batch helper. In `src/app/admin/vendors/[id]/page.tsx`:

1. Add the import: `import { getOrCreateVendorProfile } from "@/lib/merqo-vendor-profile";`
2. Change the `vendor` select at line 61-63 from `.select("id, name, plan, created_at")` to `.select("id, plan, created_at")`.
3. Right after `if (!vendor) notFound();` (line 80), add:

```ts
const stallName = (await getOrCreateVendorProfile(supabase, id, null))
  .stall_name;
```

4. Replace the `{vendor.name}` heading at line 136 with `{stallName}`.
5. Replace `name: vendor.name` in the `VendorManage` call at line 226 with `name: stallName`.

- [ ] **Step 16: Wire `vendorStallNames` into `admin/feedback/page.tsx`**

In `src/app/admin/feedback/page.tsx`:

1. Add the import: `import { vendorStallNames } from "@/lib/admin-vendor-names";`
2. Change the `vendors` select at line 59 from `.select("id, name")` to `.select("id")`.
3. Replace the `vendorName` map at line 89 (`const vendorName = new Map((vendorList ?? []).map((v) => [v.id, v.name]));`) with:

```ts
const vendorName = await vendorStallNames(
  supabase,
  (vendorList ?? []).map((v) => v.id),
);
```

- [ ] **Step 17: Run the full test suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: PASS — this is the first point since Step 2 where `pnpm check` is green again.

- [ ] **Step 18: Commit**

```bash
git add src/lib/types.ts src/lib/supabase/get-entitlement.ts src/lib/supabase/get-entitlement.test.ts src/app/onboarding/actions.ts src/app/onboarding/actions.test.ts src/lib/admin-vendor-names.ts src/lib/admin-vendor-names.test.ts src/app/admin/page.tsx src/app/admin/vendors/page.tsx "src/app/admin/vendors/[id]/page.tsx" src/app/admin/feedback/page.tsx
git commit -m "feat: read vendor stall names from merqo.vendor_profile everywhere, drop the dead columns from types"
```

- [ ] **Step 19: Apply migration 0069 to the shared dev DB**

Only now is it safe: every remaining reader/writer of `qkit.vendors.name`/`social_links` was cut over in Steps 3-16 above, and Step 17 confirmed the whole suite is green with those columns gone from `src/lib/types.ts`. Run the project's `/supabase-migrate` skill (or `supabase db push` per the repo's normal migration flow) to apply `supabase/migrations/0069_drop_vendor_identity_columns.sql`.

---

## Task 3: Update docs referencing the dropped columns

**Files:**

- Modify: `src/lib/supabase/README.md`
- Modify: `src/app/admin/feedback/README.md`

**Interfaces:** none (docs only, no code).

- [ ] **Step 1: Update `src/lib/supabase/README.md`**

Replace the `get-entitlement.ts` bullet's mention of the columns (currently: "those `qkit.vendors` columns are stale leftovers from before the cross-kit vendor-profile cutover, not yet dropped"). Find and replace that clause with:

```markdown
those two fields don't exist on `qkit.vendors` at all as of migration 0069 —
`merqo.vendor_profile` is the only source.
```

- [ ] **Step 2: Update `src/app/admin/feedback/README.md`**

Replace the line "joins customer ratings → `booths.vendor_id` → `vendors.name` to build a per-vendor CSAT table" with:

```markdown
joins customer ratings → `booths.vendor_id` → each vendor's stall name (resolved via `vendorStallNames`, `@/lib/admin-vendor-names`) to build a per-vendor CSAT table
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/README.md src/app/admin/feedback/README.md
git commit -m "docs: update READMEs for the dropped vendors.name/social_links columns"
```

---

## Self-review notes

- **Spec coverage:** migration (Task 1) → spec's "Migration" section. `get-entitlement.ts`/`VendorWithProfile` (Task 2 Steps 3-5) → spec's "get-entitlement.ts" section. Onboarding rewrite (Task 2 Steps 6-8) → spec's "Onboarding" section. `get-vendor.ts` needed no code change (spec confirmed no field access there — nothing to task). Admin panel (Task 2 Steps 9-16) → spec's "Admin panel" section, all four call sites plus the shared helper. Docs (Task 3) → spec's inventory item 1 doc references.
- **Placeholder scan:** no TBD/TODO; every step has real code, an exact file path, or an exact command.
- **Type consistency:** `VendorWithProfile` (get-entitlement.ts) and `vendorStallNames`'s `Map<string, string>` return are used identically everywhere they're introduced and consumed within this plan — checked by hand across Task 2's steps.
