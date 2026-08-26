-- Vendor-pasted link to a paykit booking, for event-mode booths (see
-- walkup_default, migration 0080). Only meaningful when a vendor is running
-- a deposit/balance booking for this booth's event in paykit's own
-- dashboard; nullable and unvalidated at write time — the vendor already
-- owns both sides (they created the booking in their own paykit dashboard
-- and are pasting it into their own booth), so this is the same trust level
-- as the existing "quick add PayNow" config section, not a lookup/match by
-- name or phone (qkit stores no customer phone on orders at all — a prior
-- fuzzy-matching design was rejected as a cross-tenant financial-data leak
-- risk).

ALTER TABLE qkit.booths ADD COLUMN paykit_booking_id TEXT;
