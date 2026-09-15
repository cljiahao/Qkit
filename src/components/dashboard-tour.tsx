"use client";

import { usePathname } from "next/navigation";
import { DashboardTours, type TourDefinition } from "@merqo/ui";
import { ordersTourSteps, boothsTourSteps } from "./tour-steps";
import { markTourSeen } from "@/app/dashboard/tour-actions";
import type { ToursSeen } from "@/lib/types";

// Matches Tailwind's `sm` breakpoint: below 640px the nav links collapse
// behind the burger, so the mobile step list spotlights that instead.
// Resolved lazily (only at tour-start time, per @merqo/ui's `steps` contract)
// rather than during render, so this stays SSR-safe.
function resolveOrdersSteps() {
  const isMobile =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 639px)").matches;
  return ordersTourSteps(isMobile);
}

const TOURS: TourDefinition[] = [
  { id: "orders", route: "/dashboard", steps: resolveOrdersSteps },
  { id: "booths", route: "/dashboard/booths", steps: boothsTourSteps },
];

/**
 * qkit's wiring for `@merqo/ui`'s `DashboardTours`: supplies this kit's own
 * per-page tour content and mark-seen action, while the tour mechanism
 * itself (driver.js lifecycle, floating replay button, popover styling,
 * route-to-tour matching) is fully owned by the shared components.
 */
export function DashboardTour({ toursSeen }: { toursSeen: ToursSeen }) {
  const pathname = usePathname();

  return (
    <DashboardTours
      tours={TOURS}
      pathname={pathname}
      seenTourIds={Object.keys(toursSeen)}
      onFirstSeen={markTourSeen}
      scopeClassName="qkit-tour"
    />
  );
}
