import { requireVendor } from "@/lib/supabase/get-vendor";
import { ProfileForm } from "./profile-form";

export const revalidate = 0;

export default async function ProfilePage() {
  const { user, vendor } = await requireVendor();

  // display_name is arbitrary JSON on the auth user — read defensively.
  const raw = user.user_metadata?.display_name;
  const displayName = typeof raw === "string" ? raw : "";

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Your account
        </p>
        <h1 className="font-display text-4xl font-semibold leading-none">
          Profile
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your stall name, how we address you, and your sign-in password. Each
          section saves on its own.
        </p>
      </header>

      <ProfileForm
        stallName={vendor.name}
        displayName={displayName}
        email={user.email ?? ""}
      />
    </div>
  );
}
