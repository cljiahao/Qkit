"use client";

import { Button } from "@/components/ui/button";
import { logEvent } from "@/app/actions/events";

const SUBJECTS: Record<string, string> = {
  event: "QKit%20event%20pass",
  monthly: "QKit%20monthly%20Pro",
};

/**
 * Interest CTA for a pricing rung. Logs which option was clicked (feeds the
 * admin funnel) before opening the contact draft. Payment is collected
 * out-of-band (PayNow / cash) and a pass is granted manually — no Stripe yet.
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
  return (
    <Button
      asChild
      size="lg"
      variant={variant}
      className="h-12 w-full rounded-xl text-base font-semibold"
    >
      <a
        href={`mailto:cljiahao27@gmail.com?subject=${SUBJECTS[option]}`}
        onClick={() => void logEvent("upgrade_cta", { option })}
      >
        {label}
      </a>
    </Button>
  );
}
