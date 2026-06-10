import { redirect } from "next/navigation";
import { getVendor } from "@/lib/supabase/get-vendor";
import { isAdmin } from "@/lib/admin";
import { OnboardingForm } from "./onboarding-form";

export const revalidate = 0;

export default async function OnboardingPage() {
  const { user, vendor } = await getVendor();
  if (!user) redirect("/login");
  if (await isAdmin(user.id)) redirect("/admin");
  if (vendor) redirect("/dashboard");
  return <OnboardingForm />;
}
