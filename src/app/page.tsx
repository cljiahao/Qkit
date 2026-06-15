import Link from "next/link";
import { Bell, ListChecks, QrCode, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingCta } from "@/components/landing-cta";
import { LandingBoardPreview } from "@/components/landing-board-preview";
import { FeaturedBooths } from "@/components/featured-booths";
import { createServerClient } from "@/lib/supabase/server";

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
    title: "Built for stalls",
    body: "Queue-only or priced, single booth or many, drinks or food — options and customization fit any stall.",
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
    a: "Not yet. Orders land on your live board and you settle however you like — cash, PayNow, or your own terminal. Online payment is on the roadmap.",
  },
  {
    q: "How much does it cost?",
    a: "Free for one booth with today's stats. Pro adds unlimited booths and full analytics — start free, upgrade when you're ready.",
  },
  {
    q: "Does it work for non-food booths?",
    a: "Yes. Any booth that takes orders — drinks, snacks, merch — works. Items can be priced or queue-only.",
  },
];

export default async function LandingPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
      <section className="mx-auto max-w-3xl px-5 py-14">
        <h2 className="font-display mb-10 text-center text-3xl font-semibold">
          Simple pricing
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-border p-6">
            <p className="font-display text-2xl font-semibold">Free</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try it with one booth.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>1 booth</li>
              <li>Live order board</li>
              <li>QR poster + menu customization</li>
              <li>Today&apos;s stats</li>
            </ul>
          </div>
          <div className="ticket rounded-2xl border border-primary/40 bg-primary/[0.04] p-6">
            <p className="font-display text-2xl font-semibold text-primary">
              Pro
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              For real operations.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>Unlimited booths</li>
              <li>Full stats: 7 / 30 / 90-day + period comparison</li>
              <li>Busy-times heatmap &amp; revenue trends</li>
              <li>Profit margin per item + CSV export</li>
              <li>Everything in Free</li>
            </ul>
          </div>
        </div>
        <div className="mt-8 text-center">
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
