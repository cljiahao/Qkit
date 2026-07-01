-- Rotating public short code for a booth's QR. Replaces access_token: it is BOTH
-- the pretty URL id and the unguessable capability. 12 base62 chars ~= 71 bits.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.gen_short_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  alphabet CONSTANT text :=
    '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'; -- 62 chars
  b bytea := extensions.gen_random_bytes(12);
  result text := '';
  i int;
BEGIN
  -- byte % 62 has negligible modulo bias at 71 bits — fine for an unguessable
  -- lookup id (not a cryptographic secret needing perfect uniformity).
  FOR i IN 0..11 LOOP
    result := result || substr(alphabet, (get_byte(b, i) % 62) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Add the column with the generated default (backfills every existing booth with
-- a distinct code — Postgres evaluates a VOLATILE default per row for this DDL).
ALTER TABLE public.booths
  ADD COLUMN short_code TEXT NOT NULL DEFAULT public.gen_short_code();
-- UNIQUE creates its own backing btree index — that index also serves the
-- short_code lookups (get_booth_for_order / place_order), so no separate index.
ALTER TABLE public.booths
  ADD CONSTRAINT booths_short_code_key UNIQUE (short_code);

-- Remove the superseded access_token model (regenerate_booth_token is replaced
-- in task 5; drop it here so the column can go).
DROP FUNCTION IF EXISTS public.regenerate_booth_token(uuid);
ALTER TABLE public.booths DROP COLUMN IF EXISTS access_token;
DROP FUNCTION IF EXISTS public.gen_booth_token();
