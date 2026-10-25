-- STOCK ON/OFF FROM THE TILL 2026-10-25 — run once in the Supabase SQL editor,
-- BEFORE deploying admin-api. Safe to run again.
--
-- Items already have "off today" (menu_item_overrides.unavailable_until, set
-- by menu_item_86 to the next 06:00 and cleared by itself). Modifier options
-- only had the permanent per-store switch (menu_modifier_overrides.available).
-- This gives options the same "off today":
--   1. an unavailable_until column on menu_modifier_overrides
--   2. store_menu_full skips an option while its unavailable_until is in the
--      future, exactly as it already does for items.
--
-- (2) patches the LIVE definition of store_menu_full in place — it reads the
-- function as it is in the database now, changes only the modifier filter
-- line, and re-creates it — so nothing else in the function can be lost.

alter table menu_modifier_overrides add column if not exists unavailable_until timestamptz;

do $$
declare
  d text;
  fn regprocedure := 'public.store_menu_full(uuid, timestamp with time zone)'::regprocedure;
begin
  select pg_get_functiondef(fn) into d;
  if position('mv.unavailable_until' in d) > 0 then
    raise notice 'store_menu_full already skips options that are off today';
    return;
  end if;
  d := replace(d,
    'and coalesce(mv.available, true) = true',
    'and coalesce(mv.available, true) = true
              and (mv.unavailable_until is null or mv.unavailable_until <= at_time)');
  if position('mv.unavailable_until' in d) = 0 then
    raise exception 'store_menu_full: could not find the modifier filter line — nothing changed';
  end if;
  execute d;
end $$;

notify pgrst, 'reload schema';

-- Check: should return one row, true
select position('mv.unavailable_until' in pg_get_functiondef('public.store_menu_full(uuid, timestamp with time zone)'::regprocedure)) > 0 as options_off_today_ready;
