import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { ProfileForm } from "./profile-form";

export const revalidate = 0;

export default async function ProfilePage() {
  // Same primed entitlement cache as the layout — avoids a second vendor read.
  const { user, vendor } = await requireEntitledVendor();

  // display_name and avatar_url are arbitrary JSON on the auth user — read
  // defensively. avatar_url is the vendor's optional custom profile icon.
  const raw = user.user_metadata?.display_name;
  const displayName = typeof raw === "string" ? raw : "";
  const rawAvatar = user.user_metadata?.avatar_url;
  const avatarUrl = typeof rawAvatar === "string" ? rawAvatar : null;

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
          Your stall name, profile icon, how we address you, and your sign-in
          password. Each section saves on its own.
        </p>
      </header>

      <ProfileForm
        stallName={vendor.name}
        displayName={displayName}
        email={user.email ?? ""}
        vendorId={user.id}
        avatarUrl={avatarUrl}
      />
    </div>
  );
}
