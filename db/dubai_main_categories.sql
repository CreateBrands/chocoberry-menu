-- Dubai: give the tablets a top level.
--
-- Both UAE stores carry one menu holding nineteen sections, so the browse
-- page opened on the inside of a single list and the main-category row has
-- nothing to show. This regroups those sections under the five Atif asked
-- for, plus Limited Time Offers, which exists at Al Zahia and belongs nowhere
-- else.
--
-- The menu/category pair is the apps only two-level structure, so a main
-- category has to BE a menu. Each source menu is therefore split into its own
-- set: Downtown keeps its sections, Al Zahia keeps its sections, and no item
-- moves between stores. The cost is that the admin menu list shows DRINKS
-- twice, once per store, because menu_menus is scoped by brand and both
-- stores are Chocoberry UAE. Merging the two into one shared set would read
-- better but means deduplicating about 400 near-identical items first, which
-- is its own job.
--
-- APPETIZERS is grouped under MAIN. It is the one section with a reasonable
-- case for sitting elsewhere, so move it if you disagree.
--
-- Safe to attempt: a DO block is one transaction, so if any statement fails
-- nothing at all is applied. Not safe to run TWICE, though -- the second run
-- would find the sections already moved and build a second empty set. The
-- guard below refuses once the source menus are inactive.
--
-- Reversing it: the source menus are deactivated, never deleted, so moving
-- the categories back by name and reactivating them restores the old shape.

do $$
declare
  v_src record;
  v_grp record;
  v_new uuid;
  v_n   int;
begin
  for v_src in
    select id, name, brand_id
    from menu_menus
    where name in ('Dubai Menu', 'Sharjah Menu')
      and active
    order by sort_order
  loop
    -- Already split? Then there is nothing left to move and a second pass
    -- would only create empties.
    select count(*) into v_n from menu_categories where menu_id = v_src.id;
    if v_n = 0 then
      raise notice 'skipping % - no sections left on it', v_src.name;
      continue;
    end if;

    for v_grp in
      select * from (values
        (10, 'DRINKS',              array['SIGNATURE MATCHAS','SIGNATURE COFFEE','COFFEE','COLD COFFEE','TEAS','MOCKTAILS','SMOOTHIES','FRESH JUICES']),
        (20, 'ALL DAY BREAKFAST',   array['ALL DAY BREAKFAST']),
        (30, 'SOUPS & SALADS',      array['SOUPS','SALADS']),
        (40, 'MAIN',                array['APPETIZERS','SANDWICHES','BOWLS','MAINS','KIDS MENU']),
        (50, 'DESSERTS',            array['PASTRIES','BAKERY','CHOCOBERRY TREATS','PREORDER CAKE']),
        (60, 'LIMITED TIME OFFERS', array['LIMITED TIME OFFERS'])
      ) as t(ord, nm, sections)
      order by 1
    loop
      select count(*) into v_n
        from menu_categories c
       where c.menu_id = v_src.id and c.name = any(v_grp.sections);
      continue when v_n = 0;   -- Downtown has no Limited Time Offers

      -- Carry the availability window across, so a menu that only runs at
      -- certain hours keeps doing so after the split.
      insert into menu_menus (name, brand_id, sort_order, active, available_from, available_to, days_of_week)
      select v_grp.nm, m.brand_id, v_grp.ord, true, m.available_from, m.available_to, m.days_of_week
        from menu_menus m where m.id = v_src.id
      returning id into v_new;

      -- Sections keep the order this script lists them in, which is the order
      -- a customer should meet them, not alphabetical.
      update menu_categories c
         set menu_id = v_new,
             sort_order = array_position(v_grp.sections, c.name)
       where c.menu_id = v_src.id
         and c.name = any(v_grp.sections);

      -- Whatever carried the old menu now carries each new one.
      insert into menu_band_menus (band_id, menu_id)
        select bm.band_id, v_new from menu_band_menus bm where bm.menu_id = v_src.id;
      insert into menu_location_menus (location_id, menu_id)
        select lm.location_id, v_new from menu_location_menus lm where lm.menu_id = v_src.id;

      raise notice '% -> % (% sections)', v_src.name, v_grp.nm, v_n;
    end loop;

    delete from menu_band_menus     where menu_id = v_src.id;
    delete from menu_location_menus where menu_id = v_src.id;
    update menu_menus set active = false where id = v_src.id;
  end loop;
end $$;

-- What each Dubai store now carries, as the tablet will resolve it.
select l.name as store,
       s.menu_name as main_category,
       count(distinct s.category_name) as sections,
       count(*) as items
from menu_locations l
cross join lateral store_menu_full(l.id) s
where l.timezone = 'Asia/Dubai'
group by l.name, s.menu_name, s.menu_sort
order by l.name, s.menu_sort;
