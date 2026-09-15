"use server";

import { createServerClient } from "@/lib/supabase/server";
import { tourIdSchema } from "@/lib/tour-ids";

/**
 * Mark one dashboard tour (by tourId) as seen for the current vendor, so it
 * stops auto-running on this page. Best-effort: this is cosmetic, so a
 * failure is logged but never surfaced — the worst case is that tour shows
 * once more. Reads-then-merges rather than a single-column write, since
 * tours_seen holds every tour's own entry and a plain overwrite would
 * clobber whichever other tours the vendor has already seen. RLS scopes both
 * the read and the update to the vendor's own row (id = auth.uid()).
 *
 * `tourId` is parsed through tourIdSchema before it's ever used as an object
 * key: a server action is a real HTTP endpoint, callable with any argument
 * regardless of what the UI ever sends, so an unvalidated tourId would let a
 * caller write an arbitrary key into tours_seen (CodeQL: remote property
 * injection). The parsed value, not the raw argument, is what gets used
 * below.
 */
export async function markTourSeen(tourId: string): Promise<void> {
  const parsed = tourIdSchema.safeParse(tourId);
  if (!parsed.success) return;
  const validTourId = parsed.data;

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
        [validTourId]: new Date().toISOString(),
      },
    })
    .eq("id", user.id);

  if (error) console.error("markTourSeen failed", error.message);
}
