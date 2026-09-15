-- 0087 exempted the NULL -> assigned order_number transition from the freeze
-- trigger so qkit.assign_order_number could perform it, but authenticated's
-- UPDATE grant on qkit.orders is table-level (not column-scoped), so any
-- vendor's own client could set order_number directly on that same NULL row,
-- bypassing assign_order_number's locked-sequence numbering entirely. Same
-- Postgres gotcha 0042 already documents for vendors.plan: a column-level
-- REVOKE is a no-op against a table-level GRANT, so the table-level grant
-- must be revoked and re-granted narrowed to every other column.
REVOKE UPDATE ON qkit.orders FROM authenticated;
GRANT UPDATE (
  access_token, auto_completed, booth_id, completed_at, created_at,
  customer_name, id, idempotency_key, items, paid_at, payment_method_kind,
  payment_proof_hash, payment_proof_path, payment_status, print_status,
  print_status_updated_at, priority_bumped_at, ready_at, source, status,
  total_cents, updated_at
) ON qkit.orders TO authenticated;
