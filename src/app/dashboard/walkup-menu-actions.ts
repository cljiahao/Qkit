"use server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { parseMenuItems } from "@/lib/schemas";
import { parseRemaining } from "@/lib/stock";
import type { MenuItem } from "@/lib/types";
import type { Remaining } from "@/lib/stock";

const boothIdSchema = z.string().uuid();

/**
 * The menu + live stock for one of the caller's own booths, for the walk-up
 * order sheet. Mirrors o/[code]/page.tsx's read shape (unfiltered menu items
 * — an "unavailable" item is rejected server-side by place_walkup_order, not
 * hidden client-side, same as the customer flow) but scoped by RLS to the
 * vendor's own booth instead of a public short_code lookup.
 */
export async function getWalkupMenu(
  boothId: string,
): Promise<{ menuItems: MenuItem[]; remaining: Remaining } | null> {
  if (!boothIdSchema.safeParse(boothId).success) return null;

  const supabase = await createServerClient();
  // RLS (booths_vendor_all) scopes this to the caller's own booths; a
  // foreign or nonexistent id returns null.
  const { data: booth } = await supabase
    .from("booths")
    .select("id, menu_items")
    .eq("id", boothId)
    .maybeSingle();
  if (!booth) return null;

  const { data: remainingData } = await supabase.rpc("booth_remaining_stock", {
    p_booth_id: boothId,
  });

  return {
    menuItems: parseMenuItems(booth.menu_items),
    remaining: parseRemaining(remainingData),
  };
}
