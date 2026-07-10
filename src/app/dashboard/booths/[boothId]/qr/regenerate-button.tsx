"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { regenerateShortCode } from "../../actions";

/**
 * Vendor-only "Regenerate QR" control. Rotating the token invalidates every
 * printed/saved QR for this booth, so the action is gated behind a confirmation
 * that names the booth explicitly (guards against acting on the wrong one).
 */
export function RegenerateButton({
  boothId,
  boothName,
}: {
  boothId: string;
  boothName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await regenerateShortCode(boothId);
      if (!res.success) {
        toast.error(res.error ?? "Could not regenerate QR");
        return;
      }
      toast.success("New QR generated, reprint to use it.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        className="h-12 w-full rounded-xl text-base font-semibold"
        onClick={() => setOpen(true)}
      >
        <RefreshCw className="size-4" /> Regenerate QR
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Regenerate QR for &ldquo;{boothName}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every printed or saved code for this booth stops working
              immediately. You&apos;ll need to reprint the QR.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // keep the dialog open until the action resolves
                e.preventDefault();
                confirm();
              }}
              disabled={pending}
            >
              {pending ? "Regenerating…" : "Regenerate QR"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
