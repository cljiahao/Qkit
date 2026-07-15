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
