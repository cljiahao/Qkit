"use client";

import { useState } from "react";
import { CheckCheck } from "lucide-react";
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

/**
 * One tap, then one confirmation, to move every order still being made to
 * Ready. For a stall that had no time to mark orders one by one during
 * service and is catching the board up afterwards; the "Select" mode beside it
 * is for picking some. Hidden below two orders, where the ticket's own button
 * is already a single tap.
 *
 * It asks first because it cannot be undone in one step, and because Ready is
 * what tells a customer to come to the counter.
 */
export function MarkAllReadyButton({
  count,
  busy,
  onConfirm,
}: {
  count: number;
  busy: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (count < 2) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        <CheckCheck className="size-3.5" />
        Mark all ready
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark all {count} orders ready?</AlertDialogTitle>
            <AlertDialogDescription>
              Every order still being made moves to Ready at once, and customers
              who asked for an alert are told to collect. Use it to catch up
              when there was no time to mark them one by one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>
              Mark all ready
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
