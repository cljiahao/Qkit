// Social-proof seam. Renders ONLY when real, consenting featured booths are
// supplied — otherwise nothing (the authentic static trust strip carries the
// page). The data source (vendor showcase opt-in + consent + admin verify) is a
// separate future spec; for now `page.tsx` passes an empty array, so this is
// hidden. No fabricated testimonials ever.

import { Ticket } from "@/components/ticket";

export type FeaturedBooth = {
  // stall name
  name: string;
  // vendor-approved quote
  quote: string;
  // attribution, e.g. "Ada · Kopitiam Cart"
  by: string;
};

export function FeaturedBooths({ featured }: { featured: FeaturedBooth[] }) {
  if (featured.length === 0) return null;

  return (
    <section className="mx-auto max-w-5xl px-5 py-14">
      <h2 className="font-display mb-10 text-center text-3xl font-semibold">
        Booths already serving with qkit
      </h2>
      <div className="grid gap-5 sm:grid-cols-3">
        {featured.map((f) => (
          <Ticket key={f.by} as="figure" shadow="none" className="bg-card p-6">
            <blockquote className="text-sm leading-relaxed">
              &ldquo;{f.quote}&rdquo;
            </blockquote>
            <figcaption className="mt-4 text-xs font-semibold text-muted-foreground">
              {f.by}
            </figcaption>
          </Ticket>
        ))}
      </div>
    </section>
  );
}
