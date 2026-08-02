"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { type Driver } from "driver.js";
import { tourSteps } from "./tour-steps";
import { markTourSeen } from "@/app/dashboard/tour-actions";
import "./tour.css";

// driver.js (+ its CSS) is loaded lazily, only when the tour actually runs — it
// auto-runs at most once per vendor, so statically importing it would ship the
// library in every dashboard page's bundle for nothing. The type import above is
// erased at compile time (no runtime cost).
async function buildDriver(onDone: () => void): Promise<Driver> {
  // Matches Tailwind's `sm` breakpoint: below 640px the nav links collapse
  // behind the burger, so the mobile step list spotlights that instead.
  const isMobile =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 639px)").matches;

  const [{ driver }] = await Promise.all([
    import("driver.js"),
    import("driver.js/dist/driver.css"),
  ]);

  return driver({
    showProgress: true,
    allowClose: true,
    overlayOpacity: 0.6,
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    popoverClass: "qkit-tour",
    steps: tourSteps(isMobile).map((s) => ({
      element: s.element,
      popover: { title: s.title, description: s.description },
    })),
    onDestroyed: onDone,
  });
}

/**
 * Owns the dashboard onboarding tour: a floating "?" replay button plus the
 * driver.js overlay. Auto-runs once on the order board for vendors who haven't
 * seen it (server-tracked via `seen`); the button replays it anytime.
 */
export function DashboardTour({ seen }: { seen: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const driverRef = useRef<Driver | null>(null);
  // Set when replay is tapped from another page; the tour then runs once we
  // land back on the order board (step 1's anchor).
  const pendingReplay = useRef(false);

  async function start() {
    driverRef.current?.destroy();
    const d = await buildDriver(() => {
      driverRef.current = null;
    });
    driverRef.current = d;
    d.drive();
  }

  // Auto-run once on first visit, only on the order board (step 1's anchor).
  // Stamps tour-seen as soon as the tour starts, not when it ends: a hard
  // refresh mid-tour tears the page down before an onDestroyed-driven stamp
  // could complete, so waiting until the end let the tour re-run on every
  // refresh until a vendor finished it in one sitting.
  useEffect(() => {
    if (seen || pathname !== "/dashboard") return;
    void markTourSeen();
    const id = requestAnimationFrame(start);
    return () => cancelAnimationFrame(id);
    // Intentionally mount-only; replay is manual after this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tear the overlay down if we unmount mid-tour (e.g. a route change).
  useEffect(() => {
    return () => driverRef.current?.destroy();
  }, []);

  // Run a cross-page replay once we've actually arrived on the order board —
  // waits for the route + the anchor instead of guessing with a fixed delay.
  useEffect(() => {
    if (!pendingReplay.current || pathname !== "/dashboard") return;
    pendingReplay.current = false;
    const id = requestAnimationFrame(start);
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  function onReplay() {
    if (pathname !== "/dashboard") {
      // Step 1 spotlights the order board, so get there first, then run.
      pendingReplay.current = true;
      router.push("/dashboard");
      return;
    }
    start();
  }

  return (
    <button
      type="button"
      data-tour="tour-replay"
      onClick={onReplay}
      aria-label="Replay onboarding tour"
      className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105"
    >
      <CircleHelp className="h-6 w-6" />
    </button>
  );
}
