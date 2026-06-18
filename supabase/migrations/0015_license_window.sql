-- A pass is now a dated WINDOW, not just an expiry: it's active only when
-- valid_from <= now < expires_at. This lets a vendor's pass start on their event
-- date (set at grant / future Stripe checkout) instead of the moment it's
-- issued — no cron needed, entitlement is computed from the window on read.
-- Sold per DAY (days × valid_from), matching how stall rent is priced, so a
-- 4-hour market and a 3-day bazaar both fit.

ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Existing rows: treat them as having started when they were created.
UPDATE public.licenses SET valid_from = created_at WHERE valid_from > created_at;

CREATE INDEX IF NOT EXISTS licenses_vendor_window_idx
  ON public.licenses (vendor_id, valid_from, expires_at);
