"use client";

import { Children, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  pageSize?: number;
  // "pager" = prev/next pages (structured tables); "more" = Load more + Show
  // less (feeds). Per 2026 UX consensus.
  variant?: "pager" | "more";
  className?: string;
  // noun for the "more" button, e.g. "reviews"
  label?: string;
}

/**
 * Client-side pager over a list of pre-rendered rows. The server renders every
 * row; this slices them so long lists stay scannable. Two shapes:
 * - pager: prev/next with an "x–y of N" readout (admin tables).
 * - more:  Load more / Show less (customer + vendor feeds).
 */
export function Paginated({
  children,
  pageSize = 10,
  variant = "pager",
  className,
  label = "more",
}: Props) {
  const items = Children.toArray(children);
  const total = items.length;
  const [page, setPage] = useState(0);
  const [shown, setShown] = useState(pageSize);

  if (variant === "more") {
    const visible = items.slice(0, shown);
    return (
      <div>
        <div className={className}>{visible}</div>
        {(shown < total || shown > pageSize) && (
          <div className="mt-2 flex gap-4 text-xs font-medium">
            {shown < total && (
              <button
                type="button"
                onClick={() => setShown((s) => Math.min(s + pageSize, total))}
                className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                Show more ({total - shown} {label})
              </button>
            )}
            {shown > pageSize && (
              <button
                type="button"
                onClick={() => setShown(pageSize)}
                className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                Show less
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(page, pages - 1);
  const start = clamped * pageSize;
  const visible = items.slice(start, start + pageSize);

  return (
    <div>
      <div className={className}>{visible}</div>
      {total > pageSize && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono">
            {start + 1}–{Math.min(start + pageSize, total)} of {total}
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              disabled={clamped === 0}
              onClick={() => setPage(clamped - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              disabled={clamped >= pages - 1}
              onClick={() => setPage(clamped + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
