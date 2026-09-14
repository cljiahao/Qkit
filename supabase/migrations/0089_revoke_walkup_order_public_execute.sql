-- qkit.place_walkup_order's EXECUTE grant was left at the default PUBLIC
-- (includes anon), unlike every other write RPC in this schema, which
-- explicitly revokes anon/PUBLIC and grants only the roles that need it
-- (see place_order, next_order_number, submit_feedback). Not currently
-- exploitable -- the function's own `vendor_id = auth.uid()` check always
-- fails for an anonymous caller (auth.uid() is NULL) -- but an anonymous
-- role should never hold EXECUTE on a vendor-only write RPC as a matter of
-- defense in depth, consistent with the pattern elsewhere in this schema.
REVOKE EXECUTE ON FUNCTION qkit.place_walkup_order(uuid, text, jsonb, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.place_walkup_order(uuid, text, jsonb, boolean, text) TO authenticated;
