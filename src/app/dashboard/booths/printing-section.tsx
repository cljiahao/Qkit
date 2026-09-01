"use client";

import { Switch } from "@/components/ui/switch";

// Keyed by booth id, printkit's own source_ref — no fallback host, same as src/lib/printkit/client.ts.
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

// General entry point for setting up printkit before flipping the switch on.
function printkitDashboardLink(): string | null {
  const printkitUrl = process.env.NEXT_PUBLIC_PRINTKIT_URL;
  if (!printkitUrl) return null;
  return new URL("/dashboard", printkitUrl).toString();
}

export function PrintingSection({
  value,
  onChange,
  boothId,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  // Unset until the booth is saved and registered with printkit.
  boothId?: string;
}) {
  const printerLink = value && boothId ? printerLinkFor(boothId) : null;
  const dashboardLink = printkitDashboardLink();

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
      {dashboardLink && (
        <p className="px-1 text-sm text-muted-foreground">
          <a
            href={dashboardLink}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            Manage printers in printkit ↗
          </a>
        </p>
      )}
    </div>
  );
}
