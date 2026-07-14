import { Ticket } from "@/components/ticket";

// Skeleton for the order-status ticket while the server reads the order —
// same shadow as the real card (page.tsx) so the swap-in doesn't shift look.
export default function Loading() {
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col px-5 py-10">
      <Ticket shadow="lifted" className="animate-pulse">
        <div className="space-y-3 px-6 pt-9 pb-6 text-center">
          <div className="mx-auto h-3 w-24 rounded bg-muted" />
          <div className="mx-auto h-12 w-32 rounded-lg bg-muted" />
          <div className="mx-auto h-3 w-20 rounded bg-muted" />
        </div>
        <div className="perforation" />
        <div className="space-y-4 px-6 py-6">
          <div className="mx-auto h-6 w-40 rounded bg-muted" />
          <div className="flex gap-1.5">
            <div className="h-1.5 flex-1 rounded-full bg-muted" />
            <div className="h-1.5 flex-1 rounded-full bg-muted" />
          </div>
        </div>
        <div className="perforation" />
        <div className="space-y-2 px-6 py-5">
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-2/3 rounded bg-muted" />
        </div>
      </Ticket>
    </div>
  );
}
