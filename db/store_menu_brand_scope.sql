-- store_menu_full: a store never sees the menus of another brand.
--
-- WHY
-- The menu filter had three tiers: an explicit per-store list in
-- menu_location_menus, else the band list in menu_band_menus, else every
-- active menu. Nothing anywhere looked at the brand. 18 of the 22 UK
-- Chocoberry stores pin nothing and have no band, so they fell to the third
-- tier and carried every active menu in the database - the five Tove ones
-- included, and the three Dubai menus the moment they were seeded.
--
-- THE CLAUSE
-- Written so it can only ever narrow, never blank a store:
--   * a menu with no brand stays visible to everyone
--   * a store with no brand keeps seeing everything, exactly as today
--   * otherwise the brands must match
-- Every store and every menu currently has a brand, so in practice each store
-- sees only the menus of its own brand. The two null-tolerant arms are there
-- so a store or menu created later without a brand falls back to the old
-- behaviour rather than going blank mid-service.
--
-- The clause is ANDed with the existing three-tier CASE, so it narrows the
-- pinned and banded tiers too. Checked first: every row in
-- menu_location_menus and menu_band_menus is same-brand, so those six stores
-- are unaffected.
--
-- Everything else in the function is byte-for-byte as it was.

create or replace function public.store_menu_full(loc uuid, at_time timestamp with time zone default now())
 returns table(menu_id uuid, menu_name text, menu_sort integer, menu_open boolean, category_id uuid, category_name text, category_sort integer, item_id uuid, item_name text, description text, removables text[], price numeric, image_url text, gradient_bg text, gradient_prod text, allergens text[], allergens_contains text[], allergens_may text[], tags text[], available boolean, item_sort integer, pos_id text, modifiers jsonb)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with band as (
    select price_band_id as id from menu_locations where id = loc
  ),
  mband as (
    select coalesce(menu_band_id, price_band_id) as id from menu_locations where id = loc
  ),
  locbrand as (
    select brand_id as id from menu_locations where id = loc
  )
  select
    m.id, m.name, m.sort_order,
    menu_is_open(m.available_from, m.available_to, m.days_of_week, at_time),
    c.id, c.name, c.sort_order,
    i.id, i.name, i.description,
    i.removables,
    coalesce(o.price, bp.price, i.price),
    i.image_url, i.gradient_bg, i.gradient_prod,
    i.allergens,
    coalesce(i.allergens_contains, '{}'),
    coalesce(i.allergens_may, '{}'),
    i.tags,
    case
      when o.unavailable_until is not null and o.unavailable_until > at_time then false
      else coalesce(o.available, bi.available, i.available)
    end,
    i.sort_order, i.pos_id,
    coalesce((
      select jsonb_agg(g ORDER BY g->>'name')
      from (
        select jsonb_build_object(
          'id', mg.id, 'name', mg.name,
          'required', coalesce(mg.required, false),
          'min_select', coalesce(mg.min_select, 0),
          'max_select', coalesce(mg.max_select, 1),
          'options', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', mo.id, 'name', mo.name,
              'price_delta', coalesce(mv.price_delta, bop.price_delta, mo.price_delta, 0),
              'allergens_contains', coalesce(mo.allergens_contains, '{}'),
              'allergens_may', coalesce(mo.allergens_may, '{}')
            ) ORDER BY mo.sort_order NULLS LAST, mo.name)
            from menu_modifiers mo
            left join menu_modifier_overrides mv
              on mv.option_id = mo.id and mv.location_id = loc
            left join menu_band_option_prices bop
              on bop.option_id = mo.id and bop.band_id = (select id from band)
            where mo.group_id = mg.id
              and coalesce(mv.available, true) = true
          ), '[]'::jsonb)
        ) as g
        from menu_item_modifiers im
        join menu_modifier_groups mg on mg.id = im.group_id
        where im.item_id = i.id
      ) sub
    ), '[]'::jsonb)
  from menu_menus m
  join menu_categories c on c.menu_id = m.id and c.active = true
  join menu_items i on i.category_id = c.id and i.published = true
  left join menu_item_overrides o on o.item_id = i.id and o.location_id = loc
  left join menu_band_prices bp on bp.item_id = i.id and bp.band_id = (select id from band)
  left join menu_band_items  bi on bi.item_id = i.id and bi.band_id = (select id from mband)
  where m.active = true
    -- NEW: brand scope. Narrows only; the two null arms preserve old behaviour.
    and (
      m.brand_id is null
      or (select id from locbrand) is null
      or m.brand_id = (select id from locbrand)
    )
    and (
      case
        when exists (select 1 from menu_location_menus lm where lm.location_id = loc)
          then exists (select 1 from menu_location_menus lm
                        where lm.location_id = loc and lm.menu_id = m.id)
        when exists (select 1 from menu_band_menus bm
                      where bm.band_id = (select id from mband))
          then exists (select 1 from menu_band_menus bm
                        where bm.band_id = (select id from mband)
                          and bm.menu_id = m.id)
        else true
      end
    )
  order by m.sort_order, c.sort_order, i.sort_order;
$function$;

-- ---------- The two Dubai stores, each on its own menu ----------
-- Brand scope alone would leave both carrying all three UAE menus. Downtown
-- sells the Dubai menu, Al Zahia the Sharjah one. Cake Collection is left off
-- both for now: Sharjah Menu already contains a PREORDER CAKE category, so
-- adding it to Al Zahia would list the cakes twice, and Downtown has no cake
-- categories at all. Switch it on from Band menus in the admin if Downtown
-- does sell them.
do $$
declare
  v_brand uuid;
  v_dt    uuid;
  v_zm    uuid;
  v_bdt   uuid;
  v_bzm   uuid;
  v_mdub  uuid;
  v_mshj  uuid;
begin
  select id into v_brand from menu_brands where lower(name) = 'chocoberry uae' limit 1;
  select id into v_dt from menu_locations where lower(name) = 'dubai downtown' limit 1;
  select id into v_zm from menu_locations where lower(name) = 'al zahia mall' limit 1;
  select id into v_mdub from menu_menus where pos_menu_id = 'apetito:77461' limit 1;
  select id into v_mshj from menu_menus where pos_menu_id = 'apetito:76088' limit 1;
  if v_brand is null or v_dt is null or v_zm is null or v_mdub is null or v_mshj is null then
    raise exception 'Dubai brand, stores or menus missing - run the setup and seed first';
  end if;

  -- Menu bands live in menu_price_bands, distinguished by band_kind.
  select id into v_bdt from menu_price_bands
   where lower(name) = 'dubai downtown' and band_kind = 'menu' limit 1;
  if v_bdt is null then
    insert into menu_price_bands (name, band_kind, brand_id)
    values ('Dubai Downtown', 'menu', v_brand) returning id into v_bdt;
  end if;

  select id into v_bzm from menu_price_bands
   where lower(name) = 'sharjah' and band_kind = 'menu' limit 1;
  if v_bzm is null then
    insert into menu_price_bands (name, band_kind, brand_id)
    values ('Sharjah', 'menu', v_brand) returning id into v_bzm;
  end if;

  update menu_locations set menu_band_id = v_bdt where id = v_dt;
  update menu_locations set menu_band_id = v_bzm where id = v_zm;

  -- One menu per band. No ON CONFLICT: a unique index on (band_id, menu_id) is
  -- not confirmed, so check before inserting.
  if not exists (select 1 from menu_band_menus where band_id = v_bdt and menu_id = v_mdub) then
    insert into menu_band_menus (band_id, menu_id) values (v_bdt, v_mdub);
  end if;
  if not exists (select 1 from menu_band_menus where band_id = v_bzm and menu_id = v_mshj) then
    insert into menu_band_menus (band_id, menu_id) values (v_bzm, v_mshj);
  end if;

  raise notice 'Downtown band = %, Sharjah band = %', v_bdt, v_bzm;
end $$;

-- ---------- Switch the Dubai menus back on ----------
-- They were deactivated to stop them appearing on UK tablets. The brand clause
-- above is now what keeps them off, so they can carry their own stores again.
update menu_menus
   set active = true
 where brand_id = (select id from menu_brands where lower(name) = 'chocoberry uae');

-- ---------- Proof ----------
-- Calls the real function once per store and counts what each one now sees.
-- Expect: 22 UK Chocoberry stores on 6, Tove Coffee on 5, Dubai Downtown and
-- Al Zahia Mall on 1 each. Any store showing 0 is a problem - say so before
-- opening.
select l.name as store,
       coalesce(b.name, '(no brand)') as brand,
       (select count(distinct s.menu_name) from store_menu_full(l.id) s) as menus_visible
from menu_locations l
left join menu_brands b on b.id = l.brand_id
where l.active
order by 2, 1;
