-- 0044 added orders.access_token (the per-order status-page secret) but the
-- 0032 column-freeze trigger wasn't extended to cover it, so a tampered vendor
-- session or a direct PostgREST UPDATE with a vendor JWT could rotate another
-- order's token. It's set once by place_order (INSERT) and must never change —
-- add it to the freeze list. Reproduces 0032's function verbatim + access_token.
CREATE OR REPLACE FUNCTION qkit.orders_freeze_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = qkit
AS $$
BEGIN
  IF NEW.booth_id            IS DISTINCT FROM OLD.booth_id
    OR NEW.order_number      IS DISTINCT FROM OLD.order_number
    OR NEW.customer_name     IS DISTINCT FROM OLD.customer_name
    OR NEW.items             IS DISTINCT FROM OLD.items
    OR NEW.total_cents       IS DISTINCT FROM OLD.total_cents
    OR NEW.created_at        IS DISTINCT FROM OLD.created_at
    OR NEW.idempotency_key   IS DISTINCT FROM OLD.idempotency_key
    OR NEW.payment_method_kind IS DISTINCT FROM OLD.payment_method_kind
    OR NEW.access_token      IS DISTINCT FROM OLD.access_token
  THEN
    RAISE EXCEPTION 'ORDER_IMMUTABLE_COLUMN: financial/identity columns cannot be modified after creation';
  END IF;
  RETURN NEW;
END;
$$;
