-- Atomic per-booth order numbering.
--
-- The previous scheme read COUNT(*) for the booth, then inserted with
-- COUNT+1 as order_number. That read-then-insert gap is a TOCTOU race:
-- two concurrent inserts to the same booth both read the same count, both
-- compute the same number, and collide on UNIQUE (booth_id, order_number).
-- A burst (e.g. Safari sending a duplicate POST for the server action)
-- exhausted the retry loop and surfaced "Could not generate a unique order
-- number". This replaces it with an atomic per-booth counter.

ALTER TABLE public.booths
  ADD COLUMN order_seq INTEGER NOT NULL DEFAULT 0;

-- Seed each booth from its current highest order number so freshly minted
-- numbers do not collide with historical orders.
UPDATE public.booths b
SET order_seq = COALESCE(
  (SELECT MAX(o.order_number::int) FROM public.orders o WHERE o.booth_id = b.id),
  0
);

-- Atomically claim the next order number for a booth. UPDATE ... RETURNING
-- takes a row lock, serializing concurrent callers — no two ever receive the
-- same value, so the unique constraint can never be violated by a race.
--
-- SECURITY DEFINER: customers placing orders are anonymous and cannot UPDATE
-- booths under RLS. The function runs as its owner to advance the counter,
-- but only ever touches order_seq for the one booth passed in.
CREATE OR REPLACE FUNCTION public.next_order_number(p_booth_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq integer;
BEGIN
  UPDATE public.booths
  SET order_seq = order_seq + 1
  WHERE id = p_booth_id
  RETURNING order_seq INTO v_seq;

  IF v_seq IS NULL THEN
    RAISE EXCEPTION 'booth % not found', p_booth_id;
  END IF;

  -- Match genOrderNumber: zero-pad to 4, longer numbers pass through.
  RETURN lpad(v_seq::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_order_number(uuid) TO anon, authenticated;
