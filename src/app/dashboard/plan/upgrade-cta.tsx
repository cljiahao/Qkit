"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { logEvent } from "@/app/actions/events";
import { requestUpgrade } from "@/app/actions/purchase";

/**
 * Interest CTA for a pricing rung. Files an in-product request the admin
 * actions (no email), and logs the click for the admin funnel. Payment is
 * collected out-of-band (PayNow / cash) and the pass is granted manually.
 */
export function UpgradeCta({
  option,
  label,
  variant = "default",
}: {
  option: "event" | "monthly";
  label: string;
  variant?: "default" | "outline";
}) {
  const [pending, start] = useTransition();

  function onClick() {
    start(async () => {
      void logEvent("upgrade_cta", { option });
      const res = await requestUpgrade(option);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("Request sent — we'll set you up shortly.");
    });
  }

  return (
    <Button
      size="lg"
      variant={variant}
      disabled={pending}
      onClick={onClick}
      className="h-12 w-full rounded-xl text-base font-semibold"
    >
      {pending ? "Sending…" : label}
    </Button>
  );
}
