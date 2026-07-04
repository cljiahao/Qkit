"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquarePlus,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FeedbackForm } from "@/components/feedback-form";
import { SupportForm } from "@/components/support-form";
import { MediaImage } from "@/components/media-image";
import { cn } from "@/lib/utils";
import type { Tier } from "@/lib/plan";

const LINKS = [
  { href: "/dashboard", label: "Orders" },
  { href: "/dashboard/booths", label: "Booths" },
  { href: "/dashboard/stats", label: "Stats" },
  { href: "/dashboard/plan", label: "Plan" },
];

function isActive(path: string, href: string): boolean {
  return href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);
}

/** Stable anchor id for the onboarding tour, e.g. "/dashboard/booths" → "nav-booths". */
function tourAnchor(href: string): string {
  return `nav-${href === "/dashboard" ? "orders" : href.split("/").pop()}`;
}

/** Up to two initials from a stall name; falls back to a bullet when blank. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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

/**
 * Dashboard nav. On a phone the page links collapse behind a burger so the bar
 * never overflows; from sm up they sit inline. The account menu (avatar + name)
 * is present at every width and carries Profile, Feedback, and Sign out.
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
  const [open, setOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const path = usePathname();

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Inline page links — sm and up */}
        <div className="hidden items-center gap-2 sm:flex">
          {LINKS.map((l) => (
            <Button
              key={l.href}
              asChild
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-lg",
                isActive(path, l.href) && "bg-primary/10 text-primary",
              )}
            >
              <Link href={l.href} data-tour={tourAnchor(l.href)}>
                {l.label}
              </Link>
            </Button>
          ))}
        </div>

        {/* Burger — below sm (page links only) */}
        <Button
          variant="ghost"
          size="icon"
          data-tour="nav-menu"
          className="rounded-lg sm:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>

        {/* Account menu — every width */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-tour="nav-account"
              aria-label="Account menu"
              className="flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 text-left transition-colors outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span
                aria-hidden
                className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-md ring-1 ring-primary/25 ring-inset"
              >
                {avatarUrl ? (
                  <MediaImage
                    src={avatarUrl}
                    alt=""
                    fill
                    sizes="2rem"
                    className="object-cover"
                  />
                ) : (
                  <span className="font-mono grid size-full place-items-center bg-primary/12 text-xs font-semibold tracking-tight text-primary">
                    {initials(vendorName)}
                  </span>
                )}
              </span>
              <span className="hidden max-w-[9rem] truncate text-sm font-semibold md:inline">
                {vendorName || "Account"}
              </span>
              <ChevronDown className="hidden size-4 text-muted-foreground md:inline" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <DropdownMenuLabel className="px-2 py-2">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">
                  {vendorName || "Your stall"}
                </p>
                <TierBadge tier={tier} />
              </div>
              <p className="text-xs font-normal text-muted-foreground">
                Vendor account
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile" className="cursor-pointer">
                <User className="size-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => setHelpOpen(true)}
            >
              <LifeBuoy className="size-4" />
              Get help
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => setFeedbackOpen(true)}
            >
              <MessageSquarePlus className="size-4" />
              Feedback
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={signOut}>
              <DropdownMenuItem asChild variant="destructive">
                <button type="submit" className="w-full cursor-pointer">
                  <LogOut className="size-4" />
                  Sign out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile page-links panel */}
      {open && (
        <>
          {/* Tap-away scrim */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default sm:hidden"
          />
          <div className="absolute inset-x-0 top-full z-40 border-b border-border bg-background/95 px-5 py-3 shadow-sm backdrop-blur-md sm:hidden">
            <div className="mx-auto flex max-w-7xl flex-col gap-1">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-sm font-semibold",
                    isActive(path, l.href)
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-secondary",
                  )}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Help drawer — opened from the account menu */}
      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">Get help</SheetTitle>
            <SheetDescription>
              Trouble with a pass, payment, or your Pro plan? Tell us and
              we&apos;ll sort it out.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <SupportForm />
          </div>
        </SheetContent>
      </Sheet>

      {/* Feedback drawer — opened from the account menu */}
      <Sheet open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">
              Share feedback
            </SheetTitle>
            <SheetDescription>
              What&apos;s working, what&apos;s missing, what&apos;s broken? We
              read every note.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <FeedbackForm
              source="vendor"
              metric="nps"
              prompt="How likely are you to recommend QKit to another vendor?"
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
