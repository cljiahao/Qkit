-- Record what qkit actually collected for each granted pass/sub, so the admin
-- dashboard can show real qkit revenue (not vendor GMV). Defaults to 0: beta
-- comps and design-partner grants are free and correctly count as $0 revenue.
-- The amount captured at grant time is frozen here (manual PayNow/cash phase);
-- a Stripe webhook will populate the same column later.
ALTER TABLE qkit.licenses
  ADD COLUMN IF NOT EXISTS amount_cents INT NOT NULL DEFAULT 0;
