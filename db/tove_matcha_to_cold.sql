-- Signature Matchas sits under HOT DRINKS but is mostly iced drinks.
-- Move the category to the top of COLD DRINKS.
--
-- NOTE: the whole category moves, which takes "Vanilla Oat Matcha Latte -
-- Hot" with it. If that one should stay in hot drinks, move it back on its
-- own afterwards — the commented statement at the bottom does that.
do $$
declare
  v_brand uuid;
  v_cold  uuid;
  v_cat   uuid := 'db127664-57b7-5141-8e75-0a6ce2dbff84';  -- Signature Matchas
begin
  select id into v_brand from menu_brands where name ilike '%tove%' limit 1;
  select id into v_cold from menu_menus where brand_id = v_brand and name = 'COLD DRINKS' limit 1;
  if v_cold is null then raise exception 'No COLD DRINKS menu for Tove'; end if;

  -- Make room at the top.
  update menu_categories set sort_order = sort_order + 1 where menu_id = v_cold;
  -- Move it and put it first.
  update menu_categories set menu_id = v_cold, sort_order = 0 where id = v_cat;
end $$;

-- Check
select m.name as menu, c.name as category, c.sort_order
from menu_categories c join menu_menus m on m.id = c.menu_id
where m.brand_id = (select id from menu_brands where name ilike '%tove%' limit 1)
  and m.name in ('HOT DRINKS', 'COLD DRINKS')
order by m.sort_order, c.sort_order;

-- If the hot matcha latte should stay in hot drinks, give it a home there:
-- update menu_items set category_id = '0970707e-aa6f-5fc3-8832-141c74f63ced'  -- Speciality Lattes Hot
--  where id = '7c7ebcb0-61cb-5297-9a8e-709cbf33965a';                          -- Vanilla Oat Matcha Latte - Hot

notify pgrst, 'reload schema';
