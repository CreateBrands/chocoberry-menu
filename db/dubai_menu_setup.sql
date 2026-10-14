-- Dubai on the tablet menu — step 1: the things that need no menu data.
--
-- Section 3 creates the two stores and their settings. Sections 1 and 2 only
-- LOOK, and their output is what the menu-seeding script will be built from —
-- run them and send the results back before anything seeds items.

-- ---------- 1. The column the trading day needs ----------
-- 04:00 is the trading-day boundary. Without a zone the server assumes
-- Europe/London, which in Dubai falls at 07:00–08:00 local — inside opening
-- hours, so a morning's orders would straddle two trading days and the
-- closing report would be quietly wrong. Null means London, so every UK
-- store is unaffected.
alter table menu_locations add column if not exists timezone text;

-- ---------- 2. What is already there to build a menu from ----------
-- The Petpooja menu was loaded into the COGS catalogue in September. This is
-- the inspection: what columns it actually has, and what it holds for UAE.
select column_name, data_type
from information_schema.columns
where table_name = 'cogs_products'
order by ordinal_position;

select region, count(*) as products, count(distinct category) as categories
from cogs_products
group by region order by region;

-- A sample, so the seeding script can be written against real values rather
-- than assumptions about which column carries the selling price.
select * from cogs_products
where region = 'UAE'
order by category, name
limit 20;

-- And what the menu app already has, for comparison.
select b.name as brand, count(distinct m.id) as menus,
       count(distinct c.id) as categories, count(i.id) as items
from menu_brands b
left join menu_menus m on m.brand_id = b.id
left join menu_categories c on c.menu_id = m.id
left join menu_items i on i.category_id = c.id
group by b.name order by b.name;

-- ---------- 3. The two Dubai stores ----------
-- Safe to run more than once: everything checks before it writes.
do $$
declare
  v_dt   uuid;
  v_zm   uuid;
begin
  select id into v_dt from menu_locations where name ilike '%downtown%' limit 1;
  if v_dt is null then
    insert into menu_locations (name, timezone) values ('Dubai Downtown', 'Asia/Dubai') returning id into v_dt;
    raise notice 'Created Dubai Downtown';
  else
    update menu_locations set timezone = 'Asia/Dubai' where id = v_dt;
    raise notice 'Dubai Downtown already existed — timezone set';
  end if;

  -- Al Zahia Mall is in Sharjah, which keeps the same clock as Dubai.
  select id into v_zm from menu_locations where name ilike '%zahia%' limit 1;
  if v_zm is null then
    insert into menu_locations (name, timezone) values ('Al Zahia Mall', 'Asia/Dubai') returning id into v_zm;
    raise notice 'Created Al Zahia Mall';
  else
    update menu_locations set timezone = 'Asia/Dubai' where id = v_zm;
    raise notice 'Al Zahia Mall already existed — timezone set';
  end if;

  -- Prices in AED. Same per-store override the kiosk inset uses: the app
  -- reads `currency:<location_id>` and falls back to GBP when absent, so no
  -- UK store is touched.
  insert into menu_app_settings (key, value) values
    ('currency:' || v_dt::text, 'AED'),
    ('currency:' || v_zm::text, 'AED')
  on conflict (key) do update set value = excluded.value;

  raise notice 'Dubai Downtown = %, Al Zahia Mall = %', v_dt, v_zm;
end $$;

-- ---------- 4. Check ----------
select id, name, timezone from menu_locations where timezone is not null;
select key, value from menu_app_settings where key like 'currency:%';

notify pgrst, 'reload schema';
