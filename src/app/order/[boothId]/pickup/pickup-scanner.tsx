"use client";

import { useRef, useState } from "react";
import { confirmCollection } from "../[orderNumber]/collect-actions";

interface Props {
  boothId: string;
}

interface ParsedScan {
  boothId: string;
  orderNumber: string;
  token: string;
}

/**
 * Parse the URL a paired HID barcode/QR scanner types into the input — the
 * customer's own order-status page URL (`/order/{boothId}/{orderNumber}
 * ?t=token`). Returns null for anything that isn't a well-formed instance of
 * that shape.
 */
function parseScan(raw: string): ParsedScan | null {
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/^\/order\/([^/]+)\/([^/]+)$/);
    const token = url.searchParams.get("t");
    if (!match || !token) return null;
    return { boothId: match[1], orderNumber: match[2], token };
  } catch {
    return null;
  }
}

/**
 * Self-checkout pickup kiosk input. A Bluetooth HID scanner types the
 * decoded URL plus Enter into whatever has keyboard focus — no camera, no
 * button, just a text input that stays focused. See ../pickup/README.md for
 * the full mechanic and its honest non-security-boundary framing.
 *
 * Locks (genuinely disables, not just visually) from the Enter keystroke
 * until confirmCollection resolves, so a rapid second scan can't interleave
 * its keystrokes with an in-flight request.
 */
export function PickupScanner({ boothId }: Props) {
  const [value, setValue] = useState("");
  const [flash, setFlash] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || busy) return;
    const raw = value;
    setValue("");

    const parsed = parseScan(raw);
    if (!parsed) {
      setFlash({ ok: false, message: "Couldn't read that scan. Try again." });
      return;
    }
    if (parsed.boothId !== boothId) {
      setFlash({
        ok: false,
        message: "Wrong stall -- this code is for a different booth.",
      });
      return;
    }

    setBusy(true);
    const res = await confirmCollection(
      parsed.boothId,
      parsed.orderNumber,
      parsed.token,
    );
    setBusy(false);
    setFlash(
      res.success
        ? { ok: true, message: `Order #${parsed.orderNumber} collected` }
        : { ok: false, message: res.error ?? "Could not complete order." },
    );
    inputRef.current?.focus();
  }

  return (
    <div className="w-full max-w-md space-y-4 text-center">
      <p className="text-lg font-semibold">Scan to collect</p>
      <input
        ref={inputRef}
        autoFocus
        disabled={busy}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => inputRef.current?.focus()}
        className="w-full rounded-lg border border-border bg-card px-4 py-3 text-center"
        aria-label="Scan input"
      />
      {flash && (
        <p className={flash.ok ? "text-status-ready" : "text-destructive"}>
          {flash.message}
        </p>
      )}
    </div>
  );
}
