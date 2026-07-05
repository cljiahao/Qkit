-- Booth working hours. Nullable JSONB; null = no time restriction (open
-- whenever is_active). Shape is validated in app code (boothHoursSchema):
--   null
--   | { "mode": "daily",  "open": "HH:MM", "close": "HH:MM" }
--   | { "mode": "weekly", "days": { "mon": {open,close}|null, ... "sun": ... } }
-- Existing booths default to null -> behavior unchanged.
alter table qkit.booths
  add column if not exists hours jsonb;
