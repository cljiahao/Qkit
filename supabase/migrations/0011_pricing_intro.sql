-- Bump the founding event-pass price from the initial $15 seed to $19 — anchored
-- to ~10% of a typical SG day stall fee (S$150–300), above the Stripe flat-fee
-- floor, and a round number (B2B tool, not impulse retail). Monthly stays $49
-- (matches the Square Plus reference point).
--
-- Guarded on the old seed value so it never clobbers a price an admin has since
-- set in /admin. No-op if the row was already changed or already at $19.
UPDATE public.pricing
  SET event_pass_cents = 1900,
      updated_at = now()
  WHERE id = 1
    AND event_pass_cents = 1500;
