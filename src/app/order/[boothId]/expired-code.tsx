import { QrCode } from "lucide-react";

/**
 * Hard-block screen shown when a booth QR link is stale or missing its token.
 * Rendered at HTTP 200 (not a 404) so an honest customer gets a clear next step
 * rather than a dead end. No menu, no order form.
 */
export function ExpiredCode() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-border bg-card">
        <QrCode className="size-6 text-muted-foreground" />
      </div>
      <h1 className="font-display text-2xl font-semibold leading-tight">
        QR expired
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This code expired — ask the booth for the current QR.
      </p>
    </div>
  );
}
