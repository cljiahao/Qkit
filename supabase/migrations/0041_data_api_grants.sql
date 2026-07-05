-- Explicit Data-API table grants. QKit historically relied on Supabase's
-- auto-expose (implicit grants at table creation + selective REVOKEs), but that
-- behaviour now varies by CLI version and fights the revokes (a fresh CI DB
-- re-granted `authenticated` privileges the migrations had revoked). With
-- `auto_expose_new_tables = false`, the Data-API roles get ONLY what is granted
-- here (plus the per-RPC `GRANT EXECUTE` in each function's migration). RLS then
-- gates the rows. This makes the grant state deterministic across CLI versions
-- and independent of the (soon-removed) auto-expose flag.
--
-- Model: `authenticated` (vendors + admins) gets the table privileges its RLS
-- policies gate. `anon` (customers) gets NONE — every customer write/read goes
-- through a SECURITY DEFINER RPC (place_order / get_booth_for_order /
-- submit_feedback), so anon needs no base table access. `service_role` bypasses
-- RLS and keeps its own grants (used server-side for the status page).

-- ── authenticated ────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON qkit.booths            TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON qkit.vendors           TO authenticated;
GRANT SELECT, UPDATE                 ON qkit.orders            TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON qkit.purchase_requests TO authenticated;
GRANT SELECT                         ON qkit.feedback          TO authenticated;
GRANT SELECT                         ON qkit.licenses          TO authenticated;
GRANT SELECT                         ON qkit.payments          TO authenticated;
GRANT SELECT, INSERT                 ON qkit.events            TO authenticated;
GRANT SELECT                         ON qkit.pricing           TO authenticated;
GRANT SELECT                         ON qkit.admins            TO authenticated;
GRANT SELECT                         ON qkit.admin_audit       TO authenticated;

-- `plan` is admin-only (service role). Re-assert the 0035 column revoke AFTER the
-- table-level UPDATE grant above (which would otherwise cover every column).
REVOKE UPDATE (plan) ON qkit.vendors FROM authenticated;

-- Deliberately NOT granted to authenticated (enforced by absence, not just RLS):
--   • INSERT on orders / feedback  → only the SECURITY DEFINER RPCs write these
--   • any access to booth_item_sold / rate_limits → definer-only counters

-- next_order_number: the 0030/0033 role-specific REVOKEs were INEFFECTIVE —
-- Postgres grants EXECUTE to PUBLIC by default, and authenticated/anon inherit
-- that, so revoking the role-level grant left the PUBLIC grant intact (any
-- logged-in user could still burn a booth's order_seq — F1d was never actually
-- closed). Revoke from PUBLIC to truly deny it (the function is dead in prod;
-- place_order inlines numbering).
REVOKE EXECUTE ON FUNCTION qkit.next_order_number(uuid) FROM PUBLIC;

-- Sequence USAGE for any serial-backed insert (harmless where PKs are UUIDs).
GRANT USAGE ON ALL SEQUENCES IN SCHEMA qkit TO authenticated;

-- ── anon ─────────────────────────────────────────────────────────────────────
-- Pricing is genuinely public (offer page); everything else customer-facing is
-- an RPC. No other anon table grants.
GRANT SELECT ON qkit.pricing TO anon;

-- ── service_role ─────────────────────────────────────────────────────────────
-- The trusted server role (bypasses RLS) — used by the service client for the
-- customer status page, admin actions, and claimPayment. auto-expose used to
-- grant it; make it explicit. No migration REVOKEs target service_role, so
-- granting everything here undoes nothing.
GRANT ALL ON ALL TABLES IN SCHEMA qkit    TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA qkit TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA qkit TO service_role;
