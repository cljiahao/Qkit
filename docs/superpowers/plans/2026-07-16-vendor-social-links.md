# Vendor Social & Website Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a vendor add website/Instagram/Facebook/TikTok links once on their profile (applies to every booth) and optionally override them per booth; show the resolved links to a customer on the order-status page footer, after they've placed an order.

**Architecture:** Two new nullable-JSONB columns (`vendors.social_links` NOT NULL DEFAULT `'{}'`, `booths.social_links` nullable, `null` = inherit). A pure `resolveSocialLinks(boothLinks, vendorLinks)` picks the effective value with a whole-object override (no field merge — same pattern as `booths.hours`/`booths.payment`). No RLS/grant changes are needed (existing table-level grants + `vendors_self_update`/`booths_vendor_all` already cover new columns); the customer-facing `get_booth_for_order` RPC is untouched because links are never shown on the menu page. The order-status page already reads via the service-role client, so it resolves the effective links with one small extra query.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Zod, Supabase (`@supabase/ssr`), Vitest + Testing Library, Tailwind v4, shadcn/ui, lucide-react icons.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Validate all user input with Zod at every boundary (forms + server actions).
- Authorization lives in RLS policies, not app code — never widen a policy to "fix" a query.
- No entitlement/plan gating on this feature (free/pass/pro all get unlimited social links — confirmed by the design's research phase).
- Links are shown ONLY on the customer order-status page footer (`/order/[boothId]/[orderNumber]`) — never on the menu/ordering page (`/o/[code]`), and the `get_booth_for_order` RPC's return shape does not change.
- Booth override is whole-object, not merged: a non-null `booths.social_links` completely replaces the vendor default for that booth, even if it only sets one of the four fields.
- After editing the schema, update both `supabase/migrations/` and `src/lib/types.ts`.
- Follow existing file/test conventions: colocated `*.dom.test.tsx` for client components, `*.test.ts` for pure logic in `src/lib`.

---

### Task 1: Migration + types + defensive read fallback

**Files:**

- Create: `supabase/migrations/0052_vendor_social_links.sql`
- Modify: `src/lib/types.ts` (add `SocialLinks` type; extend `vendors`/`booths` Row/Insert/Update)
- Modify: `src/lib/supabase/get-entitlement.ts` (defensive fallback for a vendor row read before the migration lands, same pattern as `board_settings`)

**Interfaces:**

- Produces: `export type SocialLinks = { website?: string; instagram?: string; facebook?: string; tiktok?: string }` (from `src/lib/types.ts`) — used by every later task.
- Produces: `Database["qkit"]["Tables"]["vendors"]["Row"]["social_links"]: SocialLinks` (never `undefined`/`null` after the runtime fallback) and `Database["qkit"]["Tables"]["booths"]["Row"]["social_links"]: Json | null`.

This task has no behavior to unit-test (it's schema/types), so instead of a failing-test step it's verified by `tsc --noEmit` (already runs automatically after every Edit/Write per this repo's harness) and a quick manual read-check in Task 2's tests, which import `SocialLinks`.

- [x] **Step 1: Write the migration**

Create `supabase/migrations/0052_vendor_social_links.sql`:

```sql
-- Vendor-wide default social/website links, and an optional per-booth
-- override. Shape: {website?, instagram?, facebook?, tiktok?} — validated in
-- src/lib/schemas.ts (socialLinksSchema). No entitlement gate (free/pass/pro
-- all get this) — every comparable product (Linktree, Toast) treats social
-- links as free marketing surface, never a paywalled capability.
ALTER TABLE qkit.vendors
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::jsonb;

-- NULL = inherit the vendor default; non-null = complete override for this
-- booth only (whole-object, not merged — same as booths.hours/booths.payment).
ALTER TABLE qkit.booths
  ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT NULL;

-- vendors: table-level GRANT UPDATE (migration 0041) already covers every
-- non-revoked column; add the explicit column grant anyway for the same
-- self-documenting reason migration 0050 did for board_settings.
GRANT UPDATE (social_links) ON qkit.vendors TO authenticated;

-- booths: GRANT SELECT, INSERT, UPDATE, DELETE (migration 0041) plus RLS
-- policy booths_vendor_all already cover a new column — no grant/policy
-- change needed here.
```

- [x] **Step 2: Add the `SocialLinks` type**

In `src/lib/types.ts`, immediately after the `PaymentConfig` type (currently ends around line 57), add:

```ts
// Vendor/booth social + website links (qkit.vendors.social_links,
// qkit.booths.social_links jsonb). All fields optional; an absent/empty
// object means "nothing set".
export type SocialLinks = {
  website?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
};
```

- [x] **Step 3: Extend the `Database` vendors/booths table types**

In `src/lib/types.ts`, in the `vendors` table's `Row`/`Insert`/`Update` (each currently ends with `board_settings: BoardSettings;` / `board_settings?: BoardSettings;`), add a trailing field:

```ts
board_settings: BoardSettings;
social_links: SocialLinks;
```

(and the `?:` variant in `Insert`/`Update`: `social_links?: SocialLinks;`).

In the `booths` table's `Row`/`Insert`/`Update` (each currently ends with `short_code: string;` / `short_code?: string;`), add:

```ts
short_code: string;
social_links: Json | null;
```

(and `social_links?: Json | null;` in `Insert`/`Update`). `booths.social_links` stays `Json | null` at the Database-row level (like `hours`/`payment`) because it's parsed defensively at read time, not trusted as already-valid.

- [x] **Step 4: Defensive fallback in `loadEntitlement`**

In `src/lib/supabase/get-entitlement.ts`, right after the existing:

```ts
if (vendor && !vendor.board_settings) {
  vendor.board_settings = DEFAULT_BOARD_SETTINGS;
}
```

add:

```ts
// social_links can be missing if migration 0052 hasn't reached this DB yet
// (deploy and migrate aren't atomic) — fall back to "nothing set" rather
// than crash the profile/booth-form pages.
if (vendor && !vendor.social_links) {
  vendor.social_links = {};
}
```

- [x] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors (this repo's `pnpm check` bundles this; running `tsc` alone is faster feedback here since there's no behavior to test yet).

- [x] **Step 6: Commit**

```bash
git add supabase/migrations/0052_vendor_social_links.sql src/lib/types.ts src/lib/supabase/get-entitlement.ts
git commit -m "feat: add vendors/booths.social_links columns and types"
```

---

### Task 2: Validation schema + resolve helper

**Files:**

- Modify: `src/lib/schemas.ts` (add `socialLinksSchema`, `parseSocialLinks`, `resolveSocialLinks`, extend `boothFormSchema`)
- Modify: `src/lib/schemas.test.ts` (new `describe` blocks)

**Interfaces:**

- Consumes: `SocialLinks` type from Task 1 (`src/lib/types.ts`).
- Produces: `export const socialLinksSchema: z.ZodObject<...>`, `export type SocialLinksInput = z.infer<typeof socialLinksSchema>`, `export function parseSocialLinks(data: unknown): SocialLinks`, `export function resolveSocialLinks(boothLinks: SocialLinks | null, vendorLinks: SocialLinks): SocialLinks`. `boothFormSchema` gains `social_links: socialLinksSchema.nullable().default(null)`. All consumed by Tasks 3–6.

- [x] **Step 1: Write the failing tests**

In `src/lib/schemas.test.ts`, add near the existing `describe("parsePaymentConfig", ...)` block (the file already imports from `"./schemas"` at the top — add `socialLinksSchema, parseSocialLinks, resolveSocialLinks` to that import):

```ts
describe("socialLinksSchema", () => {
  it("accepts a fully-populated set of http(s) links", () => {
    const parsed = socialLinksSchema.safeParse({
      website: "https://example.com",
      instagram: "https://instagram.com/example",
      facebook: "https://facebook.com/example",
      tiktok: "https://tiktok.com/@example",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty object (nothing set)", () => {
    expect(socialLinksSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a bare domain with no protocol", () => {
    const parsed = socialLinksSchema.safeParse({ website: "example.com" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a javascript: URL", () => {
    const parsed = socialLinksSchema.safeParse({
      instagram: "javascript:alert(1)",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("parseSocialLinks", () => {
  it("degrades malformed/missing data to an empty object", () => {
    expect(parseSocialLinks(null)).toEqual({});
    expect(parseSocialLinks(undefined)).toEqual({});
    expect(parseSocialLinks("nope")).toEqual({});
    expect(parseSocialLinks({ website: "not-a-url" })).toEqual({});
  });

  it("passes through a valid object", () => {
    expect(parseSocialLinks({ website: "https://a.b" })).toEqual({
      website: "https://a.b",
    });
  });
});

describe("resolveSocialLinks", () => {
  it("uses the vendor default when the booth has no override", () => {
    const vendorLinks = { website: "https://vendor.example" };
    expect(resolveSocialLinks(null, vendorLinks)).toEqual(vendorLinks);
  });

  it("uses the booth override completely, even if partial", () => {
    const vendorLinks = {
      website: "https://vendor.example",
      instagram: "https://instagram.com/vendor",
    };
    const boothLinks = { instagram: "https://instagram.com/this-booth" };
    expect(resolveSocialLinks(boothLinks, vendorLinks)).toEqual(boothLinks);
  });

  it("returns an empty object when neither is set", () => {
    expect(resolveSocialLinks(null, {})).toEqual({});
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm test schemas.test.ts`
Expected: FAIL — `socialLinksSchema`/`parseSocialLinks`/`resolveSocialLinks` are not exported yet.

- [x] **Step 3: Implement**

In `src/lib/schemas.ts`, right after the existing `boothFormSchema` definition and its `parseBoothHours` helper (around where `parseBoothHours`/`parsePaymentConfig` already live), add:

```ts
// A social/website link: any http(s) URL. Same shape as the existing payment
// pointer-link validation (rejects bare domains and javascript:/data: URIs).
const socialUrl = z
  .string()
  .trim()
  .max(300)
  .refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) link")
  .optional();

export const socialLinksSchema = z.object({
  website: socialUrl,
  instagram: socialUrl,
  facebook: socialUrl,
  tiktok: socialUrl,
});
export type SocialLinksInput = z.infer<typeof socialLinksSchema>;

/** Parse a JSONB social_links value; any malformed shape degrades to {}. */
export function parseSocialLinks(data: unknown): SocialLinks {
  const parsed = socialLinksSchema.safeParse(data);
  return parsed.success ? parsed.data : {};
}

/**
 * Effective social links for a booth: the booth's own override if it set
 * one, otherwise the vendor's profile-level default. Whole-object override —
 * a booth that sets only `instagram` does NOT also inherit the vendor's
 * `website`, matching booths.hours/booths.payment's null-degrades semantics.
 */
export function resolveSocialLinks(
  boothLinks: SocialLinks | null,
  vendorLinks: SocialLinks,
): SocialLinks {
  return boothLinks ?? vendorLinks;
}
```

Add the `SocialLinks` import to the top of `src/lib/schemas.ts` (find the existing `import type { ... } from "@/lib/types"` line, or add one) so `SocialLinks` is in scope.

Then extend `boothFormSchema` (currently ending with `payment: paymentConfigSchema.nullable().default(null),`):

```ts
export const boothFormSchema = z.object({
  boothId: z.string().uuid().optional(),
  name: z.string().min(1, "Booth name is required").max(100),
  image_url: imageUrlString.nullable(),
  is_active: z.boolean(),
  hours: boothHoursSchema.default(null),
  menu_items: z.array(menuItemFormSchema),
  payment: paymentConfigSchema.nullable().default(null),
  // null = inherit the vendor's profile-level defaults; non-null = a
  // complete per-booth override. See resolveSocialLinks.
  social_links: socialLinksSchema.nullable().default(null),
});
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `pnpm test schemas.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/lib/schemas.ts src/lib/schemas.test.ts
git commit -m "feat: add social links schema, parser, and resolver"
```

---

### Task 3: Reusable social-links input fields component

**Files:**

- Create: `src/components/social-links-fields.tsx`
- Create: `src/components/social-links-fields.dom.test.tsx`

**Interfaces:**

- Consumes: `SocialLinks` type (Task 1).
- Produces: `export function SocialLinksFields({ value, onChange, idPrefix }: { value: SocialLinks; onChange: (next: SocialLinks) => void; idPrefix: string })` — a controlled 4-input block (website/Instagram/Facebook/TikTok), consumed by Task 4 (profile) and Task 5 (booth override).

- [x] **Step 1: Write the failing test**

Create `src/components/social-links-fields.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SocialLinksFields } from "./social-links-fields";

describe("SocialLinksFields", () => {
  it("renders the four fields pre-filled from value", () => {
    render(
      <SocialLinksFields
        value={{ website: "https://a.b", instagram: "https://instagram.com/a" }}
        onChange={() => {}}
        idPrefix="test"
      />,
    );
    expect(screen.getByLabelText(/website/i)).toHaveValue("https://a.b");
    expect(screen.getByLabelText(/instagram/i)).toHaveValue(
      "https://instagram.com/a",
    );
    expect(screen.getByLabelText(/facebook/i)).toHaveValue("");
    expect(screen.getByLabelText(/tiktok/i)).toHaveValue("");
  });

  it("calls onChange with the merged object on edit, dropping empty strings", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SocialLinksFields value={{}} onChange={onChange} idPrefix="test" />,
    );

    await user.type(screen.getByLabelText(/website/i), "h");
    expect(onChange).toHaveBeenLastCalledWith({ website: "h" });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test social-links-fields`
Expected: FAIL — `src/components/social-links-fields.tsx` doesn't exist.

- [x] **Step 3: Implement**

Create `src/components/social-links-fields.tsx`:

```tsx
"use client";

import { Globe, Instagram, Facebook, Music2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FORM_LABEL_CLASS } from "@/lib/utils";
import type { SocialLinks } from "@/lib/types";

const FIELDS: {
  key: keyof SocialLinks;
  label: string;
  placeholder: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    key: "website",
    label: "Website",
    placeholder: "https://your-stall.com",
    icon: Globe,
  },
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "https://instagram.com/yourstall",
    icon: Instagram,
  },
  {
    key: "facebook",
    label: "Facebook",
    placeholder: "https://facebook.com/yourstall",
    icon: Facebook,
  },
  {
    key: "tiktok",
    label: "TikTok",
    placeholder: "https://tiktok.com/@yourstall",
    icon: Music2,
  },
];

export function SocialLinksFields({
  value,
  onChange,
  idPrefix,
}: {
  value: SocialLinks;
  onChange: (next: SocialLinks) => void;
  idPrefix: string;
}) {
  function setField(key: keyof SocialLinks, raw: string) {
    const next = { ...value };
    if (raw) next[key] = raw;
    else delete next[key];
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {FIELDS.map(({ key, label, placeholder, icon: Icon }) => {
        const id = `${idPrefix}-${key}`;
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={id} className={FORM_LABEL_CLASS}>
              <span className="inline-flex items-center gap-1.5">
                <Icon className="size-3.5" />
                {label}
              </span>
            </Label>
            <Input
              id={id}
              value={value[key] ?? ""}
              placeholder={placeholder}
              className="h-11 rounded-xl"
              onChange={(e) => setField(key, e.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test social-links-fields`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/components/social-links-fields.tsx src/components/social-links-fields.dom.test.tsx
git commit -m "feat: add reusable SocialLinksFields input component"
```

---

### Task 4: Profile page — vendor-level defaults

**Files:**

- Modify: `src/app/dashboard/profile/actions.ts` (add `updateSocialLinks`)
- Modify: `src/app/dashboard/profile/profile-form.tsx` (add "Social & website" section)
- Modify: `src/app/dashboard/profile/page.tsx` (pass `socialLinks` prop)
- Create: `src/app/dashboard/profile/profile-form.dom.test.tsx`

**Interfaces:**

- Consumes: `socialLinksSchema`, `SocialLinksInput` (Task 2); `SocialLinksFields` (Task 3); `SocialLinks` type (Task 1).
- Produces: `export async function updateSocialLinks(input: SocialLinksInput): Promise<ActionResult>` in `profile/actions.ts`. `ProfileForm` gains a required prop `socialLinks: SocialLinks`.

- [x] **Step 1: Write the failing test**

Create `src/app/dashboard/profile/profile-form.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateStallName = vi.fn();
const updateSocialLinks = vi.fn();
vi.mock("./actions", () => ({
  updateStallName: (...args: unknown[]) => updateStallName(...args),
  updateSocialLinks: (...args: unknown[]) => updateSocialLinks(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { updateUser: vi.fn() } }),
}));

import { ProfileForm } from "./profile-form";

beforeEach(() => {
  updateStallName.mockReset();
  updateSocialLinks.mockReset();
});

describe("ProfileForm social links", () => {
  const baseProps = {
    stallName: "Kopitiam Cart",
    displayName: "",
    email: "a@b.com",
    vendorId: "v1",
    avatarUrl: null,
    socialLinks: {},
  };

  it("rejects a non-http website before calling the action", async () => {
    const user = userEvent.setup();
    render(<ProfileForm {...baseProps} />);

    await user.type(screen.getByLabelText(/website/i), "not-a-url");
    await user.click(screen.getByRole("button", { name: /save links/i }));

    expect(screen.getByText(/must be an http\(s\) link/i)).toBeInTheDocument();
    expect(updateSocialLinks).not.toHaveBeenCalled();
  });

  it("saves valid links", async () => {
    updateSocialLinks.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<ProfileForm {...baseProps} />);

    await user.type(
      screen.getByLabelText(/instagram/i),
      "https://instagram.com/kopitiam",
    );
    await user.click(screen.getByRole("button", { name: /save links/i }));

    expect(updateSocialLinks).toHaveBeenCalledWith({
      instagram: "https://instagram.com/kopitiam",
    });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test profile-form`
Expected: FAIL — `ProfileForm` doesn't accept `socialLinks`, no "Save links" button exists, `updateSocialLinks` isn't exported from `./actions`.

- [x] **Step 3: Implement the server action**

In `src/app/dashboard/profile/actions.ts`, add the import and new action:

```ts
import {
  profileNameSchema,
  socialLinksSchema,
  type ProfileNameInput,
  type SocialLinksInput,
} from "@/lib/schemas";
```

```ts
/**
 * Update the vendor's profile-level default social/website links
 * (vendors.social_links). Same RLS/grant path as updateStallName — the
 * authenticated role can update its own vendors row (migration 0052 grants
 * UPDATE (social_links) explicitly).
 */
export async function updateSocialLinks(
  input: SocialLinksInput,
): Promise<ActionResult> {
  const parsed = socialLinksSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid links",
    };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not signed in" };

  const { error } = await supabase
    .from("vendors")
    .update({ social_links: parsed.data })
    .eq("id", user.id);

  if (error) {
    console.error("updateSocialLinks failed", error.message);
    return { success: false, error: "Could not save links" };
  }

  revalidatePath("/dashboard", "layout");
  return { success: true };
}
```

- [x] **Step 4: Implement the form section**

In `src/app/dashboard/profile/profile-form.tsx`:

Add imports: `Share2` to the existing `lucide-react` import list; `SocialLinksFields` from `@/components/social-links-fields`; `socialLinksSchema` to the existing `@/lib/schemas` import; `updateSocialLinks` to the existing `./actions` import; `SocialLinks` type import from `@/lib/types`.

Extend `Props`:

```ts
interface Props {
  stallName: string;
  displayName: string;
  email: string;
  vendorId: string;
  avatarUrl: string | null;
  socialLinks: SocialLinks;
}
```

Destructure `socialLinks` in the function signature, add local state near the other sections:

```ts
// Social/website links (vendors.social_links) — profile-level defaults, can
// be overridden per booth on the booth's own edit page.
const [links, setLinks] = useState<SocialLinks>(socialLinks);
const [linksError, setLinksError] = useState<string | null>(null);
const { pending: savingLinks, run: runLinks } = useAsyncAction();

function saveLinks() {
  const parsed = socialLinksSchema.safeParse(links);
  if (!parsed.success) {
    setLinksError(parsed.error.issues[0]?.message ?? "Check your links");
    return;
  }
  setLinksError(null);
  return runLinks(async () => {
    const res = await updateSocialLinks(parsed.data);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("Links saved");
    router.refresh();
  });
}
```

Add a new `Section` (placed after the existing "Stall name" section, before "Profile icon"):

```tsx
<Section
  icon={<Share2 className="size-5" />}
  eyebrow="Shown to customers"
  title="Social & website"
  description="Shown on the order-status page after a customer orders. Applies to every booth unless overridden on that booth's own page."
>
  <SocialLinksFields value={links} onChange={setLinks} idPrefix="profile" />
  {linksError && <p className={FORM_ERROR_CLASS}>{linksError}</p>}
  <div className="flex justify-end">
    <Button
      type="button"
      onClick={saveLinks}
      disabled={savingLinks}
      className="h-10 rounded-xl font-semibold"
    >
      {savingLinks ? "Saving…" : "Save links"}
    </Button>
  </div>
</Section>
```

`FORM_ERROR_CLASS` needs adding to the existing `@/lib/utils` import (it currently imports only `FORM_LABEL_CLASS`).

- [x] **Step 5: Wire the page**

In `src/app/dashboard/profile/page.tsx`, add `socialLinks={vendor.social_links}` to the `<ProfileForm ... />` call.

- [x] **Step 6: Run test to verify it passes**

Run: `pnpm test profile-form`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add src/app/dashboard/profile/actions.ts src/app/dashboard/profile/profile-form.tsx src/app/dashboard/profile/profile-form.dom.test.tsx src/app/dashboard/profile/page.tsx
git commit -m "feat: add vendor-level social/website links to profile page"
```

---

### Task 5: Booth form — per-booth override

**Files:**

- Create: `src/app/dashboard/booths/social-links-section.tsx`
- Create: `src/app/dashboard/booths/social-links-section.dom.test.tsx`
- Modify: `src/app/dashboard/booths/booth-form.tsx`
- Modify: `src/app/dashboard/booths/actions.ts` (`saveBooth` passes `social_links` through)
- Modify: `src/app/dashboard/booths/actions.test.ts` (new case)
- Modify: `src/app/dashboard/booths/[boothId]/page.tsx` and `src/app/dashboard/booths/new/page.tsx` (pass `vendorSocialLinks` + `initial.social_links`)

**Interfaces:**

- Consumes: `SocialLinksFields` (Task 3), `SocialLinks` type (Task 1), `boothFormSchema` field from Task 2.
- Produces: `export function SocialLinksSection({ value, onChange, vendorDefaults }: { value: SocialLinks | null; onChange: (next: SocialLinks | null) => void; vendorDefaults: SocialLinks })`. `BoothForm` gains a required prop `vendorSocialLinks: SocialLinks` and `initial?.social_links?: SocialLinks | null`.

- [x] **Step 1: Write the failing test for `SocialLinksSection`**

Create `src/app/dashboard/booths/social-links-section.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SocialLinksSection } from "./social-links-section";

describe("SocialLinksSection", () => {
  it("stays off (null) by default and shows no fields", () => {
    render(
      <SocialLinksSection
        value={null}
        onChange={() => {}}
        vendorDefaults={{ website: "https://vendor.example" }}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: /use custom links/i }),
    ).not.toBeChecked();
    expect(screen.queryByLabelText(/website/i)).not.toBeInTheDocument();
  });

  it("enabling seeds the fields from vendorDefaults and calls onChange", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SocialLinksSection
        value={null}
        onChange={onChange}
        vendorDefaults={{ website: "https://vendor.example" }}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: /use custom links/i }),
    );
    expect(onChange).toHaveBeenCalledWith({
      website: "https://vendor.example",
    });
  });

  it("disabling clears back to null", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SocialLinksSection
        value={{ instagram: "https://instagram.com/booth" }}
        onChange={onChange}
        vendorDefaults={{}}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: /use custom links/i }),
    );
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test social-links-section`
Expected: FAIL — `src/app/dashboard/booths/social-links-section.tsx` doesn't exist.

- [x] **Step 3: Implement `SocialLinksSection`**

Create `src/app/dashboard/booths/social-links-section.tsx`:

```tsx
"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { SocialLinksFields } from "@/components/social-links-fields";
import type { SocialLinks } from "@/lib/types";

export function SocialLinksSection({
  value,
  onChange,
  vendorDefaults,
}: {
  value: SocialLinks | null;
  onChange: (next: SocialLinks | null) => void;
  vendorDefaults: SocialLinks;
}) {
  const overridden = value !== null;

  function toggle(checked: boolean) {
    // Seed from the vendor's current defaults so switching an override on
    // doesn't force retyping every link, only the one that differs.
    onChange(checked ? vendorDefaults : null);
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <Checkbox
          checked={overridden}
          onCheckedChange={(checked) => toggle(checked === true)}
        />
        <span className="text-sm">
          <span className="font-medium">Use custom links for this booth</span>
          <span className="block text-muted-foreground">
            Off uses your profile&apos;s default links for every booth.
          </span>
        </span>
      </label>
      {overridden && (
        <SocialLinksFields
          value={value}
          onChange={onChange}
          idPrefix="booth-social"
        />
      )}
    </div>
  );
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test social-links-section`
Expected: PASS

- [x] **Step 5: Write the failing test for `saveBooth` passing `social_links` through**

In `src/app/dashboard/booths/actions.test.ts`, add `social_links: null` to the `makeBooth` defaults object (so every existing call site still gets a valid `BoothFormInput`):

```ts
function makeBooth(over: Partial<BoothFormInput> = {}): BoothFormInput {
  return {
    name: "Kopitiam Cart",
    image_url: null,
    is_active: false,
    hours: null,
    menu_items: [makeItem()],
    payment: null,
    social_links: null,
    ...over,
  };
}
```

Add a new test case inside `describe("saveBooth entitlement enforcement", ...)`:

```ts
it("(f) passes social_links through to the row untouched", async () => {
  const socialLinks = { instagram: "https://instagram.com/booth" };
  const res = await saveBooth(makeBooth({ social_links: socialLinks }));

  expect(res).toEqual({ success: true, boothId: "b-new" });
  const row = h.insertSpy.mock.calls[0][0] as { social_links: unknown };
  expect(row.social_links).toEqual(socialLinks);
});
```

- [x] **Step 6: Run test to verify it fails**

Run: `pnpm test actions.test.ts`
Expected: FAIL — `row.social_links` is `undefined` (saveBooth doesn't read/pass it yet).

- [x] **Step 7: Implement in `saveBooth`**

In `src/app/dashboard/booths/actions.ts`, in the `row` object saveBooth builds (currently ending `payment: data.payment,`), add:

```ts
const row = {
  name: data.name,
  image_url: data.image_url,
  is_active: data.is_active,
  hours,
  menu_items,
  payment: data.payment,
  social_links: data.social_links,
};
```

- [x] **Step 8: Run test to verify it passes**

Run: `pnpm test actions.test.ts`
Expected: PASS (all existing cases plus the new one)

- [x] **Step 9: Wire `BoothForm`**

In `src/app/dashboard/booths/booth-form.tsx`:

Add imports: `SocialLinksSection` from `./social-links-section`; `Share2` to the existing `lucide-react` import list; `SocialLinks` type from `@/lib/types`.

Extend `Props`:

```ts
interface Props {
  vendorId: string;
  entitlement: Entitlement;
  vendorSocialLinks: SocialLinks;
  initial?: {
    boothId: string;
    name: string;
    image_url: string | null;
    is_active: boolean;
    hours: BoothHours;
    menu_items: MenuItemFormInput[];
    payment: PaymentConfig | null;
    social_links: SocialLinks | null;
  };
}
```

Destructure `vendorSocialLinks` in the function signature. Add state near the other `useState` calls:

```ts
const [socialLinks, setSocialLinks] = useState<SocialLinks | null>(
  initial?.social_links ?? null,
);
```

Add `social_links: socialLinks,` to the `candidate` object inside `onSubmit` (alongside the existing `payment,` line).

Add a new `Section` after the existing "Payment" section (inside the same left-column `<div>`):

```tsx
<Section
  icon={<Share2 className="size-5" />}
  eyebrow="Shown to customers"
  title="Social links"
  description="Shown on the order-status page after a customer orders."
>
  <SocialLinksSection
    value={socialLinks}
    onChange={setSocialLinks}
    vendorDefaults={vendorSocialLinks}
  />
</Section>
```

- [x] **Step 10: Wire the two server pages**

In `src/app/dashboard/booths/[boothId]/page.tsx`: add `social_links` to the existing `.select("id, name, image_url, is_active, hours, menu_items, payment")` call, import `parseSocialLinks` from `@/lib/schemas`, and pass two new props to `<BoothForm>`:

```tsx
<BoothForm
  vendorId={vendor.id}
  entitlement={entitlement}
  vendorSocialLinks={vendor.social_links}
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
  }}
/>
```

In `src/app/dashboard/booths/new/page.tsx`, add the prop to the no-`initial` call:

```tsx
<BoothForm
  vendorId={vendor.id}
  entitlement={entitlement}
  vendorSocialLinks={vendor.social_links}
/>
```

(`vendor` in both pages comes from `requireEntitledVendor()`, whose `Vendor` type now includes `social_links` per Task 1.)

- [x] **Step 11: Full check**

Run: `pnpm check`
Expected: PASS (prettier + eslint + tsc)

- [x] **Step 12: Commit**

```bash
git add src/app/dashboard/booths/social-links-section.tsx src/app/dashboard/booths/social-links-section.dom.test.tsx src/app/dashboard/booths/booth-form.tsx src/app/dashboard/booths/actions.ts src/app/dashboard/booths/actions.test.ts "src/app/dashboard/booths/[boothId]/page.tsx" src/app/dashboard/booths/new/page.tsx
git commit -m "feat: add per-booth social links override"
```

---

### Task 6: Customer order-status page footer

**Files:**

- Create: `src/app/order/[boothId]/[orderNumber]/social-links-row.tsx`
- Create: `src/app/order/[boothId]/[orderNumber]/social-links-row.dom.test.tsx`
- Modify: `src/app/order/[boothId]/[orderNumber]/page.tsx`

**Interfaces:**

- Consumes: `resolveSocialLinks`, `parseSocialLinks` (Task 2), `SocialLinks` type (Task 1).
- Produces: `export function SocialLinksRow({ links }: { links: SocialLinks })`, rendered in the order-status page footer.

- [x] **Step 1: Write the failing test**

Create `src/app/order/[boothId]/[orderNumber]/social-links-row.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SocialLinksRow } from "./social-links-row";

describe("SocialLinksRow", () => {
  it("renders nothing when there are no links", () => {
    const { container } = render(<SocialLinksRow links={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders only the links that are set", () => {
    render(
      <SocialLinksRow
        links={{
          website: "https://a.b",
          instagram: "https://instagram.com/a",
        }}
      />,
    );
    expect(screen.getByRole("link", { name: /website/i })).toHaveAttribute(
      "href",
      "https://a.b",
    );
    expect(screen.getByRole("link", { name: /instagram/i })).toHaveAttribute(
      "href",
      "https://instagram.com/a",
    );
    expect(
      screen.queryByRole("link", { name: /facebook/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /tiktok/i }),
    ).not.toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test social-links-row`
Expected: FAIL — the component doesn't exist.

- [x] **Step 3: Implement**

Create `src/app/order/[boothId]/[orderNumber]/social-links-row.tsx`:

```tsx
import { Globe, Instagram, Facebook, Music2 } from "lucide-react";
import type { SocialLinks } from "@/lib/types";

const ICONS: {
  key: keyof SocialLinks;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "website", label: "Website", icon: Globe },
  { key: "instagram", label: "Instagram", icon: Instagram },
  { key: "facebook", label: "Facebook", icon: Facebook },
  { key: "tiktok", label: "TikTok", icon: Music2 },
];

/** Icon row of the vendor's social/website links. Renders nothing if empty. */
export function SocialLinksRow({ links }: { links: SocialLinks }) {
  const entries = ICONS.filter(({ key }) => links[key]);
  if (entries.length === 0) return null;

  return (
    <div className="flex items-center gap-3">
      {entries.map(({ key, label, icon: Icon }) => (
        <a
          key={key}
          href={links[key]}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="grid size-10 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Icon className="size-4" />
        </a>
      ))}
    </div>
  );
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test social-links-row`
Expected: PASS

- [x] **Step 5: Wire the order-status page**

In `src/app/order/[boothId]/[orderNumber]/page.tsx`:

Add imports: `parseSocialLinks`, `resolveSocialLinks` to the existing `@/lib/schemas` import; `SocialLinksRow` from `./social-links-row`.

Change the existing booth select from `.select("name, payment, vendor_id")` to `.select("name, payment, vendor_id, social_links")`.

After the existing `if (!order) notFound();` check (so `booth.vendor_id` is known to be safe to query), add a follow-up read and resolve the effective links:

```ts
// Vendor-level default links, so a booth without its own override still
// shows the vendor's. Small extra query (not embeddable via Promise.all
// above — it depends on booth.vendor_id) but this page isn't a hot path.
const { data: vendorRow } = booth?.vendor_id
  ? await supabase
      .from("vendors")
      .select("social_links")
      .eq("id", booth.vendor_id)
      .maybeSingle()
  : { data: null };
const socialLinks = resolveSocialLinks(
  booth?.social_links ? parseSocialLinks(booth.social_links) : null,
  parseSocialLinks(vendorRow?.social_links),
);
```

In the JSX, in the existing footer block (`<div className="mt-auto flex flex-col items-center gap-3 pt-8">`), add `<SocialLinksRow links={socialLinks} />` right after the `<ReorderButton ... />` block and before the `<Link href={\`/order/${boothId}\`} ...>` line:

```tsx
        {items.length > 0 && (
          <ReorderButton
            boothId={boothId}
            lines={items.map((it) => ({
              menuItemId: it.menuItemId,
              quantity: it.quantity,
              options: it.options,
            }))}
            customerName={order.customer_name}
            label="Reorder these items"
            className="h-11 rounded-xl px-5"
          />
        )}
        <SocialLinksRow links={socialLinks} />
        <Link
          href={`/order/${boothId}`}
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          {items.length > 0 ? "Order something else" : "Order again"}
        </Link>
```

- [x] **Step 6: Full check**

Run: `pnpm check`
Expected: PASS

- [x] **Step 7: Run the full test suite**

Run: `pnpm test`
Expected: PASS (all suites, including the untouched existing ones)

- [x] **Step 8: Commit**

```bash
git add "src/app/order/[boothId]/[orderNumber]/social-links-row.tsx" "src/app/order/[boothId]/[orderNumber]/social-links-row.dom.test.tsx" "src/app/order/[boothId]/[orderNumber]/page.tsx"
git commit -m "feat: show resolved social links on the order-status page footer"
```

---

### Task 7: Changelog entry

**Files:**

- Modify: `CHANGELOG.md`

- [x] **Step 1: Add the entry**

In `CHANGELOG.md`, under `## [Unreleased]` → `### Added`, add a new bullet (matching the existing bullet style/voice) after the most recent one:

```markdown
- **Vendor social & website links**: vendors can add a website URL plus
  Instagram/Facebook/TikTok links on their profile page — applied by default
  to every booth they own, with an optional per-booth override on that
  booth's own edit page. Shown to customers on the order-status page footer,
  after they've placed an order (kept off the menu/ordering page by design).
  Free tier, no plan gate (`vendors.social_links`/`booths.social_links`,
  migration `0052`).
```

- [x] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog entry for vendor social links"
```

---

## Manual verification (not automated by this plan)

After Task 6, run the app locally (`pnpm dev`, plus local Supabase per AGENTS.md if exercising the DB) and walk through:

1. `/dashboard/profile` → add an Instagram link → Save → refresh → it persists.
2. `/dashboard/booths/new` → create a booth, leave "Use custom links" off → save → place a test order via `/o/{short_code}` → the order-status page footer shows the Instagram icon (inherited from the profile default).
3. Edit that booth → turn on "Use custom links" → change only the website field → save → reload the order-status page for a new order at that booth → footer now shows only the booth's website link, not the inherited Instagram (whole-object override, not merged).
4. Confirm the `/o/{short_code}` menu page itself shows no social icons anywhere.
