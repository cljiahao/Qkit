"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import QRCode from "react-qr-code";
import { Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ticket-section";
import { useAsyncAction } from "@/hooks/use-async-action";
import { disconnectTelegram } from "./telegram-actions";

/** Disconnected state: the deep-link QR + tappable link, or (deepLinkUrl
 *  generation failed server-side) a retry prompt with a real action, not
 *  just instructions to refresh manually. Split out of TelegramSection so
 *  the connected/disconnected branch stays a single ternary, not a nested
 *  one. */
function DisconnectedState({
  deepLinkUrl,
  onRetry,
}: {
  deepLinkUrl: string | null;
  onRetry: () => void;
}) {
  if (!deepLinkUrl) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t set up the Telegram link right now.
          <br />
          Give it another try.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="rounded-lg"
        >
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div data-testid="telegram-qr" className="w-fit rounded-xl bg-white p-4">
        <QRCode value={deepLinkUrl} size={180} />
      </div>
      <p className="text-xs text-muted-foreground">
        Scan with Telegram, or on mobile just tap:
      </p>
      <a
        href={deepLinkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all font-mono text-xs text-primary underline"
      >
        {deepLinkUrl}
      </a>
    </div>
  );
}

/**
 * "Connect Telegram" settings section: a redundant new-order alert channel
 * alongside the live dashboard board (see
 * docs/superpowers/specs/2026-08-16-telegram-order-alerts-design.md).
 * `deepLinkUrl` is pre-generated server-side (page.tsx calls
 * `generateTelegramLink()` on render, one fresh 30-minute-expiry token per
 * page load) whenever the vendor isn't linked yet — this component is
 * otherwise presentational: render the QR + tappable link, or the
 * Connected state with a disconnect action.
 */
export function TelegramSection({
  connected,
  deepLinkUrl,
}: {
  connected: boolean;
  deepLinkUrl: string | null;
}) {
  const router = useRouter();
  const { pending, run } = useAsyncAction();

  function disconnect() {
    return run(async () => {
      const res = await disconnectTelegram();
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("Telegram disconnected");
      router.refresh();
    });
  }

  return (
    <Section
      icon={<Send className="size-5" />}
      title="Telegram alerts"
      description="Get a message the moment a new order comes in, so you never have to keep one eye on the tablet."
    >
      {connected ? (
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
            <CheckCircle2 className="size-4" /> Connected
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={disconnect}
            disabled={pending}
            className="rounded-lg"
          >
            {pending ? "Disconnecting…" : "Disconnect"}
          </Button>
        </div>
      ) : (
        <DisconnectedState
          deepLinkUrl={deepLinkUrl}
          onRetry={() => router.refresh()}
        />
      )}
    </Section>
  );
}
