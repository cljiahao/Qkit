-- Deleting a booth (hard delete from the edit page) must also remove its
-- orders. The original FK on orders.booth_id had no ON DELETE action, so a
-- booth with any orders could not be deleted (FK violation). Recreate the
-- constraint with ON DELETE CASCADE.
--
-- A vendor can only reach this via the booths_vendor_all RLS policy (own
-- booths), and the cascade fires as a system operation — no orders DELETE
-- policy is needed.

ALTER TABLE public.orders DROP CONSTRAINT orders_booth_id_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_booth_id_fkey
  FOREIGN KEY (booth_id) REFERENCES public.booths(id) ON DELETE CASCADE;
