-- KDS CHECK 2026-10-25 — read-only. Run in the Supabase SQL editor and send
-- back the results. Nothing here changes data.

-- 1. Anything in the database that could reset a ticked line or a bump:
--    triggers on the order, line and bump tables.
select event_object_table as "table", trigger_name, action_timing || ' ' || event_manipulation as "when", action_statement
from information_schema.triggers
where event_object_table in ('menu_orders', 'menu_order_items', 'kds_bumps')
order by 1, 2;

-- 2. How a bump row is keyed (a re-bump must update the same row).
select conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c join pg_class t on t.oid = c.conrelid
where t.relname = 'kds_bumps';

-- 3. Who may write kds_bumps from a screen.
select policyname, cmd, roles, qual, with_check from pg_policies where tablename = 'kds_bumps';
select relrowsecurity as rls_on from pg_class where relname = 'kds_bumps';

-- 4. Screens in use today and whether they're licensed (an unlicensed screen
--    can't save ticks at all).
select s.screen_key, s.label, s.kind, s.status, s.last_seen_at
from kds_screens s
where s.last_seen_at > now() - interval '2 days'
order by s.location_id, s.screen_key;
