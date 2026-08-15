"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { loadEntitlement } from "@/lib/supabase/get-entitlement";
import type { Entitlement } from "@/lib/plan";
import {
  boothFormSchema,
  type BoothFormInput,
  type MenuItemFormInput,
} from "@/lib/schemas";
import { boothImagePaths, orphanedImagePaths } from "@/lib/booth-images";
import { upsertVendorConfig } from "@/lib/paykit/client";
import type { ActionResult } from "@/lib/action-result";
import type { Database, PaymentKind } from "@/lib/types";

type BoothRow = Database["qkit"]["Tables"]["booths"]["Update"] & {
  name: string;
};

// Best-effort removal of orphaned booth-image objects. Never fails the caller —
// a leaked object is cost creep, not a correctness problem, whereas failing the
// save/delete over it would be worse. RLS scopes deletes to the vendor's folder.
async function removeBoothImages(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  paths: string[],
  context: string,
) {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from("booth-images").remove(paths);
  if (error) console.error(`${context} image cleanup failed`, error.message);
}

/**
 * Menu-item and option-group count caps (saveBooth's write-path guard).
 * Count caps reject (don't silently drop content — that would lose the
 * vendor's work). Returns an error message, or null when within plan limits.
 */
function validateMenuCaps(
  menuItems: MenuItemFormInput[],
  entitlement: Pick<Entitlement, "maxMenuItems" | "maxOptionGroupsPerItem">,
): string | null {
  if (
    entitlement.maxMenuItems !== null &&
    menuItems.length > entitlement.maxMenuItems
  )
    return `Your plan allows up to ${entitlement.maxMenuItems} menu items. Remove some or upgrade.`;

  const maxGroups = entitlement.maxOptionGroupsPerItem;
  if (
    maxGroups !== null &&
    menuItems.some((it) => (it.option_groups?.length ?? 0) > maxGroups)
  )
    return `Your plan allows up to ${maxGroups} customization groups per item. Upgrade for more.`;

  return null;
}

/**
 * Persist a booth row: UPDATE (reclaiming orphaned images afterward) when
 * `boothId` is set, INSERT otherwise. Isolated from saveBooth's validation/
 * gating phases above it — this is purely the write.
 */
async function upsertBoothRow(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  row: BoothRow,
  boothId: string | undefined,
  vendorId: string,
): Promise<SaveBoothResult> {
  if (boothId) {
    // Capture the currently-stored images before overwriting, to reclaim any
    // the new version no longer references (a replaced banner or a removed
    // item photo).
    const { data: prev } = await supabase
      .from("booths")
      .select("image_url, menu_items")
      .eq("id", boothId)
      .maybeSingle();

    // RLS (booths_vendor_all) scopes the update to this vendor's own booths.
    const { data: updated, error } = await supabase
      .from("booths")
      .update(row)
      .eq("id", boothId)
      .select("id")
      .maybeSingle();
    if (error || !updated)
      return { success: false, error: "Could not save booth" };

    if (prev)
      await removeBoothImages(
        supabase,
        orphanedImagePaths(prev, row),
        "saveBooth",
      );
    return { success: true, boothId: updated.id };
  }

  const { data: inserted, error } = await supabase
    .from("booths")
    .insert({ ...row, vendor_id: vendorId })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("createBooth failed", {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return { success: false, error: "Could not create booth" };
  }
  return { success: true, boothId: inserted.id };
}

/**
 * Free-plan single-active-booth cap, shared by saveBooth (activating via the
 * full edit form) and toggleBoothActive (the quick pause/resume toggle).
 * Fails open on a count-read error (the DB booth_servable RLS rule is the
 * real backstop) but logs so a persistently-failing count isn't invisible.
 * Returns an error message, or null when the save/toggle may proceed.
 */
async function checkActiveBoothCap(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  vendorId: string,
  maxBooths: number,
  excludeBoothId: string | undefined,
  context: string,
): Promise<string | null> {
  let q = supabase
    .from("booths")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendorId)
    .eq("is_active", true);
  if (excludeBoothId) q = q.neq("id", excludeBoothId);
  const { count, error } = await q;
  if (error) console.error(`${context} active-cap count failed`, error.message);
  if ((count ?? 0) >= maxBooths)
    return `Your plan serves ${maxBooths} active booth at a time. Deactivate another booth first, or upgrade.`;
  return null;
}

type SaveBoothResult = ActionResult<{ boothId: string }>;
type DeleteBoothResult = ActionResult;

// booths.payment now stores only a minimal `{kind}` marker, not the full
// config (payee_name/uen/mobile/label/url/qr_image_url live in paykit's
// vendor_payment_config instead — see saveBooth below). The marker exists
// solely because `qkit.place_order` (supabase/migrations/0056, unmodified in
// this cutover) reads `booths.payment->>'kind'` to decide a new order's
// initial payment_status (pending vs not_required) and there is no SQL-side
// way to ask paykit instead. `stripe` is reserved-but-dark and unreachable
// from the form's UI — treat it the same as "no payment" here.
function paymentMarker(
  kind: PaymentKind | undefined,
): { kind: PaymentKind } | null {
  return kind === "paynow" || kind === "pointer" ? { kind } : null;
}

/**
 * Hard-delete a booth and (via ON DELETE CASCADE, migration 0009) all of its
 * orders. RLS (booths_vendor_all) scopes the delete to the caller's own
 * booths, so a non-owner simply deletes zero rows — the 404-style "not found"
 * never reveals another vendor's booth.
 */
export async function deleteBooth(boothId: string): Promise<DeleteBoothResult> {
  if (!z.string().uuid().safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  // Read the referenced images before the row (and its images' only reference)
  // is gone, so we can reclaim the storage objects after a successful delete.
  const { data: booth } = await supabase
    .from("booths")
    .select("image_url, menu_items")
    .eq("id", boothId)
    .maybeSingle();

  const { count, error } = await supabase
    .from("booths")
    .delete({ count: "exact" })
    .eq("id", boothId);
  if (error) return { success: false, error: "Could not delete booth" };
  if (!count) return { success: false, error: "Booth not found" };

  if (booth)
    await removeBoothImages(supabase, boothImagePaths(booth), "deleteBooth");
  return { success: true };
}

/**
 * Rotate a booth's QR short code. RLS (booths_vendor_update) scopes the update to
 * the caller's own booths, so a non-owner updates zero rows and gets "not found"
 * — no cross-vendor leak. Invalidates every previously printed/saved QR link.
 */
export async function regenerateShortCode(
  boothId: string,
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: rows, error } = await supabase.rpc("regenerate_short_code", {
    p_booth_id: boothId,
  });
  if (error) return { success: false, error: "Could not regenerate QR" };
  if (!rows) return { success: false, error: "Booth not found" };

  revalidatePath(`/dashboard/booths/${boothId}/qr`);
  return { success: true };
}

export async function saveBooth(
  input: BoothFormInput,
): Promise<SaveBoothResult> {
  const parsed = boothFormSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: "Invalid booth details" };
  const data = parsed.data;

  // Server-side entitlement enforcement (the UI also gates, but never trust it).
  const { user, entitlement } = await loadEntitlement();
  if (!user) return { success: false, error: "Not authenticated" };

  // Feature caps (hours/stock, below) degrade quietly instead of rejecting.
  const menuCapError = validateMenuCaps(data.menu_items, entitlement);
  if (menuCapError) return { success: false, error: menuCapError };

  // Auto-close hours and per-item stock caps are Pro/pass — strip for free so a
  // stored value can't keep enforcing after a pass expires.
  const hours = entitlement.autoCloseHours ? data.hours : null;
  const menu_items = entitlement.stockCaps
    ? data.menu_items
    : data.menu_items.map(({ stock: _stock, ...rest }) => rest);

  const supabase = await createServerClient();

  // Active-booth gate: free vendors serve one live booth at a time. Block
  // activating a second (they swap by deactivating another). RLS booth_servable
  // is the real backstop; this gives a clear error instead of a silent pause.
  if (data.is_active && entitlement.maxBooths !== null) {
    const capError = await checkActiveBoothCap(
      supabase,
      user.id,
      entitlement.maxBooths,
      data.boothId,
      "saveBooth",
    );
    if (capError) return { success: false, error: capError };
  }

  // Full payment config now lives in paykit (vendor-scoped, reused across
  // every booth this vendor runs), not booths.payment — the "quick add
  // PayNow" section just redirects its write here instead of redesigning the
  // form. A paykit failure fails the whole save (surfaced via the existing
  // toast.error(result.error) path) rather than silently losing the vendor's
  // payment settings.
  if (data.payment && data.payment.kind !== "stripe") {
    const result = await upsertVendorConfig(user.id, data.payment);
    if (!result.ok)
      return {
        success: false,
        error: `Could not save payment settings: ${result.error}`,
      };
  }

  const row = {
    name: data.name,
    image_url: data.image_url,
    is_active: data.is_active,
    hours,
    menu_items,
    payment: paymentMarker(data.payment?.kind),
    social_links: data.social_links,
    requires_arrival_confirm: data.requires_arrival_confirm,
  };

  return upsertBoothRow(supabase, row, data.boothId, user.id);
}

/**
 * Flip a single booth's is_active without going through the full booth-edit
 * form — a quick pause/resume for a vendor managing rush-hour pace (toggle
 * off to let a backlog clear, back on once caught up), not a booth-details
 * edit. Same free-plan single-active-booth cap as saveBooth when turning ON;
 * turning OFF is always allowed (never blocks giving yourself a breather).
 */
export async function toggleBoothActive(
  boothId: string,
  active: boolean,
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };

  const { user, entitlement } = await loadEntitlement();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = await createServerClient();

  if (active && entitlement.maxBooths !== null) {
    const capError = await checkActiveBoothCap(
      supabase,
      user.id,
      entitlement.maxBooths,
      boothId,
      "toggleBoothActive",
    );
    if (capError) return { success: false, error: capError };
  }

  // RLS (booths_vendor_all) scopes the update to this vendor's own booths.
  const { data: updated, error } = await supabase
    .from("booths")
    .update({ is_active: active })
    .eq("id", boothId)
    .select("id")
    .maybeSingle();
  if (error || !updated)
    return { success: false, error: "Could not update booth" };

  revalidatePath("/dashboard", "layout");
  return { success: true };
}
