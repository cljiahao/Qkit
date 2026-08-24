"use client";

import { Switch } from "@/components/ui/switch";

// Deep-links to printkit's bridge page, keyed by this booth's own id (which
// printkit stores back as a print_location's source_ref) — printkit's
// bridge page skips straight to that location's pairing panel instead of
// making the vendor pick from a list. No fallback host, matching
// src/lib/printkit/client.ts — an unset env var just hides the link.
function printerLinkFor(boothId: string): string | null {
  const printkitUrl = process.env.NEXT_PUBLIC_PRINTKIT_URL;
  if (!printkitUrl) return null;
  const url = new URL("/dashboard/bridge", printkitUrl);
  url.searchParams.set("booth", boothId);
  return url.toString();
}

function printerHint(boothId: string | undefined): string {
  return boothId
    ? "Printing isn't configured yet."
    : "Save this booth first to choose its printer in printkit.";
}

export function PrintingSection({
  value,
  onChange,
  boothId,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  // Only a saved booth is registered with printkit as a print location, so
  // the "choose printer" link only makes sense once this exists.
  boothId?: string;
}) {
  const printerLink = value && boothId ? printerLinkFor(boothId) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <span className="text-sm">
          <span className="font-medium">Print via printkit</span>
          <span className="block text-muted-foreground">
            Auto-print a label for every QR order placed on this booth.
          </span>
        </span>
        <Switch
          checked={value}
          onCheckedChange={onChange}
          aria-label="Print via printkit"
        />
      </div>
      {value && (
        <p className="px-1 text-sm text-muted-foreground">
          {printerLink ? (
            <a
              href={printerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              Choose the printer for this booth →
            </a>
          ) : (
            printerHint(boothId)
          )}
        </p>
      )}
    </div>
  );
}
