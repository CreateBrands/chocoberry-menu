-- Puts the two Dubai stores on the brand their menus belong to.
--
-- db/dubai_menu_setup.sql created both stores with brand_id null, while
-- db/dubai_menu_seed.sql put the three menus under a new 'Chocoberry UAE'
-- brand. A store and its menus on different brands is wrong whichever way
-- store_menu_full resolves them, so this closes that regardless.
--
-- Safe to re-run. Touches only stores whose timezone is Asia/Dubai, so no UK
-- store can be caught by it.

do $$
declare
  v_brand uuid;
  v_rows  int;
begin
  select id into v_brand from menu_brands where lower(name) = 'chocoberry uae' limit 1;
  if v_brand is null then
    raise exception 'Brand "Chocoberry UAE" not found — run db/dubai_menu_seed.sql first';
  end if;

  update menu_locations
     set brand_id = v_brand
   where timezone = 'Asia/Dubai'
     and brand_id is distinct from v_brand;

  get diagnostics v_rows = row_count;
  raise notice 'Chocoberry UAE = %, stores moved onto it: %', v_brand, v_rows;
end $$;

-- Check: both stores, their brand, and the menus that brand carries.
select l.name as store, l.timezone, b.name as brand,
       (select count(*) from menu_menus m where m.brand_id = l.brand_id and m.active) as menus_on_brand
from menu_locations l
left join menu_brands b on b.id = l.brand_id
where l.timezone = 'Asia/Dubai'
order by l.name;

notify pgrst, 'reload schema';
