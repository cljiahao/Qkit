"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logEvent } from "@/app/actions/events";

/** Contact-to-upgrade button that logs the click before opening the mail draft. */
export function UpgradeCta() {
  return (
    <Button
      asChild
      size="lg"
      className="mt-5 h-12 rounded-xl text-base font-semibold"
    >
      <a
        href="mailto:cljiahao27@gmail.com?subject=QKit%20Pro%20upgrade"
        onClick={() => void logEvent("upgrade_cta")}
      >
        <Sparkles className="size-4" /> Contact us to upgrade
      </a>
    </Button>
  );
}
