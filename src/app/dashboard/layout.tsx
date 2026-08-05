import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { loadEntitlement } from "@/lib/supabase/get-entitlement";
import { isAdmin } from "@/lib/admin";
import { DashboardNav } from "./dashboard-nav";
import { DashboardTour } from "@/components/dashboard-tour";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // loadEntitlement resolves the user, their vendor row, and effective plan in
  // one memoized round-trip — the account menu needs the tier badge, and the
  // vendor row still carries name + tour_seen_at.
  const { user, vendor, entitlement } = await loadEntitlement();

  if (!user) redirect("/login");

  // Admins have no vendor row and don't use the vendor dashboard.
  if (await isAdmin(user.id)) redirect("/admin");

  // A brand-new user hits /dashboard before onboarding — redirect here, before
  // this layout's header shell renders, instead of letting DashboardPage
  // redirect after the shell already painted (the blank-flash bug).
  if (!vendor) redirect("/onboarding");

  // Custom profile icon lives on the auth user's metadata (no schema change).
  const rawAvatar = user.user_metadata?.avatar_url;
  const avatarUrl = typeof rawAvatar === "string" ? rawAvatar : null;

  async function signOut() {
    "use server";
    const supabase = await createServerClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/*
        @merqo/ui's DashboardNav renders its own <header> (sticky/border/
        padding already baked in) — this used to be qkit's own <header>
        wrapper before DashboardNav composed the shared component, but two
        <header> landmarks nested inside each other double the border/
        padding and are invalid semantics. A plain <div> keeps the one thing
        that <header> wasn't already covering (print:hidden) without adding
        a second landmark.
      */}
      <div className="print:hidden">
        <DashboardNav
          signOut={signOut}
          vendorName={vendor.name}
          avatarUrl={avatarUrl}
          tier={entitlement.tier}
        />
      </div>
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-7">
        {children}
      </main>
      <DashboardTour seen={!!vendor.tour_seen_at} />
    </div>
  );
}
