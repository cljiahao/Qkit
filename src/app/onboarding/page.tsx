import { redirect } from "next/navigation";
import { getVendor } from "@/lib/supabase/get-vendor";
import { OnboardingForm } from "./onboarding-form";

export const revalidate = 0;

export default async function OnboardingPage() {
  const { user, vendor } = await getVendor();
  if (!user) redirect("/login");
  if (vendor) redirect("/dashboard");
  return <OnboardingForm />;
}
