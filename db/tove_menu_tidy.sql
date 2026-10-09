-- Tove menu tidy-up, 09 Oct.
--   * Large on a hot chocolate is +0.40 ("Size"), so the imported
--     "Hot Drink Size" (+0.50) comes off the hot chocolates.
--   * Whipped cream is free, so the 0.50 one inside "Enhance Your Drink"
--     goes and the free Whipped Cream / No Whipped Cream group stays.
-- Run section 3 only after looking at what section 4 lists.

-- ---------- 1. One size group on the hot chocolates ----------
-- Only unlinks it from hot chocolates; other drinks keep Hot Drink Size.
with tove as (select id from menu_brands where name ilike '%tove%' limit 1),
hc as (
  select i.id from menu_items i
  join menu_categories c on c.id = i.category_id
  join menu_menus m on m.id = c.menu_id
  where m.brand_id = (select id from tove) and i.name ilike '%hot chocolate%'
),
g as (
  select id from menu_modifier_groups
  where brand_id = (select id from tove) and name = 'Hot Drink Size'
)
delete from menu_item_modifiers
where item_id in (select id from hc) and group_id in (select id from g);

-- Plain Hot Chocolate had only "Size", so nothing is left without one —
-- but make sure every hot chocolate actually has it.
with tove as (select id from menu_brands where name ilike '%tove%' limit 1),
hc as (
  select i.id from menu_items i
  join menu_categories c on c.id = i.category_id
  join menu_menus m on m.id = c.menu_id
  where m.brand_id = (select id from tove) and i.name ilike '%hot chocolate%'
),
sz as (select id from menu_modifier_groups where brand_id = (select id from tove) and name = 'Size' limit 1)
insert into menu_item_modifiers (item_id, group_id)
select h.id, (select id from sz) from hc h
where (select id from sz) is not null
  and not exists (select 1 from menu_item_modifiers e where e.item_id = h.id and e.group_id = (select id from sz));

-- ---------- 2. Whipped cream is free, and only in one place ----------
delete from menu_modifiers
where name ilike '%whipped cream%'
  and group_id in (
    select id from menu_modifier_groups
    where name = 'Enhance Your Drink'
      and brand_id = (select id from menu_brands where name ilike '%tove%' limit 1)
  );

-- ---------- 3. (after reviewing section 4) remove a duplicate item ----------
-- Prefer hiding to deleting: an item referenced by past orders should not
-- vanish from history. Set the id(s) once you have decided.
-- update menu_items set active = false where id in ('...');

-- ---------- 4. Possible duplicate items, by squashed name ----------
select lower(regexp_replace(i.name, '\s+', ' ', 'g')) as normalised,
       count(*) as copies,
       string_agg(i.name || '  [' || i.id || ']  ' || c.name, E'\n' order by i.name) as items
from menu_items i
join menu_categories c on c.id = i.category_id
join menu_menus m on m.id = c.menu_id
where m.brand_id = (select id from menu_brands where name ilike '%tove%' limit 1)
group by 1
having count(*) > 1
order by 1;
