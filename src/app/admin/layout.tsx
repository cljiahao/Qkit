import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate every /admin route: non-admins get a 404 from requireAdmin.
  await requireAdmin();

  async function signOut() {
    "use server";
    const supabase = await createServerClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 px-5 py-3.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="font-display text-xl font-semibold tracking-tight">
            <span className="text-primary">Q</span>Kit
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Admin
            </span>
          </span>
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
      {children}
    </div>
  );
}
