-- ROUNDS PER SCREEN 2026-10-26 — run once in the Supabase SQL editor, then
-- deploy place-order. Safe to run again.
--
-- When a round is added, each kitchen screen should fold its earlier rounds
-- away as "served earlier" only if THAT screen had finished (bumped) them.
-- This column records which screens had; place-order fills it in. Orders
-- without it keep the old rule.
alter table menu_orders add column if not exists restarted_screens jsonb;
notify pgrst, 'reload schema';

select count(*) as restarted_screens_ready
from information_schema.columns where table_name = 'menu_orders' and column_name = 'restarted_screens';
