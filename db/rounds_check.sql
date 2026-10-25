-- ROUNDS CHECK 2026-10-25 — read-only. Run BEFORE deploying place-order and
-- send back both results.

-- 1. Anything in the database that already writes round times on an order.
--    Expected: no rows mentioning items_added / round_restarted / kds_bump_log.
select event_object_table as "table", trigger_name, action_timing || ' ' || event_manipulation as "when", action_statement
from information_schema.triggers
where event_object_table in ('menu_orders', 'menu_order_items', 'kds_bumps')
order by 1, 2;

-- 2. Orders with added rounds in the last 14 days, and how many have their
--    round times recorded. If "rounds_recorded" is 0 the KDS and Performance
--    have been timing every added round from the original order.
select count(*) as orders_with_added_rounds,
       count(*) filter (where jsonb_array_length(coalesce(o.items_added_log, '[]'::jsonb)) > 0) as rounds_recorded,
       count(*) filter (where o.round_restarted) as marked_restarted
from menu_orders o
where o.created_at > now() - interval '14 days'
  and exists (select 1 from menu_order_items i where i.order_id = o.id and coalesce(i.added_batch, 0) > 0);
