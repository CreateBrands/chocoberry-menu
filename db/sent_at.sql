-- SENT TO KITCHEN 2026-10-25 — run once in the Supabase SQL editor, BEFORE
-- the KDS update goes live. Safe to run again.
--
-- The kitchen clock used to start at created_at. A till "Pay" or a kiosk
-- order is created on hold while the customer pays, so the time spent at the
-- card machine counted as kitchen time. sent_at is the moment the order
-- actually reaches the kitchen:
--   * an order created straight onto the KDS — when it is created
--   * an order created on hold — when payment releases it
-- One trigger stamps it for every route (till, kiosk, tablet, phone, Flipdish,
-- payments), so no code path can forget. It is set once and never moved:
-- adding a round later does not reset it (rounds have their own times).
-- Receipts and reports keep created_at; only kitchen timing uses sent_at.

alter table menu_orders add column if not exists sent_at timestamptz;

create or replace function public.menu_orders_stamp_sent()
 returns trigger
 language plpgsql
as $function$
begin
  if new.sent_at is null and new.status is distinct from 'hold' then
    new.sent_at := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists menu_orders_stamp_sent on menu_orders;
create trigger menu_orders_stamp_sent
  before insert or update of status on menu_orders
  for each row execute function public.menu_orders_stamp_sent();

-- Performance feed: also return sent_at (patches the live function in place,
-- changing nothing else).
do $$
declare d text;
begin
  select pg_get_functiondef('public.kds_ticket_times(uuid, timestamp with time zone, timestamp with time zone)'::regprocedure) into d;
  if position('''sent_at''' in d) > 0 then raise notice 'kds_ticket_times already returns sent_at'; return; end if;
  d := replace(d, '''created_at'', o.created_at,', '''created_at'', o.created_at,
    ''sent_at'', o.sent_at,');
  if position('''sent_at''' in d) = 0 then raise exception 'kds_ticket_times: created_at line not found — nothing changed'; end if;
  execute d;
end $$;

notify pgrst, 'reload schema';

-- Check: should show the column and the trigger.
select (select count(*) from information_schema.columns where table_name = 'menu_orders' and column_name = 'sent_at') as column_ready,
       (select count(*) from information_schema.triggers where trigger_name = 'menu_orders_stamp_sent') as trigger_ready;
