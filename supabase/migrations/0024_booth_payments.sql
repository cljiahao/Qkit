-- Payment seam: optional per-booth payment method + per-order payment lifecycle.
-- No money flows through QKit; vendor is merchant of record. Active kinds
-- (pointer, paynow) carry no secrets, so booths.payment is publicly readable
-- alongside the existing public booth read.

create type payment_status as enum (
  'not_required', 'pending', 'claimed', 'confirmed'
);

-- Discriminated union by `kind` ('pointer' | 'paynow' | 'stripe'); validated in
-- app code (Zod). NULL = queue-only (today's behavior).
alter table public.booths
  add column payment jsonb;

alter table public.orders
  add column payment_status payment_status not null default 'not_required',
  add column payment_method_kind text,
  add column paid_at timestamptz;

-- Existing orders predate the seam → already correct at the 'not_required'
-- default; no backfill needed beyond the default.
