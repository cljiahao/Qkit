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
      "Orders land here the moment a customer taps Order, no refresh needed. Tap Start now to accept one, Mark Ready when it's done, and Mark Picked Up once they collect it. If a customer pays you first, confirm it with Confirm payment received." +
      '<div class="tour-example"><div class="tour-example-label">Example order</div><div class="tour-example-row" style="margin-top:0.35rem"><strong>#118 &middot; Oat Flat White &times;2</strong><span class="tour-example-pill">Preparing</span></div></div>',
  },
  {
    element: sel("order-board"),
    title: "Two more things worth knowing",
    description:
      "Need to jump someone to the front? Tap the bump icon on their card. And don't worry about forgetting a ready order: one you don't clear yourself auto-completes after your configured timeout, which you can tune from Settings, so the board never clutters up.",
  },
  {
    element: sel("new-order"),
    title: "Customer walks up to you in person?",
    description:
      "Tap New order to log it yourself, right from the board. No QR code needed for a face-to-face order.",
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
      "Tap here to run this tour again whenever you like. Ready? Go create your first booth.",
  },
];

// Mobile: nav is collapsed behind the hamburger, so spotlight that instead of
// the hidden links (driver can't highlight an off-screen element). The
// "New order" button isn't nav-collapsed on mobile (only its text label
// shortens), so it keeps its own real anchor here too.
const MOBILE: TourStep[] = [
  DESKTOP[0],
  DESKTOP[1],
  DESKTOP[2],
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
