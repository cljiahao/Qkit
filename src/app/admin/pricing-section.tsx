"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PricingForm } from "@merqo/ui";
import { setPricing } from "./actions";
import type { PricingConfig } from "@/lib/pricing";

/**
 * Wires @merqo/ui's generic PricingForm to qkit's two fields
 * (event_pass_cents, monthly_cents) and this kit's own setPricing action +
 * toast convention. The component itself never imports sonner or touches
 * Supabase — onSave resolving/rejecting is the only contract.
 */
export function PricingSection({ initial }: { initial: PricingConfig }) {
  const router = useRouter();

  return (
    <PricingForm
      fields={[
        { key: "event_pass_cents", label: `Event pass (${initial.currency})` },
        { key: "monthly_cents", label: `Monthly (${initial.currency})` },
      ]}
      initial={{
        values: {
          event_pass_cents: initial.event_pass_cents,
          monthly_cents: initial.monthly_cents,
        },
        currency: initial.currency,
      }}
      onSave={async (values) => {
        const res = await setPricing({
          event_pass_cents: values.event_pass_cents,
          monthly_cents: values.monthly_cents,
        });
        if (!res.success) throw new Error(res.error);
        toast.success("Pricing updated");
        router.refresh();
      }}
      onError={(err) =>
        toast.error(
          err instanceof Error ? err.message : "Could not update pricing",
        )
      }
      helpText="Shown on the vendor plan page. Payment is collected out-of-band (PayNow / cash); grant a pass below once paid."
    />
  );
}
