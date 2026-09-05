-- Local TTL cache for "has this email's legal-doc acceptance been confirmed
-- current recently?". qkit does not own the acceptance record — merqo does
-- (merqo.legal_acceptances) — so confirming currency means an HTTP call to
-- merqo's GET /api/merqo/legal-status. That check runs on every gated
-- dashboard render, so the result is cached here for a short TTL, mirroring
-- merqo's own vendor_sync_state throttle table (merqo migration 0023).
--
-- Written and read only by the service-role client (src/lib/legal-gate.ts);
-- never reached from a browser path, so it follows the same RLS-on /
-- no-client-policy / explicit-service_role-grant shape as order_status_events
-- (0078) — every post-0041 table needs its own service_role grant since the
-- 0041 blanket GRANT only covered tables existing then.

CREATE TABLE qkit.legal_check_state (
  email      TEXT        PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_current BOOLEAN     NOT NULL
);

ALTER TABLE qkit.legal_check_state ENABLE ROW LEVEL SECURITY;
-- No policies: only the service-role client touches it (RLS on + no policy =
-- deny all direct anon/authenticated access).

GRANT SELECT, INSERT, UPDATE ON qkit.legal_check_state TO service_role;
