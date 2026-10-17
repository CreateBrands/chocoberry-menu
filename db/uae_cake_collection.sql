-- Give both UAE stores a Cake Collection of their own.
--
-- The two stores arrive at it from different places, which is why this is not
-- one insert. Al Zahia already sells the cakes: its PREORDER CAKE section came
-- across from the Sharjah Menu and is currently sitting inside DESSERTS, so it
-- is promoted out rather than duplicated. Downtown has no cake section at all,
-- so it is wired to the standalone Cake Collection menu that already exists
-- and has never been carried by anything.
--
-- Doing it the other way round would list the Al Zahia cakes twice, once under
-- Desserts and once under Cake Collection.
--
-- A store is wired to a menu through menu_location_menus when it has any rows
-- there and through its band otherwise, which is the order store_menu_full
-- resolves in. This follows whichever one each store already uses, so a store
-- pinned to its own menu list does not quietly start following its band.
--
-- Safe to re-run: every step checks for itself first.

do $$
declare
  v_loc    record;
  v_menu   uuid;
  v_cake   uuid;
  v_brand  uuid;
  v_band   uuid;
  v_pinned boolean;
begin
  for v_loc in
    select id, name, coalesce(menu_band_id, price_band_id) as mband, brand_id
    from menu_locations
    where timezone = 'Asia/Dubai' and active
    order by name
  loop
    v_band := v_loc.mband;
    v_pinned := exists (select 1 from menu_location_menus lm where lm.location_id = v_loc.id);

    -- Does this store carry a cake section already, wherever it sits?
    select c.id into v_cake
    from menu_categories c
    join menu_menus m on m.id = c.menu_id and m.active
    where c.name = 'PREORDER CAKE'
      and case
        when v_pinned then exists (select 1 from menu_location_menus lm where lm.location_id = v_loc.id and lm.menu_id = m.id)
        else exists (select 1 from menu_band_menus bm where bm.band_id = v_band and bm.menu_id = m.id)
      end
    limit 1;

    if v_cake is not null then
      -- It has one. Promote it into a main category of its own.
      select id into v_menu from menu_menus
       where name = 'CAKE COLLECTION' and brand_id = v_loc.brand_id
         and case
           when v_pinned then exists (select 1 from menu_location_menus lm where lm.location_id = v_loc.id and lm.menu_id = menu_menus.id)
           else exists (select 1 from menu_band_menus bm where bm.band_id = v_band and bm.menu_id = menu_menus.id)
         end
       limit 1;

      if v_menu is null then
        insert into menu_menus (name, brand_id, sort_order, active)
        values ('CAKE COLLECTION', v_loc.brand_id, 70, true)
        returning id into v_menu;
      end if;

      update menu_categories set menu_id = v_menu, sort_order = 1 where id = v_cake;
      raise notice '% - promoted its own cake section', v_loc.name;

    else
      -- It has none. Carry the standalone Cake Collection menu instead.
      select id into v_menu from menu_menus
       where lower(name) in ('cake collection') limit 1;
      if v_menu is null then
        raise notice '% - no cake collection menu to carry', v_loc.name;
        continue;
      end if;
      update menu_menus set name = 'CAKE COLLECTION', sort_order = 70, active = true where id = v_menu;
      raise notice '% - carrying the standalone cake collection', v_loc.name;
    end if;

    -- Wire it on, the same way everything else this store carries is wired.
    if v_pinned then
      if not exists (select 1 from menu_location_menus lm where lm.location_id = v_loc.id and lm.menu_id = v_menu) then
        insert into menu_location_menus (location_id, menu_id) values (v_loc.id, v_menu);
      end if;
    elsif v_band is not null then
      if not exists (select 1 from menu_band_menus bm where bm.band_id = v_band and bm.menu_id = v_menu) then
        insert into menu_band_menus (band_id, menu_id) values (v_band, v_menu);
      end if;
    end if;

    v_cake := null; v_menu := null;
  end loop;
end $$;

-- What each store now carries, through the real resolver.
select l.name as store, s.menu_name as main_category,
       count(distinct s.category_name) as sections, count(*) as items
from menu_locations l
cross join lateral store_menu_full(l.id) s
where l.timezone = 'Asia/Dubai'
group by l.name, s.menu_name, s.menu_sort
order by l.name, s.menu_sort;
