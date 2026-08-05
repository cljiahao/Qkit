"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardNav as SharedDashboardNav } from "@merqo/ui";
import { cn } from "@/lib/utils";
import type { Tier } from "@/lib/plan";
import type { SupportMessageInput } from "@/lib/schemas";
import { submitFeedback } from "@/app/actions/feedback";
import { submitSupportMessage } from "@/app/actions/support";

const LINKS = [
  { href: "/dashboard", label: "Orders" },
  { href: "/dashboard/completed", label: "Completed" },
  { href: "/dashboard/booths", label: "Booths" },
  { href: "/dashboard/stats", label: "Stats" },
];

function isActive(path: string, href: string): boolean {
  return href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);
}

/** Stable anchor id for the onboarding tour, e.g. "/dashboard/booths" → "nav-booths". */
function tourAnchor(href: string): string {
  return `nav-${href === "/dashboard" ? "orders" : href.split("/").pop()}`;
}

// A small mono "ticket stamp" for the account's plan. Free reads as a quiet
// muted chip; Pass borrows the amber account tint; Pro is the one that pops,
// in emerald, so an upgraded stall is legible at a glance.
const TIER_BADGE: Record<Tier, { label: string; className: string }> = {
  free: {
    label: "Free",
    className: "bg-secondary text-muted-foreground ring-border",
  },
  pass: {
    label: "Pass",
    className: "bg-primary/12 text-primary ring-primary/25",
  },
  pro: {
    label: "Pro",
    className:
      "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:bg-emerald-400/15 dark:text-emerald-400 dark:ring-emerald-400/30",
  },
};

function TierBadge({ tier }: { tier: Tier }) {
  const { label, className } = TIER_BADGE[tier];
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-wider ring-1 ring-inset",
        className,
      )}
    >
      {label}
    </span>
  );
}

// Mirrors support-form.tsx's own category list/labels so a vendor sees the
// same wording whether they file a help request from the nav's Get-help
// sheet or (in principle) any other entry point onto the same categories.
const HELP_CATEGORIES: {
  value: SupportMessageInput["category"];
  label: string;
}[] = [
  { value: "pass", label: "Event pass" },
  { value: "payment", label: "Payment" },
  { value: "pro", label: "Pro / billing" },
  { value: "other", label: "Something else" },
];

/**
 * Dashboard nav — composes `@merqo/ui`'s `DashboardNav`/`AccountMenu` for the
 * sticky header row (burger + inline links + account dropdown) instead of
 * hand-rolling it. This file now owns only qkit-specific bits: the wordmark,
 * the link list, active-route/tour-anchor logic, the tier badge, and thin
 * throw-adapting wrappers around `submitFeedback`/`submitSupportMessage` (both
 * return a `{success, error}` result rather than throwing, but the shared
 * component's `onSubmit` contract requires a promise that rejects on
 * failure so its own inline error UI can surface it).
 */
export function DashboardNav({
  signOut,
  vendorName = "",
  avatarUrl = null,
  tier = "free",
}: {
  signOut: () => Promise<void>;
  vendorName?: string;
  avatarUrl?: string | null;
  tier?: Tier;
}) {
  const path = usePathname();

  return (
    <SharedDashboardNav
      wordmark={
        <Link
          href="/dashboard"
          aria-label="qkit dashboard home"
          className="font-display shrink-0 text-3xl font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          <span className="text-primary">Q</span>Kit
        </Link>
      }
      navLinks={LINKS}
      isActiveHref={(href) => isActive(path, href)}
      tourAnchor={tourAnchor}
      vendor={{
        name: vendorName || "Account",
        avatarUrl: avatarUrl ?? undefined,
        tier,
        subtitle: "Vendor account",
      }}
      signOutAction={signOut}
      kitLocalSettingsHref="/dashboard/settings"
      tierBadge={<TierBadge tier={tier} />}
      getHelp={{
        type: "form",
        onSubmit: async ({ message, category }) => {
          const res = await submitSupportMessage({
            category: (category ?? "other") as SupportMessageInput["category"],
            body: message,
          });
          if (!res.success) throw new Error(res.error);
        },
        categories: HELP_CATEGORIES,
      }}
      onFeedbackSubmit={async ({ message, nps }) => {
        const res = await submitFeedback({ source: "vendor", nps, message });
        if (!res.success) throw new Error(res.error);
      }}
      feedbackSource="vendor"
      feedbackMetric="nps"
      showNps
    />
  );
}
