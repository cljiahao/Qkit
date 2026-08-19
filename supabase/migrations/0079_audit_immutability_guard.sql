-- Immutability guard on the audit tables (qkit.admin_audit, migration 0006;
-- qkit.order_status_events, migration 0078). RLS already blocks
-- authenticated/anon from writing either table, but nothing stops the
-- service-role client itself from UPDATEing or DELETEing a row once it holds
-- the secret key — service_role bypasses RLS entirely, and 0041 granted it
-- ALL privileges on every qkit table. The app only ever INSERTs into these
-- two tables (see src/lib/audit.ts's recordAudit / recordOrderStatusEvent —
-- neither calls .update()/.delete()), so revoking UPDATE/DELETE from
-- service_role specifically costs nothing functionally and closes a real
-- tampering gap: even a compromised/misused service-role key can no longer
-- rewrite or erase audit history, only append to it and read it back.
--
-- SELECT/INSERT stay granted — this is additive-only, not a lockdown.
REVOKE UPDATE, DELETE ON qkit.admin_audit         FROM service_role;
REVOKE UPDATE, DELETE ON qkit.order_status_events FROM service_role;

-- Quick manual verification (run against a local `supabase start` DB):
--   set role service_role;
--   insert into qkit.admin_audit (admin_id, action) values (gen_random_uuid(), 'x'); -- succeeds
--   update qkit.admin_audit set action = 'y' where action = 'x';                     -- ERROR: permission denied
--   delete from qkit.admin_audit where action = 'x';                                 -- ERROR: permission denied
--   reset role;
-- Also asserted in supabase/tests/rls.test.sql (pgTAP, "service_role cannot
-- UPDATE/DELETE admin_audit / order_status_events" block).
