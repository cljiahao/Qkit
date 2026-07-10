import { QrCode, ServerCrash } from "lucide-react";

/**
 * Hard-block screen shown when a booth QR link is stale or missing its token.
 * Rendered at HTTP 200 (not a 404) so an honest customer gets a clear next step
 * rather than a dead end. No menu, no order form.
 *
 * The "error" variant is for a transient backend failure (the code may be
 * perfectly valid) — telling that customer to "ask for a new QR" would be wrong
 * and sends them in a loop; "try again in a moment" is the honest next step.
 */
export function ExpiredCode({
  variant = "expired",
}: {
  variant?: "expired" | "error";
}) {
  const isError = variant === "error";
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-border bg-card">
        {isError ? (
          <ServerCrash className="size-6 text-muted-foreground" />
        ) : (
          <QrCode className="size-6 text-muted-foreground" />
        )}
      </div>
      <h1 className="font-display text-2xl font-semibold leading-tight">
        {isError ? "Something went wrong" : "QR expired"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {isError
          ? "We couldn't load this booth right now. Please try again in a moment."
          : "This code expired. Ask the booth for the current QR."}
      </p>
    </div>
  );
}
