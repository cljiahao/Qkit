import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { canAddBooth } from "@/lib/plan";
import { BoothForm } from "../booth-form";

export const revalidate = 0;

export default async function NewBoothPage() {
  const { vendor, entitlement } = await requireEntitledVendor();

  // Plan gate: free vendors get one booth (an active pass/Pro lifts it). RLS is
  // the real backstop; this just sends them to the upgrade page instead of a
  // failed save.
  const supabase = await createServerClient();
  const { count } = await supabase
    .from("booths")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendor.id);
  if (!canAddBooth(entitlement, count ?? 0)) {
    redirect("/dashboard/plan");
  }

  return (
    <div>
      <h1 className="font-display mb-6 text-3xl font-semibold">New booth</h1>
      <BoothForm vendorId={vendor.id} entitlement={entitlement} />
    </div>
  );
}
