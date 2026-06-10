import { notFound } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getVendor } from "@/lib/supabase/get-vendor";
import type { Vendor } from "@/lib/types";

/**
 * Admin gate for /admin pages and admin server actions. Non-admins (and signed-
 * out users) get a 404 — the route's existence isn't revealed. Returns the
 * authenticated admin's user + vendor row.
 */
export async function requireAdmin(): Promise<{ user: User; vendor: Vendor }> {
  const { user, vendor } = await getVendor();
  if (!user || !vendor || !vendor.is_admin) notFound();
  return { user, vendor };
}
