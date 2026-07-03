"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shortDay } from "@/lib/tz";
import { eventLabel, type EventLicense } from "@/lib/events";
import { useAsyncAction } from "@/hooks/use-async-action";
import { renameEvent } from "./actions";

/**
 * Lists the vendor's paid passes as named "events". Each links to that window's
 * full stats (permanent, ungated) and can be renamed to the event-day name.
 */
export function EventsPanel({ events }: { events: EventLicense[] }) {
  if (events.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <CalendarDays className="size-3.5" />
        Your events
      </h2>
      <p className="mt-1 mb-3 text-sm text-muted-foreground">
        Stats for every pass you&apos;ve bought stay here for good, even after
        it ends. Name each one after your event day.
      </p>
      <ul className="space-y-2">
        {events.map((e) => (
          <EventRow key={e.id} event={e} />
        ))}
      </ul>
    </section>
  );
}

function EventRow({ event }: { event: EventLicense }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(event.label ?? "");
  const { pending: saving, run } = useAsyncAction();

  function save() {
    return run(async () => {
      const res = await renameEvent({ licenseId: event.id, label: name });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setEditing(false);
      toast.success("Event renamed");
      router.refresh();
    });
  }

  const window = `${shortDay(Date.parse(event.valid_from))} – ${shortDay(
    Date.parse(event.expires_at),
  )}`;

  return (
    <li className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
      {editing ? (
        <>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="e.g. Sat Night Market"
            className="h-9"
            autoFocus
          />
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setName(event.label ?? "");
            }}
          >
            Cancel
          </Button>
        </>
      ) : (
        <>
          <Link
            href={`/dashboard/stats?event=${event.id}`}
            className="min-w-0 flex-1"
          >
            <span className="block truncate font-medium">
              {eventLabel(event)}
            </span>
            <span className="block text-xs text-muted-foreground">
              {window}
            </span>
          </Link>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9 shrink-0"
            onClick={() => setEditing(true)}
            aria-label="Rename event"
          >
            <Pencil className="size-3.5" />
          </Button>
        </>
      )}
    </li>
  );
}
