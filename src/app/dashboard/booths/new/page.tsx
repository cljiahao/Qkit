import { redirect } from "next/navigation";
import { getVendor } from "@/lib/supabase/get-vendor";
import { BoothForm } from "../booth-form";

export const revalidate = 0;

export default async function NewBoothPage() {
  const { user, vendor } = await getVendor();
  if (!user) redirect("/login");
  if (!vendor) redirect("/onboarding");

  return (
    <div>
      <h1 className="font-display mb-6 text-3xl font-semibold">New booth</h1>
      <BoothForm vendorId={vendor.id} />
    </div>
  );
}
