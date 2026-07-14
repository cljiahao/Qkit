# profile

## Purpose

Vendor account profile page — stall name, profile icon, display name, and sign-in password, each saved independently through the channel that owns that data (Postgres `vendors` row vs. the Supabase auth user).

## Contents

- `actions.ts` — `updateStallName(input)` server action: validates with `profileNameSchema`, then updates `vendors.name` for the signed-in user (RLS `vendors_self_update` scopes it to `id = auth.uid()`), and calls `revalidatePath("/dashboard", "layout")` so the header/account menu immediately reflect the new name. Display name, avatar, and password are explicitly **not** handled here — they live on the auth user and are set client-side via `supabase.auth.updateUser`.
- `page.tsx` — `ProfilePage()` (server, `revalidate = 0`): reuses the layout's primed `requireEntitledVendor()` cache, reads `display_name`/`avatar_url` defensively off `user.user_metadata`, and renders a `BackButton` plus `ProfileForm` with the vendor's stall name, display name, email, id, and avatar URL.
- `profile-form.tsx` — `ProfileForm({ stallName, displayName, email, vendorId, avatarUrl })` client component with four independently-saved sections inside `Section` blocks: stall name (`profileNameSchema` → `updateStallName` server action), profile icon (`ImageUploader` → `supabase.auth.updateUser({ data: { avatar_url } })`), display name (`displayNameSchema` → `supabase.auth.updateUser({ data: { display_name } })`), and change password (`passwordChangeSchema` → `supabase.auth.updateUser({ password })`, clearing the fields on success); email is shown read-only.

## Connectivity

Reachable from `dashboard-nav.tsx`'s account menu ("Profile" item). `page.tsx` calls `requireEntitledVendor()` (`@/lib/supabase/get-entitlement`) and renders `profile-form.tsx`, which calls the server action `updateStallName` in `actions.ts` for the stall name and the browser Supabase client (`@/lib/supabase/client`) directly for avatar/display-name/password, all validated against schemas in `@/lib/schemas`.

## Parent

[dashboard](../README.md)
