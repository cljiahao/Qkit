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
import { usePrinterStatus } from "@/hooks/use-printer-status";
import { PrinterStatus } from "./printer-status";

// No fallback host, same as src/lib/printkit/client.ts.
function printkitLink(path: string): string | null {
  const printkitUrl = process.env.NEXT_PUBLIC_PRINTKIT_URL;
  if (!printkitUrl) return null;
  return new URL(path, printkitUrl).toString();
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
  // Unset until the booth is saved and registered with printkit.
  boothId?: string;
}) {
  // Polled even while printing is off: the toggle guard below needs to know
  // whether a printer exists before it lets printing be turned on.
  const status = usePrinterStatus(boothId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const hasPrinter = status.kind === "printer";
  const online = hasPrinter && status.printer.state === "online";
  const choosePrinterLink = printkitLink("/dashboard/printers");
  const guideLink = printkitLink("/guides/bluetooth-printers");

  // Only interrupt turning printing ON when a printer exists but isn't
  // reachable. A booth with no printer yet has nothing to warn about: the
  // banner below already says what to do next.
  function handleToggle(next: boolean) {
    if (next && hasPrinter && !online) {
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

      {value && boothId && <PrinterStatus view={status} />}

      {value && boothId && status.kind === "none" && (
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
          {choosePrinterLink ? (
            <a
              href={choosePrinterLink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              {hasPrinter
                ? "Manage this booth's printer in printkit →"
                : "Choose the printer for this booth →"}
            </a>
          ) : (
            printerHint(boothId)
          )}
        </p>
      )}

      {value && !hasPrinter && (
        <p className="px-1 text-sm text-muted-foreground">
          A printer that connects to the internet by itself works with just your
          iPad. Bluetooth printers need a phone or a Raspberry Pi next to them
          all day
          {guideLink ? (
            <>
              {" "}
              <a
                href={guideLink}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline"
              >
                read why
              </a>
              .
            </>
          ) : (
            "."
          )}
        </p>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Printer offline</AlertDialogTitle>
            <AlertDialogDescription>
              This booth&apos;s printer isn&apos;t reachable right now. Orders
              will wait in Incoming until it comes back, or you can turn this on
              anyway and sort the printer out later.
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
