# Printer connectivity status (design)

Source: user request — "how would qkit know if printer is available? even if
users toggle on, but there's no printer to connect to, shouldn't it show
error? ... if there's a printer, it should show below the toggle button the
printer that is used and the connectivity, whether it's live or not."

## What already exists (investigated in printkit)

printkit's own bridge dashboard already tracks live printer connectivity via
a Supabase Realtime **Presence** channel, not a DB column:

- `use-bridge-presence.ts` (printkit): the bridge device's browser tab
  `.track({ online: true })`s on channel
  `printkit:presence:${vendorId}:${locationId}` while that tab is open.
- `bridge-status.tsx` (printkit): a read-only subscriber to the same
  channel, rendering an "online"/"offline" dot — never calls `.track()`.

`locationId` here is **printkit's own** `print_locations.id` (a printkit-
generated UUID), not qkit's `booths.id`. qkit's `registerPrintLocation`
call (`src/lib/printkit/client.ts`) already receives that id back in its
response (`PrintkitResult<{id: string}>`) but `syncPrintLocation`
(`dashboard/booths/actions.ts`) currently discards it.

Realtime Presence channels are not schema-scoped and carry no RLS/private-
channel gate here (confirmed: no `config.private`, no
`realtime.messages` policy) — any client holding the project's publishable
key can subscribe by channel name. Since qkit and printkit share one
Supabase project (and therefore one `auth.uid()` per vendor — the same
premise every existing paykit/printkit call already relies on), qkit can
subscribe to this exact channel with no printkit-side change at all.

## Design

1. **Persist printkit's location id.** New nullable `booths.printkit_location_id`
   column. `syncPrintLocation` now takes the server client and, on a
   successful `registerPrintLocation`, writes the returned id back onto the
   booth row (best-effort, same non-blocking contract as the rest of this
   function).
2. **Read-only presence subscriber**, mirroring printkit's own
   `BridgeStatus` component: `PrinterStatus({ vendorId, locationId })`
   subscribes to `printkit:presence:${vendorId}:${locationId}` and renders
   live online/offline, using qkit's own status color tokens (not
   printkit's `bg-mint`, which doesn't exist in this theme).
3. **`printing-section.tsx`** renders, only while the toggle is on:
   - no `printkit_location_id` yet → static hint: printer not paired yet,
     with the existing "Choose the printer for this booth" link.
   - `printkit_location_id` present → live `PrinterStatus` (green
     "Printer connected" / muted-red "No printer connected — open the
     bridge on your printing device", with the same pairing link).

## Explicitly not doing

- **No blocking modal on toggle-on.** Presence takes a moment to establish
  (the vendor may toggle printing on before ever opening the bridge tab, a
  normal setup step, not an error) and printkit's own UI never gates on a
  modal either — a persistent inline status matches the established
  pattern and doesn't punish a legitimate "set it up in a minute" flow.
- **No change to printkit.** The presence channel, its naming, and its
  online/offline semantics already exist and are reused as-is.
