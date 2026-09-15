-- registerPrintLocation (src/lib/printkit/client.ts) already returns
-- printkit's own print_locations.id, but qkit discarded it -- with nowhere
-- to persist it, qkit could never subscribe to printkit's bridge Presence
-- channel (printkit:presence:<vendorId>:<locationId>, keyed by THAT id, not
-- qkit's own booths.id) to show live printer connectivity. No RLS change:
-- covered by the existing booths policies (vendor owns own booths).
ALTER TABLE qkit.booths ADD COLUMN printkit_location_id text;
