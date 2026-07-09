import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { SettingsForm } from "./settings-form";

export const revalidate = 0;

export default async function SettingsPage() {
  const { vendor } = await requireEntitledVendor();

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Live orders
        </p>
        <h1 className="font-display text-4xl font-semibold leading-none">
          Board settings
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          How the order board alerts you and flags a ticket that&apos;s waiting
          too long. Synced to your account, so it follows you to any device.
        </p>
      </header>

      <SettingsForm initial={vendor.board_settings} />
    </div>
  );
}
