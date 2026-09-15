"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePrinterPresence } from "@/hooks/use-printer-presence";
import { PrinterStatus } from "./printer-status";

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
  vendorId,
  printkitLocationId,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  // Unset until the booth is saved and registered with printkit.
  boothId?: string;
  vendorId: string;
  // Unset until a save's registerPrintLocation call has succeeded at least
  // once — see syncPrintLocation in dashboard/booths/actions.ts.
  printkitLocationId?: string | null;
}) {
  const online = usePrinterPresence(vendorId, printkitLocationId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const printerLink = value && boothId ? printerLinkFor(boothId) : null;
  const dashboardLink = printkitDashboardLink();

  // A first-time enable has no printkit_location_id yet, so there's nothing
  // live to check -- only interrupt turning ON when a printer was registered
  // before but isn't connected right now.
  function handleToggle(next: boolean) {
    if (next && printkitLocationId && !online) {
      setConfirmOpen(true);
      return;
    }
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <span className="text-sm">
          <span className="font-medium">Print via printkit</span>
          <span className="block text-muted-foreground">
            Auto-print a label for every QR order placed on this booth. While
            off, new orders wait in Incoming until you tap Start now.
          </span>
        </span>
        <Switch
          checked={value}
          onCheckedChange={handleToggle}
          aria-label="Print via printkit"
        />
      </div>
      {value && printkitLocationId && <PrinterStatus online={online} />}
      {value && boothId && !printkitLocationId && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-amber-600"
            aria-hidden
          />
          <span>
            Printing is on, but no printer is set up for this booth yet. Orders
            won&apos;t print until you connect one.
          </span>
        </div>
      )}
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
      {/* Redundant once the booth-scoped deep link above is available — it
          already does more (skips the picker). Only the general fallback. */}
      {!printerLink && dashboardLink && (
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
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No printer connected</AlertDialogTitle>
            <AlertDialogDescription>
              This booth&apos;s printer isn&apos;t online right now. Orders will
              wait in Incoming until you connect one, or you can turn this on
              anyway and connect it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onChange(true)}>
              Turn on anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
