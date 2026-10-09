-- ============================================================
-- Tove: size options on matcha and hot chocolate, plus whipped cream.
-- From the Flipdish screens (09 Oct): "Choose Size - Matcha" Regular £0.00 /
-- Large - Can £1.30, and Hot Chocolate with a Whipped Cream choice.
--
-- RUN SECTION 1 FIRST and read what it lists. Sections 2 and 3 only make
-- sense once the item lists look right — linking by name is convenient but
-- it is still a pattern match, and a stray "Matcha Cheesecake" would get a
-- drink size option nobody wants.
-- ============================================================

-- ---------- 1. PREVIEW: which items would be linked ----------
with tove as (
  select id from menu_brands where name ilike '%tove%' limit 1
)
select 'MATCHA SIZE' as group_to_link, i.id, i.name, c.name as category, m.name as menu
from menu_items i
join menu_categories c on c.id = i.category_id
join menu_menus m on m.id = c.menu_id
where m.brand_id = (select id from tove)
  and i.name ilike '%matcha%'
union all
select 'HOT CHOC SIZE + WHIPPED CREAM', i.id, i.name, c.name, m.name
from menu_items i
join menu_categories c on c.id = i.category_id
join menu_menus m on m.id = c.menu_id
where m.brand_id = (select id from menu_brands where name ilike '%tove%' limit 1)
  and i.name ilike '%hot chocolate%'
order by 1, 3;

-- ---------- 2. CREATE THE GROUPS AND THEIR OPTIONS ----------
-- Safe to re-run: groups are matched by brand + name.
do $$
declare
  v_brand uuid;
  g_matcha uuid;
  g_choc uuid;
  g_whip uuid;
begin
  select id into v_brand from menu_brands where name ilike '%tove%' limit 1;
  if v_brand is null then raise exception 'No Tove brand found in menu_brands'; end if;

  -- Choose Size - Matcha ------------------------------------------------
  select id into g_matcha from menu_modifier_groups
   where brand_id = v_brand and name = 'Choose Size - Matcha' limit 1;
  if g_matcha is null then
    insert into menu_modifier_groups (brand_id, name, min_select, max_select, required)
    values (v_brand, 'Choose Size - Matcha', 1, 1, true) returning id into g_matcha;
  end if;
  delete from menu_modifiers where group_id = g_matcha;
  insert into menu_modifiers (group_id, name, price_delta, sort_order) values
    (g_matcha, 'Regular',      0.00, 1),
    (g_matcha, 'Large - Can',  1.30, 2);

  -- Choose Size - Hot Chocolate -----------------------------------------
  select id into g_choc from menu_modifier_groups
   where brand_id = v_brand and name = 'Choose Size - Hot Chocolate' limit 1;
  if g_choc is null then
    insert into menu_modifier_groups (brand_id, name, min_select, max_select, required)
    values (v_brand, 'Choose Size - Hot Chocolate', 1, 1, true) returning id into g_choc;
  end if;
  delete from menu_modifiers where group_id = g_choc;
  insert into menu_modifiers (group_id, name, price_delta, sort_order) values
    (g_choc, 'Regular', 0.00, 1),
    (g_choc, 'Large',   1.30, 2);   -- change if Large hot chocolate is not +1.30

  -- Whipped Cream --------------------------------------------------------
  select id into g_whip from menu_modifier_groups
   where brand_id = v_brand and name = 'Whipped Cream' limit 1;
  if g_whip is null then
    insert into menu_modifier_groups (brand_id, name, min_select, max_select, required)
    values (v_brand, 'Whipped Cream', 1, 1, true) returning id into g_whip;
  end if;
  delete from menu_modifiers where group_id = g_whip;
  insert into menu_modifiers (group_id, name, price_delta, sort_order) values
    (g_whip, 'Whipped Cream',    0.00, 1),   -- change if it is chargeable
    (g_whip, 'No Whipped Cream', 0.00, 2);
end $$;

-- ---------- 3. LINK THE GROUPS TO THE ITEMS ----------
-- Adds links without disturbing any modifier groups those items already have.
with tove as (select id from menu_brands where name ilike '%tove%' limit 1),
grp as (
  select
    (select id from menu_modifier_groups where brand_id = (select id from tove) and name = 'Choose Size - Matcha') as matcha,
    (select id from menu_modifier_groups where brand_id = (select id from tove) and name = 'Choose Size - Hot Chocolate') as choc,
    (select id from menu_modifier_groups where brand_id = (select id from tove) and name = 'Whipped Cream') as whip
),
items as (
  select i.id, i.name
  from menu_items i
  join menu_categories c on c.id = i.category_id
  join menu_menus m on m.id = c.menu_id
  where m.brand_id = (select id from tove)
    -- Drinks only. Without this, "Hot Chocolate Pudding" in Viral Desserts
    -- picks up a cup size and a whipped-cream choice.
    and m.name = 'HOT DRINKS'
)
insert into menu_item_modifiers (item_id, group_id)
select x.id, x.gid from (
  select i.id, (select matcha from grp) as gid from items i where i.name ilike '%matcha%'
  union all
  select i.id, (select choc from grp)   from items i where i.name ilike '%hot chocolate%'
  union all
  select i.id, (select whip from grp)   from items i where i.name ilike '%hot chocolate%'
) x
where x.gid is not null
  and not exists (
    select 1 from menu_item_modifiers e where e.item_id = x.id and e.group_id = x.gid
  );

-- ---------- 4. CHECK ----------
-- select i.name as item, g.name as modifier_group
-- from menu_item_modifiers im
-- join menu_items i on i.id = im.item_id
-- join menu_modifier_groups g on g.id = im.group_id
-- where g.brand_id = (select id from menu_brands where name ilike '%tove%' limit 1)
-- order by i.name, g.name;

notify pgrst, 'reload schema';
