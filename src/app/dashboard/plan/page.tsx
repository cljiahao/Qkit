import { redirect } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVendor } from "@/lib/supabase/get-vendor";
import { normalizePlan } from "@/lib/plan";

export const revalidate = 0;

const FEATURES: { label: string; free: boolean; pro: boolean }[] = [
  { label: "Live order board", free: true, pro: true },
  { label: "QR code posters", free: true, pro: true },
  { label: "Menu customization", free: true, pro: true },
  { label: "Booths", free: false, pro: true },
  { label: "Full stats (7d / 30d + top items)", free: false, pro: true },
];

export default async function PlanPage() {
  const { user, vendor } = await getVendor();
  if (!user) redirect("/login");
  if (!vendor) redirect("/onboarding");

  const plan = normalizePlan(vendor.plan);
  const isPro = plan === "pro";

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Billing
          </p>
          <h1 className="font-display text-4xl font-semibold leading-none">
            Plan
          </h1>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
            isPro
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {isPro && <Sparkles className="size-3.5" />}
          {isPro ? "Pro" : "Free"}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Feature</span>
          <span className="text-center">Free</span>
          <span className="text-center">Pro</span>
        </div>
        {FEATURES.map((f) => (
          <div
            key={f.label}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 border-t border-border px-5 py-3 text-sm"
          >
            <span>{f.label}</span>
            <span className="flex justify-center">
              {f.free ? (
                <Check className="size-4 text-status-ready" />
              ) : (
                <span className="text-muted-foreground/40">—</span>
              )}
            </span>
            <span className="flex justify-center">
              {f.pro ? (
                <Check className="size-4 text-status-ready" />
              ) : (
                <span className="text-muted-foreground/40">—</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {isPro ? (
        <p className="rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
          You&apos;re on Pro — unlimited booths and full stats are unlocked.
          Thanks for supporting QKit.
        </p>
      ) : (
        <div className="ticket rounded-2xl border border-border bg-card p-6 text-center">
          <h2 className="font-display text-2xl font-semibold">
            Want more booths and full stats?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            QKit Pro is rolling out. Tell us you&apos;re interested and
            we&apos;ll set you up.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-5 h-12 rounded-xl text-base font-semibold"
          >
            <a href="mailto:cljiahao27@gmail.com?subject=QKit%20Pro%20upgrade">
              <Sparkles className="size-4" /> Contact us to upgrade
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
