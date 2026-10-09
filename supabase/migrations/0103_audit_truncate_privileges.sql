-- TRUNCATE is a separate privilege and is not constrained by RLS.
-- Preserve SELECT/INSERT and normal owner-controlled maintenance.
REVOKE TRUNCATE ON qkit.admin_audit, qkit.order_status_events FROM service_role;
