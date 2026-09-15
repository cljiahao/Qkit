"use server";

import { createServerClient } from "@/lib/supabase/server";
import { TOUR_IDS, type TourId } from "@/components/tour-steps";

/**
 * Mark one dashboard tour (by tourId) as seen for the current vendor, so it
 * stops auto-running on this page. Best-effort: this is cosmetic, so a
 * failure is logged but never surfaced — the worst case is that tour shows
 * once more. Reads-then-merges rather than a single-column write, since
 * tours_seen holds every tour's own entry and a plain overwrite would
 * clobber whichever other tours the vendor has already seen. RLS scopes both
 * the read and the update to the vendor's own row (id = auth.uid()).
 *
 * `tourId` is validated against TOUR_IDS before it's ever used as an object
 * key: a server action is a real HTTP endpoint, callable with any argument
 * regardless of what the UI ever sends, so an unchecked tourId would let a
 * caller write an arbitrary key into tours_seen (CodeQL: remote property
 * injection).
 */
export async function markTourSeen(tourId: string): Promise<void> {
  if (!TOUR_IDS.includes(tourId as TourId)) return;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: vendor } = await supabase
    .from("vendors")
    .select("tours_seen")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("vendors")
    .update({
      tours_seen: {
        ...(vendor?.tours_seen ?? {}),
        [tourId]: new Date().toISOString(),
      },
    })
    .eq("id", user.id);

  if (error) console.error("markTourSeen failed", error.message);
}
