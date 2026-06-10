"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";

const RANGES: { value: string; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

interface Props {
  range: string;
  booth: string;
  booths: { id: string; name: string }[];
  allowedRanges: readonly string[];
}

export function StatsControls({ range, booth, booths, allowedRanges }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`/dashboard/stats?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded-lg border border-border p-0.5 text-sm">
        {RANGES.map((r) => {
          const locked = !allowedRanges.includes(r.value);
          if (locked) {
            // Out-of-plan range: link to the upgrade page instead of switching.
            return (
              <Link
                key={r.value}
                href="/dashboard/plan"
                className="flex items-center gap-1 rounded-md px-3 py-1.5 font-medium text-muted-foreground/60 hover:text-foreground"
                title="Upgrade to unlock longer ranges"
              >
                <Lock className="size-3" />
                {r.label}
              </Link>
            );
          }
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => setParam("range", r.value)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                range === r.value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {booths.length > 1 && (
        <select
          value={booth}
          onChange={(e) => setParam("booth", e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
        >
          <option value="all">All booths</option>
          {booths.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
