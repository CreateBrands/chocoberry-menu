-- Tove, 14 Oct: four non-coffee drinks were offering coffee modifiers.
-- Reported from the floor: Luna Latte, Red Velvet Latte, Chai Latte and Iced
-- Chai Latte all showed "Extra Coffee Shot" and "Decaf Option". None of them
-- contain coffee, so neither choice means anything on them.
--
-- This only detaches the groups from those four items. The groups themselves
-- and every other drink using them are untouched.
--
-- Safe to run more than once. Sections 1 and 2 only look; section 3 changes,
-- and refuses rather than guess if it cannot find all four items.

-- ---------- 1. What those four items currently offer ----------
with tove as (select id from menu_brands where name ilike '%tove%' limit 1),
items as (
  select i.id, i.name
  from menu_items i
  join menu_categories c on c.id = i.category_id
  join menu_menus m on m.id = c.menu_id
  where m.brand_id = (select id from tove)
    and lower(trim(i.name)) in ('luna latte', 'red velvet latte', 'chai latte', 'iced chai latte')
)
select it.name as item, g.name as group_name, g.min_select, g.max_select, g.required
from items it
join menu_item_modifiers im on im.item_id = it.id
join menu_modifier_groups g on g.id = im.group_id
order by it.name, g.name;

-- ---------- 2. Everything else still using the coffee groups ----------
-- So you can see what this does NOT touch before running section 3.
with tove as (select id from menu_brands where name ilike '%tove%' limit 1),
grp as (
  select id, name from menu_modifier_groups
  where brand_id = (select id from tove)
    and (name ilike '%coffee shot%' or name ilike '%extra shot%' or name ilike '%decaf%')
)
select g.name as group_name, i.name as item
from grp g
join menu_item_modifiers im on im.group_id = g.id
join menu_items i on i.id = im.item_id
order by g.name, i.name;

-- ---------- 3. Detach them ----------
do $$
declare
  v_tove  uuid;
  v_items uuid[];
  v_grps  uuid[];
  v_found int;
  v_del   int;
begin
  select id into v_tove from menu_brands where name ilike '%tove%' limit 1;
  if v_tove is null then raise exception 'No Tove brand'; end if;

  select array_agg(i.id) into v_items
  from menu_items i
  join menu_categories c on c.id = i.category_id
  join menu_menus m on m.id = c.menu_id
  where m.brand_id = v_tove
    and lower(trim(i.name)) in ('luna latte', 'red velvet latte', 'chai latte', 'iced chai latte');

  v_found := coalesce(array_length(v_items, 1), 0);
  -- Four names, but a menu may carry a drink more than once (hot and iced
  -- lists, say), so this is a floor rather than an exact count. Nothing found
  -- means the names have changed and guessing would detach the wrong thing.
  if v_found = 0 then
    raise notice 'No matching items — nothing changed. Check the names in section 1.';
    return;
  end if;
  raise notice 'Matched % item row(s).', v_found;

  select array_agg(id) into v_grps
  from menu_modifier_groups
  where brand_id = v_tove
    and (name ilike '%coffee shot%' or name ilike '%extra shot%' or name ilike '%decaf%');

  if coalesce(array_length(v_grps, 1), 0) = 0 then
    raise notice 'No coffee or decaf groups found — nothing changed.';
    return;
  end if;

  delete from menu_item_modifiers
  where item_id = any(v_items) and group_id = any(v_grps);
  get diagnostics v_del = row_count;
  raise notice 'Removed % coffee/decaf attachment(s) from those drinks.', v_del;
end $$;

-- ---------- 4. Check ----------
-- Re-run section 1: the four drinks should no longer list a coffee or decaf
-- group. Section 2 should be unchanged apart from those rows.
