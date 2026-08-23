-- Mirrors 0024_booth_payments.sql's payment_status shape: an enum column
-- + a timestamp, both nullable-by-default via the enum's own default.
create type qkit.print_status as enum ('not_required', 'queued', 'sent', 'printed', 'failed');

alter table qkit.orders
  add column print_status qkit.print_status not null default 'not_required',
  add column print_status_updated_at timestamptz;
