// Skeleton for the booth menu while the server fetches booth + stock. Shown on
// the QR-scan hot path, where event-site signal can be slow — beats a white wait.
export default function Loading() {
  return (
    <div className="mx-auto max-w-lg animate-pulse px-5 py-7">
      <div className="mb-6 h-8 w-2/3 rounded-lg bg-muted" />
      <div className="mb-3 h-3 w-24 rounded bg-muted" />
      <div className="space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-3.5"
          >
            <div className="flex flex-1 items-center gap-3">
              <div className="size-14 shrink-0 rounded-lg bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/2 rounded bg-muted" />
                <div className="h-3 w-1/3 rounded bg-muted" />
              </div>
            </div>
            <div className="h-11 w-16 rounded-lg bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
