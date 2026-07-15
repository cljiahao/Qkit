// Pure step config for the dashboard onboarding tour. No driver.js import here
// so it stays node-unit-testable; the controller maps these to driver's Config.

export type TourStep = {
  /** CSS selector for the element to spotlight. */
  element: string;
  title: string;
  description: string;
};

const sel = (tour: string) => `[data-tour="${tour}"]`;

// Desktop: nav links are visible, so we can spotlight each landmark.
const DESKTOP: TourStep[] = [
  {
    element: sel("order-board"),
    title: "Your live order board",
    description:
      "Welcome to qkit. Orders land here the moment a customer taps Order — no refresh, no reload.",
  },
  {
    element: sel("nav-booths"),
    title: "Start here: Booths",
    description:
      "Build your stall, add your menu, and get a QR code. This is step one to going live.",
  },
  {
    element: sel("nav-stats"),
    title: "Stats",
    description:
      "Track your sales and how fast you're serving, once orders start rolling in.",
  },
  {
    element: sel("nav-plan"),
    title: "Plan",
    description:
      "Free covers the basics. Upgrade to Pro whenever you're ready for more.",
  },
  {
    element: sel("tour-replay"),
    title: "Replay anytime",
    description:
      "Tap here to run this tour again whenever you like. Now — go create your first booth →",
  },
];

// Mobile: nav is collapsed behind the hamburger, so spotlight that instead of
// the hidden links (driver can't highlight an off-screen element).
const MOBILE: TourStep[] = [
  DESKTOP[0],
  {
    element: sel("nav-menu"),
    title: "Your sections",
    description:
      "Your Booths, Stats, and Plan all live in here. Start with Booths to set up your stall.",
  },
  DESKTOP[DESKTOP.length - 1],
];

/** The tour steps for the current layout. */
export function tourSteps(isMobile: boolean): TourStep[] {
  return isMobile ? MOBILE : DESKTOP;
}
