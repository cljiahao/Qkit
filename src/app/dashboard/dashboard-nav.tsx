"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, MessageSquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Orders" },
  { href: "/dashboard/booths", label: "Booths" },
  { href: "/dashboard/stats", label: "Stats" },
  { href: "/dashboard/plan", label: "Plan" },
];

function isActive(path: string, href: string): boolean {
  return href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);
}

/**
 * Dashboard nav. On a phone the links collapse behind a burger so the bar never
 * overflows; from sm up they sit inline. Sign out runs the passed server action.
 */
export function DashboardNav({ signOut }: { signOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();

  return (
    <>
      {/* Inline nav — sm and up */}
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
            <Link href={l.href}>{l.label}</Link>
          </Button>
        ))}
        <Button
          asChild
          size="sm"
          variant="outline"
          className="rounded-lg border-primary/40 text-primary hover:bg-primary/10"
        >
          <Link href="/dashboard/feedback" className="gap-1.5">
            <MessageSquarePlus className="size-4" />
            Feedback
          </Link>
        </Button>
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

      {/* Burger — below sm */}
      <Button
        variant="ghost"
        size="icon"
        className="rounded-lg sm:hidden"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </Button>

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
              <Link
                href="/dashboard/feedback"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10"
              >
                <MessageSquarePlus className="size-4" />
                Feedback
              </Link>
              <form action={signOut} className="pt-1">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-muted-foreground hover:bg-secondary"
                >
                  <X className="size-4" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
