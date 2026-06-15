import type { OptionCount } from "@/lib/stats";

/**
 * Most-selected customization choices (e.g. "Iced", "Less sugar"). Helps a
 * vendor see what their customers actually prefer. Hidden when no item has
 * options.
 */
export function OptionsBreakdown({ options }: { options: OptionCount[] }) {
  if (!options.length) return null;
  const max = Math.max(...options.map((o) => o.count));

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Popular choices
      </p>
      <ul className="space-y-2.5">
        {options.map((o) => (
          <li
            key={`${o.group}-${o.choice}`}
            className="flex items-center gap-3"
          >
            <span className="w-28 shrink-0 truncate text-sm">
              <span className="text-muted-foreground">{o.group}: </span>
              <span className="font-medium">{o.choice}</span>
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${(o.count / max) * 100}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right font-mono text-sm tabular-nums">
              {o.count}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
