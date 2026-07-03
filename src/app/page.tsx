import Link from "next/link";
import { Bell, ListChecks, QrCode, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingCta } from "@/components/landing-cta";
import { LandingBoardPreview } from "@/components/landing-board-preview";
import { FeaturedBooths } from "@/components/featured-booths";
import { createServerClient } from "@/lib/supabase/server";
import { DEFAULT_PRICING } from "@/lib/pricing";
import { formatPrice } from "@/lib/utils";

export const revalidate = 0;

const TRUST = ["No app", "No hardware", "Free to start"];

const STEPS = [
  {
    icon: ListChecks,
    title: "Build your booth",
    body: "Add menu items, photos, prices, and per-item options like size or spice — in minutes.",
  },
  {
    icon: QrCode,
    title: "Print the QR",
    body: "Each booth gets a printable QR poster. Stick it on the stall; customers scan to order.",
  },
  {
    icon: Bell,
    title: "Watch orders land",
    body: "Orders hit your live board in real time. Move them preparing → ready → done.",
  },
];

const MOAT = [
  {
    title: "Real-time, no app",
    body: "Customers order from the browser; you see it instantly. Nothing to install on either side.",
  },
  {
    title: "Runs the stall, not just the orders",
    body: "Queue-only or priced, one booth or many, drinks or food. Schedule open/close and cap stock so orders stop the moment you sell out — no babysitting the board.",
  },
  {
    title: "Know your numbers",
    body: "Revenue trends, your busiest day × hour, top sellers, and true profit margin per item — so you stock and staff the next event right.",
  },
];

const FAQ = [
  {
    q: "Do customers need to download anything?",
    a: "No. They scan the QR and order in their phone browser, then track status on the same page — nothing to install.",
  },
  {
    q: "How long does it take to set up?",
    a: "Minutes. Add your items, print the QR poster, stick it on the stall — you're taking orders.",
  },
  {
    q: "What do I need to run it?",
    a: "Any phone, tablet, or laptop with a browser. No app, no special hardware, no POS terminal.",
  },
  {
    q: "Can I take payment through QKit?",
    a: "Not yet. Orders land on your live board and you settle however you like — cash, PayNow, or your own terminal. Online card payment is on the roadmap.",
  },
  {
    q: "How much does it cost?",
    a: "Start free with one booth (up to 6 items) and today's stats. The full kit — extra booths, customization, auto-close, sold-out caps — is free while we're in beta: just ask and we'll unlock it for your next event. Per-event and monthly pricing arrive with card payments.",
  },
  {
    q: "Event pass or monthly — what's the difference?",
    a: "Same full features either way. A pass unlocks them for a single event (great for the occasional market); monthly keeps them on plus full sales history and trends across events (better if you trade most weeks). Both are free during beta — paid plans land with card payments.",
  },
  {
    q: "Can orders stop when I sell out?",
    a: "Yes. Set a stock limit per item and QKit counts it down as orders come in, then marks it sold out so customers can't order what you've run out of. Included with the event pass and monthly.",
  },
  {
    q: "Can I schedule when my booth takes orders?",
    a: "Yes. Set open/close hours and orders stop automatically outside them — no need to flip the booth off by hand. Included with the event pass and monthly.",
  },
  {
    q: "Does it work for non-food booths?",
    a: "Yes. Any booth that takes orders — drinks, snacks, merch — works. Items can be priced or queue-only.",
  },
];

// Vendor-facing troubleshooting — grounded in the actual app behaviour so a
// stall can self-serve common "why isn't this working" moments without support.
const VENDOR_FAQ = [
  {
    q: "I signed up but never reached a dashboard.",
    a: "Email sign-up needs confirmation first: after Create account you'll see a Check your email screen, and no session starts until you click the link (check spam). If it doesn't arrive, try Create account again with the same email to resend it. Signing in with Google skips this step.",
  },
  {
    q: "New orders stopped appearing on my board.",
    a: "The board updates live and now reconnects on its own — if the connection drops (tab asleep, patchy wifi) you'll see a Reconnecting notice, and it re-syncs any missed orders once it's back. If it still looks stuck, reload the page. Keeping the tab in the foreground helps.",
  },
  {
    q: "A customer tapped 'I've paid' but it still shows unpaid.",
    a: "That button only flags the order as Says paid — a self-reported claim, and it never auto-confirms. Once you've seen the PayNow/transfer land, tap Confirm payment received on the order card yourself; that's the only thing that flips it to Paid.",
  },
  {
    q: "My booth is Active but customers see 'not taking orders'.",
    a: "A booth serves only when it's Active, within its open hours, and within your plan's serve limit. The free plan serves one live booth at a time — if you have more (e.g. after an event pass ended), only your oldest active booth serves and the rest show as Paused. Renew a pass or Pro to serve them all, or deactivate the extras.",
  },
  {
    q: "My booth is Active but shows closed during the hours I set.",
    a: "Scheduled hours are always read in Singapore time (SGT), so check them against SGT. Hours are also a pass/Pro feature — on the free plan any saved hours are cleared, so a free booth is simply open when Active and closed when not.",
  },
  {
    q: "A customer says their order didn't go through.",
    a: "Usual causes: the QR/short code was regenerated (they need to rescan), the booth stopped serving (paused, inactive, or outside SGT hours), an item sold out or went unavailable mid-order, a line exceeded 20 of one item, or more than 8 orders came from the same network within a minute (clears after 60s). Ask them to rescan and retry — orders are atomic with an idempotency key, so a failed or retried attempt never double-charges or duplicates.",
  },
  {
    q: "I regenerated my QR and old printed codes stopped working.",
    a: "Regenerating a booth's QR is instant and permanent — every previously printed or saved link breaks immediately with This code expired, with no grace period. Only regenerate if a code leaked or is being abused, and reprint the new QR right away.",
  },
  {
    q: "My banner or menu photo won't upload.",
    a: "Use a JPEG, PNG, or WebP (not SVG or HEIC). Large phone photos are fine — the app resizes and re-encodes them in your browser before upload. A generic Upload failed is usually a flaky connection, so wait and retry. The image only sticks once you Save the booth or item — the preview swaps instantly, but nothing is stored until you save.",
  },
  {
    q: "My stats only show the last 24 hours.",
    a: "The 7-, 30-, and 90-day trend ranges are Pro-only. An event pass unlocks the operational features (extra booths, unlimited items, stock caps, auto-close hours) for its window, but its stats still show the 24-hour view. Go monthly Pro for longitudinal trends across events.",
  },
];

export default async function LandingPage() {
  const supabase = await createServerClient();
  const [
    {
      data: { user },
    },
    { data: pricingRow },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("pricing")
      .select("event_pass_cents, monthly_cents, currency")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const pricing = pricingRow ?? DEFAULT_PRICING;
  // Prices unset (= pre-Stripe beta) → the pass is a free trial granted on
  // request. Set prices in /admin to flip the page to paid/PayNow framing.
  const passPrice =
    pricing.event_pass_cents > 0 ? formatPrice(pricing.event_pass_cents) : null;
  const monthlyPrice =
    pricing.monthly_cents > 0 ? formatPrice(pricing.monthly_cents) : null;
  const paidMode = passPrice !== null || monthlyPrice !== null;

  const primaryHref = user ? "/dashboard" : "/login";
  const primaryLabel = user ? "Go to dashboard" : "Get started";

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <span className="font-display inline-flex items-baseline gap-0.5 text-2xl font-semibold tracking-tight">
          <span className="text-primary">Q</span>Kit
        </span>
        <div className="flex items-center gap-2">
          {user ? (
            <Button asChild variant="ghost" size="sm" className="rounded-lg">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="rounded-lg">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="rounded-lg">
                <Link href="/login">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-10 sm:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <ScanLine className="size-3.5" />
              Scan · order · track
            </span>
            <h1 className="font-display mt-6 text-5xl font-semibold leading-[1.05] sm:text-6xl">
              Live booth ordering,
              <br />
              minus the queue.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground lg:mx-0">
              QKit turns any booth into a QR-ordering stall. Customers scan and
              order from their phone; you watch every order land in real time.
            </p>
            <div className="mt-8 flex justify-center gap-3 lg:justify-start">
              <LandingCta
                href={primaryHref}
                event={user ? undefined : "landing_cta"}
                className="h-12 rounded-xl px-7 text-base font-semibold"
              >
                {primaryLabel}
              </LandingCta>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-xl px-7 text-base font-semibold"
              >
                <Link href="#how">See how</Link>
              </Button>
            </div>
          </div>
          <LandingBoardPreview />
        </div>
      </section>

      {/* Trust strip */}
      <section className="mx-auto max-w-5xl px-5 pb-14">
        <p className="text-center text-sm text-muted-foreground">
          Built in Singapore for hawker stalls, night-market &amp; event booths.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {TRUST.map((t) => (
            <span
              key={t}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* Featured booths — seam: hidden until real, consenting vendors exist.
          Future spec wires the data source (showcase opt-in + consent + admin). */}
      <FeaturedBooths featured={[]} />

      {/* How it works */}
      <section id="how" className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="font-display mb-10 text-center text-3xl font-semibold">
          Up and running in three steps
        </h2>
        <div className="grid gap-5 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="ticket rounded-2xl border border-border bg-card p-6"
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <step.icon className="size-5" />
              </div>
              <p className="mt-4 font-mono text-xs text-muted-foreground">
                Step {i + 1}
              </p>
              <h3 className="font-display mt-1 text-xl font-semibold">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why / moat */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="font-display mb-10 text-center text-3xl font-semibold">
          Why vendors pick QKit
        </h2>
        <div className="grid gap-5 sm:grid-cols-3">
          {MOAT.map((m) => (
            <div key={m.title} className="rounded-2xl border border-border p-6">
              <h3 className="font-display text-xl font-semibold">{m.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="font-display mb-3 text-center text-3xl font-semibold">
          Pricing that fits how you trade
        </h2>
        <p className="mx-auto mb-10 max-w-xl text-center text-sm text-muted-foreground">
          Run free, pay per day for the events you need the full kit, or go
          monthly if you trade most weeks.
        </p>
        <div className="grid gap-5 sm:grid-cols-3">
          {/* Free */}
          <div className="rounded-2xl border border-border p-6">
            <p className="font-display text-2xl font-semibold">Free</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try it with one booth.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>1 booth · up to 6 items</li>
              <li>Live order board</li>
              <li>QR poster + customization</li>
              <li>Today&apos;s stats</li>
              <li>Unlimited orders</li>
            </ul>
          </div>

          {/* Event pass */}
          <div className="rounded-2xl border border-border p-6">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-display text-2xl font-semibold">Event pass</p>
              <span
                className={
                  passPrice
                    ? "font-mono text-sm font-bold"
                    : "text-xs font-semibold text-primary"
                }
              >
                {passPrice ? (
                  <>
                    {passPrice}
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      /day
                    </span>
                  </>
                ) : (
                  "Free in beta"
                )}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Full kit, priced per day.
            </p>
            {passPrice && (
              <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
                Founding price
              </span>
            )}
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>Extra booths</li>
              <li>Unlimited items &amp; customization</li>
              <li>Scheduled auto-close hours</li>
              <li>Sold-out stock caps</li>
              <li>That event&apos;s stats</li>
            </ul>
          </div>

          {/* Monthly Pro */}
          <div className="ticket rounded-2xl border border-primary/40 bg-primary/[0.04] p-6">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-display text-2xl font-semibold text-primary">
                Monthly Pro
              </p>
              <span
                className={
                  monthlyPrice
                    ? "font-mono text-sm font-bold text-primary"
                    : "text-xs font-semibold text-muted-foreground"
                }
              >
                {monthlyPrice ?? "Coming soon"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              For trading most weeks.
            </p>
            {monthlyPrice && (
              <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
                Founding price
              </span>
            )}
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>Everything in the pass</li>
              <li>Full history: 7 / 30 / 90-day</li>
              <li>Busy-times heatmap &amp; trends</li>
              <li>Profit margin per item + CSV</li>
            </ul>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {paidMode
            ? "Founding price for early vendors — locks in while we're in beta. Pay by PayNow or cash; card payments coming soon."
            : "Free while we're in beta — ask for a pass to unlock the full kit for your next event."}
        </p>
        <div className="mt-6 text-center">
          <LandingCta
            href={primaryHref}
            event={user ? undefined : "landing_cta"}
            className="h-12 rounded-xl px-7 text-base font-semibold"
          >
            {primaryLabel}
          </LandingCta>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-2xl px-5 py-14">
        <h2 className="font-display mb-8 text-center text-3xl font-semibold">
          Questions
        </h2>
        <div className="space-y-3">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-xl border border-border bg-card px-5 py-4"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                {item.q}
                <span className="text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>

        {/* Vendor troubleshooting — for signed-up stalls hitting a snag. Kept
            below the marketing FAQ so it doesn't lead the pitch, but on the home
            page so a vendor can find it fast. */}
        <div className="mt-12">
          <h3 className="font-display mb-2 text-center text-xl font-semibold">
            Already selling? Troubleshooting
          </h3>
          <p className="mx-auto mb-6 max-w-md text-center text-sm text-muted-foreground">
            Quick fixes for the most common stall-side snags.
          </p>
          <div className="space-y-3">
            {VENDOR_FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border border-border bg-card px-5 py-4"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
                  {item.q}
                  <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row">
          <span className="font-display text-base font-semibold text-foreground">
            <span className="text-primary">Q</span>Kit
          </span>
          <span>Built for booths. Made in Singapore.</span>
          <Link href="/login" className="hover:text-foreground">
            Vendor sign in →
          </Link>
        </div>
      </footer>
    </div>
  );
}
