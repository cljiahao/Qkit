import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createServerClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: vendor } = await supabase
    .from("vendors")
    .select("name")
    .eq("id", user.id)
    .single();

  async function signOut() {
    "use server";
    const supabase = await createServerClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 px-5 py-3.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
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
          <form action={signOut}>
            <Button
              variant="outline"
              size="sm"
              type="submit"
              className="rounded-lg"
            >
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-7">
        {children}
      </main>
    </div>
  );
}
