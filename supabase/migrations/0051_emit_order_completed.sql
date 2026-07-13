-- qkit/supabase/migrations/0051_emit_order_completed.sql
-- On order completion, tell merqo.kit_events so loopkit (or any future kit)
-- can react without qkit knowing anything about who's listening. Fires only
-- on the pending->...->completed transition, not on every UPDATE (an order
-- already completed re-saved for an unrelated reason must not re-emit).
create or replace function qkit.emit_order_completed()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_vendor_id uuid;
begin
  if NEW.status = 'completed' and OLD.status is distinct from 'completed' then
    select vendor_id into v_vendor_id
      from qkit.booths
      where id = NEW.booth_id;

    if v_vendor_id is not null then
      perform merqo.emit_metric(
        v_vendor_id,
        'qkit',
        'order_completed',
        jsonb_build_object('order_id', NEW.id)
      );
    end if;
  end if;
  return NEW;
end;
$$;

create trigger on_order_completed
after update of status on qkit.orders
for each row execute function qkit.emit_order_completed();
