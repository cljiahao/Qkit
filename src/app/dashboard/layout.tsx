import { redirect } from "next/navigation";
import Link from "next/link";
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
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 px-5 py-3.5 backdrop-blur-md print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <Link
              href="/dashboard"
              className="font-display text-2xl font-semibold tracking-tight"
            >
              <span className="text-primary">Q</span>Kit
            </Link>
            {vendor && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {vendor.name}
              </span>
            )}
          </div>
          <DashboardNav
            signOut={signOut}
            vendorName={vendor?.name ?? ""}
            avatarUrl={avatarUrl}
            tier={entitlement.tier}
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-7">
        {children}
      </main>
      {/* Only once onboarded — a brand-new user briefly hits /dashboard before
          the page redirects to /onboarding, and the tour must not flash there. */}
      {vendor && <DashboardTour seen={!!vendor.tour_seen_at} />}
    </div>
  );
}
