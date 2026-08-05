"use client";

import { usePathname, useRouter } from "next/navigation";
import { DashboardTour as SharedDashboardTour } from "@merqo/ui";
import { tourSteps } from "./tour-steps";
import { markTourSeen } from "@/app/dashboard/tour-actions";

// Matches Tailwind's `sm` breakpoint: below 640px the nav links collapse
// behind the burger, so the mobile step list spotlights that instead.
// Resolved lazily (only at tour-start time, per @merqo/ui's `steps` contract)
// rather than during render, so this stays SSR-safe.
function resolveTourSteps() {
  const isMobile =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 639px)").matches;
  return tourSteps(isMobile);
}

/**
 * qkit's wiring for `@merqo/ui`'s `DashboardTour`: supplies this kit's own
 * step content, mark-seen action, and routing, while the tour mechanism
 * itself (driver.js lifecycle, floating replay button, popover styling) is
 * fully owned by the shared component.
 */
export function DashboardTour({ seen }: { seen: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <SharedDashboardTour
      steps={resolveTourSteps}
      seen={seen}
      onFirstSeen={markTourSeen}
      isHomeRoute={pathname === "/dashboard"}
      navigateHome={() => router.push("/dashboard")}
      scopeClassName="qkit-tour"
    />
  );
}
