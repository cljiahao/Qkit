# Vendor Social & Website Links — Design

**Date:** 2026-07-16
**Status:** Approved, ready for plan.

## Summary

Vendors can add a website URL + Instagram/Facebook/TikTok links so customers
can follow/find them outside qkit. Two-level config:

1. **Profile-level defaults** — set once on `/dashboard/profile`, apply to
   every booth the vendor owns.
2. **Per-booth override** — optional, set on a booth's edit page; when set,
   replaces the profile defaults for that booth only (whole-object override,
   not merged field-by-field — same nullable-override pattern as
   `booths.hours`/`booths.payment`).

Free tier, unlimited, no entitlement gate. Deep-research findings (see
below) show every comparable product (Linktree, Toast) treats the mere
presence of social/website links as free marketing surface — none paywall
the links themselves, only presentation/analytics polish layered on top.
Gating this would be inconsistent with every surveyed precedent and would
restrict a low-marginal-cost feature that drives the vendor's own audience
back into qkit's funnel — the opposite of what the existing operational
gates (max booths/menu items/option groups) protect against.

**Placement:** shown only on the customer order-status page (`/order/[boothId]/[orderNumber]`),
in the footer, after the order is placed — NOT on the menu/ordering page
(`/o/[code]`). Deep-research findings: checkout-usability research (Baymard,
Simform, ConvertCart) treats non-transactional content on a
transactional flow as increasing exit/abandonment risk, and Hick's
Law/Von Restorff effect both predict that social icons competing with menu
items would slow ordering decisions and disproportionately grab attention
away from the primary task. The post-purchase moment is the better window
for a non-transactional ask, and the customer is idle there anyway (waiting
on order status).

## Current state

- `qkit.vendors` — `id`, `name`, `plan`, `created_at`, `tour_seen_at`,
  `board_settings`. No social/website field.
- `qkit.booths` — `id`, `vendor_id`, `name`, `menu_items`, `is_active`,
  `image_url`, `hours`, `order_seq`, `payment`, `created_at`, `short_code`.
  No social/website field. `hours`/`payment` are the existing nullable-JSONB
  "null = fall back to a default behavior" precedent this design reuses.
- `/dashboard/profile` (`profile-form.tsx`) already has a "Shown to
  customers" section (stall name) — the natural home for the vendor-level
  defaults; it's the account/branding page, not the board-notification
  preferences page (`/dashboard/settings`, which is per-device board
  thresholds/sound/desktop-notify — unrelated).
- `/dashboard/booths/booth-form.tsx` already has a "Shown to customers" /
  "Name & photo" section — the natural home for the per-booth override.
- `/order/[boothId]/[orderNumber]/page.tsx` (order-status page) reads via
  the **service-role client** (bypasses RLS, already server-only) and
  currently selects `booths.name, payment, vendor_id`. It has an existing
  bottom "footer" region (`mt-auto flex flex-col items-center gap-3 pt-8`)
  with `EarnLink`, `ReorderButton`, and an "Order again" link — the social
  row lands here.
- `/o/[code]/page.tsx` (menu/ordering page) reads via the `get_booth_for_order`
  SECURITY DEFINER RPC (the only anon-accessible read). **Not touched** —
  socials aren't shown there, so the RPC's return shape doesn't change.

## Data model

New migration `0052_vendor_social_links.sql`:

```sql
ALTER TABLE qkit.vendors
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE qkit.booths
  ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT NULL;

-- vendors: table-level UPDATE grant (migration 0041) already covers every
-- column not explicitly revoked; add the explicit column grant anyway for
-- the same self-documenting reason migration 0050 did for board_settings.
GRANT UPDATE (social_links) ON qkit.vendors TO authenticated;

-- booths: GRANT SELECT, INSERT, UPDATE, DELETE ON qkit.booths (migration
-- 0041) plus booths_vendor_all (RLS) already cover a new column — no grant
-- or policy change needed.
```

Shape (both columns), `src/lib/types.ts`:

```ts
export type SocialLinks = {
  website?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
};
```

`vendors.social_links` is `NOT NULL DEFAULT '{}'` (always an object, possibly
empty). `booths.social_links` is nullable: `null` = inherit the vendor
default; non-null = complete override (a booth that sets `{instagram: "..."}`
shows only Instagram, even if the vendor default also has a website — no
merge, matching how `booths.payment: null` means "queue-only", not "fall
back to some other default").

Effective resolution (`src/lib/schemas.ts`, pure function, unit-tested):

```ts
export function resolveSocialLinks(
  boothLinks: SocialLinks | null,
  vendorLinks: SocialLinks,
): SocialLinks {
  return boothLinks ?? vendorLinks;
}
```

## Validation (`src/lib/schemas.ts`)

```ts
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

// Parse a JSONB social_links value; malformed/missing degrades to {} — same
// convention as parseBoothHours/parsePaymentConfig.
export function parseSocialLinks(data: unknown): SocialLinks {
  const parsed = socialLinksSchema.safeParse(data);
  return parsed.success ? parsed.data : {};
}
```

`boothFormSchema` gets a new field:
`social_links: socialLinksSchema.nullable().default(null)`.

## Server actions

- `src/app/dashboard/profile/actions.ts` — new `updateSocialLinks(input: SocialLinksInput)`,
  same shape as the existing `updateStallName`: parse with `socialLinksSchema`,
  `supabase.from("vendors").update({ social_links: parsed.data }).eq("id", user.id)`,
  `revalidatePath("/dashboard", "layout")`.
- `src/app/dashboard/booths/actions.ts` — `saveBooth` passes `data.social_links`
  through in the `row` object it already builds (no entitlement gating, no
  count caps — just an extra field alongside `hours`/`payment`).

## UI

### Profile page (`profile-form.tsx`)

New `Section` (icon `Globe`, eyebrow "Shown to customers", title "Social &
website") with 4 inputs (`Globe`/`Instagram`/`Facebook`/`Music2` icons for
website/Instagram/Facebook/TikTok — lucide has no literal TikTok mark, `Music2`
is the closest available and is a common substitute). One "Save links" button,
same disabled-when-unchanged pattern as the stall-name section.

### Booth form (`booth-form.tsx`)

New `Section` in the "Shown to customers" column (after "Name & photo"):
a checkbox "Use custom links for this booth" — unchecked keeps
`social_links: null` (inherit); checking it reveals the 4 inputs,
pre-filled from the vendor's profile defaults as a starting point (so
overriding one link doesn't require retyping the rest). Unchecking again
clears back to `null`.

`BoothForm` gains a new required prop `vendorSocialLinks: SocialLinks` (the
vendor's current profile defaults), fetched by the two server pages that
render it (`booths/[boothId]/page.tsx` and `booths/new/page.tsx`) alongside
the entitlement/vendor row they already load — used only as the prefill seed
when the override checkbox is switched on, not persisted on the booth unless
the vendor actually enables + saves the override.

### Order-status page footer

New colocated component `src/app/order/[boothId]/[orderNumber]/social-links-row.tsx`
(same colocation convention as `earn-link.tsx`/`pay-panel.tsx`): takes a
resolved `SocialLinks`, renders nothing if empty, otherwise a row of icon
links (only for the keys actually set) between `ReorderButton` and the
"Order again" text link in the existing footer block.

`page.tsx` changes: add `social_links` to the existing `booths` select,
then a small follow-up query `supabase.from("vendors").select("social_links").eq("id", booth.vendor_id).maybeSingle()`
(only reachable once `booth` is confirmed to exist), then
`resolveSocialLinks(parseSocialLinks(booth.social_links), parseSocialLinks(vendor?.social_links))`.

## Testing

- `src/lib/schemas.test.ts` — `socialLinksSchema`/`parseSocialLinks`: valid
  https URLs accepted, bare domains/`javascript:`/garbage rejected, malformed
  JSONB degrades to `{}`.
- `src/lib/schemas.test.ts` — `resolveSocialLinks`: booth override wins when
  set, vendor default used when booth is `null`, empty object when both are
  empty.
- `src/app/dashboard/profile/profile-form.dom.test.tsx` — new section:
  validation rejects a non-http value, submit happy path.
- `src/app/dashboard/booths/booth-form.dom.test.tsx` (or a new colocated
  test) — override checkbox toggling between `null` and the prefilled/edited
  object.
- `src/app/order/[boothId]/[orderNumber]/social-links-row.dom.test.tsx` —
  renders nothing for `{}`, renders only the icons for set keys.

## Out of scope

- Entitlement gating (research-backed: keep free/unlimited on every tier).
- Showing links on the menu/ordering page (`/o/[code]`) — research-backed:
  keep that page transaction-only.
- Per-link click analytics (a plausible future Pro upsell per the Linktree
  precedent, not requested here).
- Additional platforms beyond website/Instagram/Facebook/TikTok.
