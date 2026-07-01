-- Rotatable per-booth QR access token. Gates the customer order entry page so a
-- vendor can invalidate previously printed/saved QR links on demand.

-- pgcrypto provides gen_random_bytes; on Supabase it lives in the extensions schema.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 16 CSPRNG bytes → URL-safe base64 (base64url), padding stripped ≈ 132 bits entropy.
CREATE OR REPLACE FUNCTION public.gen_booth_token()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT translate(
    encode(extensions.gen_random_bytes(16), 'base64'),
    '+/=', '-_'
  );
$$;

-- NOT NULL DEFAULT backfills every existing booth with a fresh token in this
-- migration; new booths get one automatically on insert.
ALTER TABLE public.booths
  ADD COLUMN access_token TEXT NOT NULL DEFAULT public.gen_booth_token();
