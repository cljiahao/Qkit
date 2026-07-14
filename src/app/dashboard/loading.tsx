import { Loader2 } from "lucide-react";

// Next wraps this segment's page (and nested pages below it) in a Suspense
// boundary keyed to this file — the layout's header renders immediately, and
// this only shows if the incoming page takes a moment (slow query, cold
// Turbopack compile), instead of the content area sitting blank mid-transition.
export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}
