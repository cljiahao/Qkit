"use client";

import { AuditLogTable, type AuditLogEntry } from "@merqo/ui";

/**
 * Client boundary around `@merqo/ui`'s `AuditLogTable`. The package ships as a
 * single all-"use client" bundle, so `AuditLogTable` is a Client Component and
 * `formatAction` (a function) cannot be passed to it from the server-rendered
 * `page.tsx` — React can't serialize a function across the server→client
 * boundary. Keeping `humanizeAction` here, on the client side of that boundary,
 * lets the overview page hand over only the serializable `entries` array.
 */
function humanizeAction(action: string): string {
  const s = action.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function AdminAuditLog({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <AuditLogTable
      entries={entries}
      formatAction={humanizeAction}
      emptyState="No admin actions yet."
    />
  );
}
