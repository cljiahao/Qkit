-- Drops qkit's now-stale local storage for vendor feedback and support
-- messages, both fully superseded by the shared merqo schema (migrations
-- 0071/0072 converged writes+reads and already backfilled every historical
-- row into merqo.vendor_feedback / merqo.support_messages).
--
-- Unlike migration 0069's deferred cutover (which had to wait for a real
-- deploy cycle against live vendor data), no client has shipped against
-- either of these yet, so the drop lands immediately rather than waiting.

-- Vendor-sourced feedback rows: already copied to merqo.vendor_feedback,
-- and the vendor branch of qkit.submit_feedback no longer writes them here.
-- Customer-sourced rows (source = 'customer', CSAT) are untouched.
DELETE FROM qkit.feedback WHERE source = 'vendor';

-- The nps column only ever held vendor-sourced scores (customer rows use
-- rating instead) — dead now that vendor rows are gone and nothing writes
-- new ones.
ALTER TABLE qkit.feedback DROP COLUMN nps;

-- support_messages is fully superseded for both writes (src/app/actions/support.ts)
-- and every admin read/resolve site — nothing in qkit reads or writes this
-- table anymore.
DROP TABLE qkit.support_messages;
