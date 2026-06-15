// Social-proof seam. Renders ONLY when real, consenting featured booths are
// supplied — otherwise nothing (the authentic static trust strip carries the
// page). The data source (vendor showcase opt-in + consent + admin verify) is a
// separate future spec; for now `page.tsx` passes an empty array, so this is
// hidden. No fabricated testimonials ever.

export type FeaturedBooth = {
  name: string; // stall name
  quote: string; // vendor-approved quote
  by: string; // attribution, e.g. "Ada · Kopitiam Cart"
};

export function FeaturedBooths({ featured }: { featured: FeaturedBooth[] }) {
  if (featured.length === 0) return null;

  return (
    <section className="mx-auto max-w-5xl px-5 py-14">
      <h2 className="font-display mb-10 text-center text-3xl font-semibold">
        Booths already serving with QKit
      </h2>
      <div className="grid gap-5 sm:grid-cols-3">
        {featured.map((f) => (
          <figure
            key={f.by}
            className="ticket rounded-2xl border border-border bg-card p-6"
          >
            <blockquote className="text-sm leading-relaxed">
              &ldquo;{f.quote}&rdquo;
            </blockquote>
            <figcaption className="mt-4 text-xs font-semibold text-muted-foreground">
              {f.by}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
