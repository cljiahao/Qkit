begin;
select plan(12);
insert into auth.users(id,instance_id,aud,role,email) values
('81111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','callback-ordering@test.local');
insert into qkit.vendors(id) values('81111111-1111-1111-1111-111111111111');
insert into qkit.booths(id,vendor_id,name,is_active) values
('83333333-3333-3333-3333-333333333333','81111111-1111-1111-1111-111111111111','Callback test',false);
insert into qkit.orders(id,booth_id,order_number,customer_name,items,total_cents,print_status,print_status_updated_at) values
('84444444-4444-4444-4444-444444444444','83333333-3333-3333-3333-333333333333','TEST-001','Customer','[]',500,'queued','2026-10-08T02:00:00.000000Z'),
('85555555-5555-5555-5555-555555555555','83333333-3333-3333-3333-333333333333','TEST-002','Customer','[]',500,'queued','2026-10-08T02:00:00.000000Z');

-- Execute the route's atomic boolean predicate against real timestamp/enum columns.
create function pg_temp.apply_callback(p_order uuid,p_status qkit.print_status,p_attempt timestamptz)
returns integer language plpgsql as $$
declare changed integer;
begin
  update qkit.orders set print_status=p_status,print_status_updated_at=p_attempt
  where id=p_order and (
    print_status in ('not_required','queued')
    or print_status_updated_at is null
    or print_status_updated_at < p_attempt
    or (print_status_updated_at=p_attempt and print_status<>'printed')
  );
  get diagnostics changed=row_count;
  return changed;
end;
$$;
set local role service_role;
select is(pg_temp.apply_callback('84444444-4444-4444-4444-444444444444','printed','2026-10-08T01:00:00.123456Z'),1,'successful attempt applied despite later initial queued receipt');
select is(pg_temp.apply_callback('84444444-4444-4444-4444-444444444444','failed','2026-10-08T01:00:00.123455Z'),0,'older failed attempt cannot replace newer printed');
select is((select print_status::text from qkit.orders where id='84444444-4444-4444-4444-444444444444'),'printed','old failure leaves successful result intact');
select is(pg_temp.apply_callback('84444444-4444-4444-4444-444444444444','failed','2026-10-08T01:00:00.123456Z'),0,'same attempt failed cannot replace printed');
select is((select print_status::text from qkit.orders where id='84444444-4444-4444-4444-444444444444'),'printed','same attempt failure leaves successful result intact');
select is(pg_temp.apply_callback('84444444-4444-4444-4444-444444444444','printed','2026-10-08T01:00:00.123456Z'),0,'duplicate printed callback is idempotent');
select is(pg_temp.apply_callback('84444444-4444-4444-4444-444444444444','failed','2026-10-08T01:00:00.123457Z'),1,'newer reprint failure remains visible');
select is((select print_status::text from qkit.orders where id='84444444-4444-4444-4444-444444444444'),'failed','newer failed attempt replaced previous result');
select is(pg_temp.apply_callback('84444444-4444-4444-4444-444444444444','printed','2026-10-08T01:00:00.123457Z'),1,'same attempt printed may replace failure');
select is((select print_status::text from qkit.orders where id='84444444-4444-4444-4444-444444444444'),'printed','successful same attempt becomes final');
select is(pg_temp.apply_callback('86666666-6666-6666-6666-666666666666','printed','2026-10-08T01:00:00.123457Z'),0,'missing order has no mutation');
select is(pg_temp.apply_callback('85555555-5555-5555-5555-555555555555','failed','2026-10-08T01:00:00.000001Z'),1,'initial queued order accepts its first terminal failure');
reset role;
select * from finish();
rollback;
