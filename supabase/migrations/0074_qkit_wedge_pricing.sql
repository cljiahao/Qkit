-- Lower qkit's monthly Pro price from the current $24.99 to $14.99 —
-- qkit is the family's acquisition wedge (the kit almost every vendor
-- tries first, before discovering loopkit/paykit/stockkit via cross-kit
-- SSO/one-click activation), not a standalone premium product. Sitting at
-- ~2x Tabao Us's own ceiling ($12.90/mo, the direct head-to-head
-- comparator for this exact vendor's first purchase decision) suppresses
-- the top of the whole funnel, not just qkit's own revenue. Full
-- reasoning: Merqo Business/docs/business/2026-08-15-per-kit-pricing-
-- rationale.md ("qkit — $14.99/mo Pro" section).
--
-- Event-pass price is unchanged — its "~10% of a typical SG day stall
-- fee" anchor (migration 0011) is sound on its own terms and isn't part
-- of the problem this migration fixes.
--
-- Guarded on the known current value (2499 = $24.99, the live price at
-- the time this migration was written) so it never clobbers a price an
-- admin has since changed via /admin — same precedent as migration 0011.
-- No-op if the row is already at $14.99 or has moved to something else.
UPDATE qkit.pricing
  SET monthly_cents = 1499,
      updated_at = now()
  WHERE id = 1
    AND monthly_cents = 2499;
