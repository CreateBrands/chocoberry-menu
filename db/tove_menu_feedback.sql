-- Tove team feedback, 11 Oct. Three menu changes:
--   1. Shakes need the whipped cream / no whipped cream choice.
--   2. Focaccia needs Add Chicken £2.50 / Add Beef £3.50, same as Flipdish.
--   3. Iced Vanilla Matcha is priced 4.95, should be 5.45.
--
-- Safe to run more than once: every part checks before it writes, and the
-- parts that cannot identify their target exactly do nothing and say so. A
-- modifier on the wrong item or a price on the wrong drink is worse than no
-- change at all.
--
-- Sections 1 and 2 only look. Section 3 makes the changes.

-- ---------- 1. What is there now ----------
with tove as (select id from menu_brands where name ilike '%tove%' limit 1)
select g.name as group_name, g.min_select, g.max_select, g.required,
       (select string_agg(o.name || ' +' || coalesce(o.price_delta, 0)::text, ', ' order by o.sort_order, o.name)
          from menu_modifiers o where o.group_id = g.id) as options,
       (select count(*) from menu_item_modifiers im where im.group_id = g.id) as items_using_it
from menu_modifier_groups g
where g.brand_id = (select id from tove)
  and (g.name ilike '%whip%' or g.name ilike '%focaccia%' or g.name ilike '%add on%')
order by g.name;

-- ---------- 2. The items these changes touch ----------
with tove as (select id from menu_brands where name ilike '%tove%' limit 1),
items as (
  select i.id, i.name, i.price, c.name as category
  from menu_items i
  join menu_categories c on c.id = i.category_id
  join menu_menus m on m.id = c.menu_id
  where m.brand_id = (select id from tove)
)
select 'shake' as kind, category, name, price::text as price from items where category ilike '%shake%'
union all
select 'focaccia', category, name, price::text from items where name ilike '%focaccia%'
union all
select 'vanilla', category, name, price::text from items where name ilike '%vanilla%'
order by kind, category, name;

-- ---------- 3. Make the changes ----------
do $$
declare
  v_tove  uuid;
  v_group uuid;
  v_n     int;
  v_item  uuid;
  v_was   numeric;
begin
  select id into v_tove from menu_brands where name ilike '%tove%' limit 1;
  if v_tove is null then raise exception 'No Tove brand'; end if;

  -- ===== 1. Whipped cream on the shakes =====
  -- Reuses the group the drinks already use, so there is one place to edit it.
  -- count and fetch separately: there is no min(uuid) in Postgres.
  select count(*) into v_n
  from menu_modifier_groups where brand_id = v_tove and name ilike '%whip%';
  select id into v_group
  from menu_modifier_groups where brand_id = v_tove and name ilike '%whip%' limit 1;

  if v_n <> 1 then
    raise notice 'SKIPPED shakes: found % whipped cream group(s), need exactly 1. Section 1 lists them.', v_n;
  else
    insert into menu_item_modifiers (item_id, group_id)
    select i.id, v_group
    from menu_items i
    join menu_categories c on c.id = i.category_id
    join menu_menus m on m.id = c.menu_id
    where m.brand_id = v_tove and c.name ilike '%shake%'
      and not exists (select 1 from menu_item_modifiers e where e.item_id = i.id and e.group_id = v_group);
    get diagnostics v_n = row_count;
    raise notice 'Shakes: whipped cream added to % item(s).', v_n;
  end if;

  -- ===== 2. Focaccia add-ons =====
  -- Optional and pick-one, so "none" is simply not choosing — which is how
  -- the Flipdish version behaves ("No selections made" is allowed).
  select id into v_group
  from menu_modifier_groups
  where brand_id = v_tove and name = 'Focaccia - Add Ons' limit 1;

  if v_group is null then
    insert into menu_modifier_groups (brand_id, name, min_select, max_select, required)
    values (v_tove, 'Focaccia - Add Ons', 0, 1, false)
    returning id into v_group;
    raise notice 'Focaccia: created the add-ons group.';
  end if;

  insert into menu_modifiers (group_id, name, price_delta, sort_order)
  select v_group, x.name, x.price, x.ord
  from (values ('Add Chicken', 2.50, 1), ('Add Beef', 3.50, 2)) as x(name, price, ord)
  where not exists (select 1 from menu_modifiers o where o.group_id = v_group and o.name = x.name);

  -- Only the focaccias that come without meat. Offering "Add Beef" on the
  -- Beef Pastrami would read as a mistake to anyone standing at the kiosk.
  insert into menu_item_modifiers (item_id, group_id)
  select i.id, v_group
  from menu_items i
  join menu_categories c on c.id = i.category_id
  join menu_menus m on m.id = c.menu_id
  where m.brand_id = v_tove
    and i.name in ('Burrata Classic Focaccia', 'Cheese & Hot Honey Focaccia',
                   'Mushroom Truffle Focaccia', 'Omelette Focaccia')
    and not exists (select 1 from menu_item_modifiers e where e.item_id = i.id and e.group_id = v_group);
  get diagnostics v_n = row_count;
  raise notice 'Focaccia: add-ons attached to % item(s).', v_n;

  -- ===== 3. Iced Vanilla Matcha 4.95 -> 5.45 =====
  -- Matched on the price as well as the name: if it is not the 4.95 one, it
  -- is not the drink the team meant, so nothing happens.
  select count(*) into v_n
  from menu_items i
  join menu_categories c on c.id = i.category_id
  join menu_menus m on m.id = c.menu_id
  where m.brand_id = v_tove
    and i.name ilike '%vanilla%matcha%' and i.name not ilike '%hot%' and i.price = 4.95;
  select i.id into v_item
  from menu_items i
  join menu_categories c on c.id = i.category_id
  join menu_menus m on m.id = c.menu_id
  where m.brand_id = v_tove
    and i.name ilike '%vanilla%matcha%' and i.name not ilike '%hot%' and i.price = 4.95
  limit 1;

  if v_n = 1 then
    select price into v_was from menu_items where id = v_item;
    update menu_items set price = 5.45 where id = v_item;
    raise notice 'Price: % -> 5.45 on %', v_was, (select name from menu_items where id = v_item);
  else
    raise notice 'SKIPPED price: % iced vanilla matcha at 4.95 (need exactly 1). Section 2 lists what is there.', v_n;
  end if;
end $$;

-- ---------- 4. Check ----------
with tove as (select id from menu_brands where name ilike '%tove%' limit 1)
select c.name as category, i.name, i.price,
       (select string_agg(g.name, ', ' order by g.name)
          from menu_item_modifiers im join menu_modifier_groups g on g.id = im.group_id
         where im.item_id = i.id) as modifier_groups
from menu_items i
join menu_categories c on c.id = i.category_id
join menu_menus m on m.id = c.menu_id
where m.brand_id = (select id from tove)
  and (c.name ilike '%shake%' or i.name ilike '%focaccia%' or i.name ilike '%vanilla%matcha%')
order by c.name, i.name;

-- To offer the add-ons on EVERY focaccia instead of only the meat-free four:
-- insert into menu_item_modifiers (item_id, group_id)
-- select i.id, g.id from menu_items i
--   join menu_categories c on c.id = i.category_id
--   join menu_menus m on m.id = c.menu_id
--   cross join menu_modifier_groups g
--  where m.brand_id = (select id from menu_brands where name ilike '%tove%' limit 1)
--    and g.brand_id = m.brand_id and g.name = 'Focaccia - Add Ons'
--    and i.name ilike '%focaccia%'
--    and not exists (select 1 from menu_item_modifiers e where e.item_id = i.id and e.group_id = g.id);

notify pgrst, 'reload schema';
