import type { ReactNode } from "react";
import { cn, EYEBROW_CLASS } from "@/lib/utils";

/**
 * The top of a dashboard or admin page: a small-caps label saying which area
 * this is, the page's title in the display font, and optionally a sentence
 * under it (passed as children).
 *
 * Renders only those elements, with no wrapper, so each page keeps its own
 * surrounding layout: a back link above, an action button beside.
 */
export function PageHeader({
  eyebrow,
  title,
  responsive = false,
  children,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  // One size down on a phone, for a page whose title shares its row with a
  // button.
  responsive?: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      <p className={EYEBROW_CLASS}>{eyebrow}</p>
      <h1
        className={cn(
          "font-display leading-none font-semibold",
          responsive ? "text-3xl sm:text-4xl" : "text-4xl",
        )}
      >
        {title}
      </h1>
      {children && (
        <p className="mt-2 text-sm text-muted-foreground">{children}</p>
      )}
    </>
  );
}
