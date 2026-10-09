"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

// The bordered track. Exported for the two switches that are form inputs (the
// booth form's UEN/mobile and link/QR choices): those stay a ToggleGroup, for
// its radio semantics, and only share the look.
export const SEGMENT_GROUP_CLASS =
  "inline-flex rounded-lg border border-border p-0.5";
const SEGMENT_ON_CLASS = "bg-primary/10 text-primary";
const SEGMENT_OFF_CLASS = "text-muted-foreground hover:text-foreground";

const SIZE = {
  md: { group: "text-sm", item: "px-3 py-1.5" },
  sm: { group: "text-xs", item: "px-2.5 py-1" },
} as const;

// Every pill is finger-sized on a touch screen, whatever its size on a mouse.
const ITEM_CLASS =
  "rounded-md font-medium transition-colors [@media(pointer:coarse)]:min-h-11";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  // An option the vendor's plan does not include: shown with a lock, and it
  // goes to this page (the upgrade page) instead of switching.
  lockedHref?: string;
  lockedTitle?: string;
}

/**
 * A row of pills with exactly one active: a view switch (sort order, date
 * range, ranking), not a form input. Each pill is a button carrying
 * aria-pressed, inside a labelled group.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: keyof typeof SIZE;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(SEGMENT_GROUP_CLASS, SIZE[size].group)}
    >
      {options.map((option) =>
        option.lockedHref ? (
          <Link
            key={option.value}
            href={option.lockedHref}
            title={option.lockedTitle}
            className={cn(
              ITEM_CLASS,
              SIZE[size].item,
              "flex items-center gap-1 text-muted-foreground/60 hover:text-foreground",
            )}
          >
            <Lock className="size-3" />
            {option.label}
          </Link>
        ) : (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={cn(
              ITEM_CLASS,
              SIZE[size].item,
              value === option.value ? SEGMENT_ON_CLASS : SEGMENT_OFF_CLASS,
            )}
          >
            {option.label}
          </button>
        ),
      )}
    </div>
  );
}
