-- Tove kiosk welcome: the carousel slides and the footer line.
--
-- The photos come from the Tove menu items themselves, so the kiosk shows the
-- same pictures the menu does and nothing has to be uploaded twice. Any slide
-- whose item has no photo still works — it falls back to its backdrop colour.
--
-- Section 1 reports what it will find. Run it on its own first if you want to
-- see which items have a photo before changing anything.

-- ---------- 1. What photo does each slide's item have? ----------
with tove as (select id from menu_brands where name ilike '%tove%' limit 1),
items as (
  select i.name, i.image_url
  from menu_items i
  join menu_categories c on c.id = i.category_id
  join menu_menus m on m.id = c.menu_id
  where m.brand_id = (select id from tove)
)
select want.slide, want.match as item_pattern,
       coalesce((select i.name from items i where i.name ilike want.match and i.image_url is not null and i.image_url <> '' limit 1), '— no item with a photo —') as found,
       coalesce((select i.image_url from items i where i.name ilike want.match and i.image_url is not null and i.image_url <> '' limit 1), '') as photo
from (values
  (1, '%blueberry%matcha%'),
  (2, '%signature blend%'),
  (3, '%vanilla oat matcha%'),
  (4, '%focaccia%')
) as want(slide, match)
order by want.slide;

-- ---------- 2. Build the slides ----------
do $$
declare
  v_loc  text := 'be8de364-ff8f-5ce5-9d6f-fadbb5676e5d';   -- Tove, 183 Evington Rd
  v_tove uuid;
  v_json jsonb;

  -- The one photo recovered from the design, shipped with the app. Used only
  -- where the menu item has no picture of its own.
  c_fallback text := '/tove/blueberry-marble-matcha.jpg';

  -- Each slide's photo, looked up from the menu item by name.
  v_matcha   text;
  v_coffee   text;
  v_hotlatte text;
  v_focaccia text;
begin
  select id into v_tove from menu_brands where name ilike '%tove%' limit 1;
  if v_tove is null then raise exception 'No Tove brand found'; end if;

  select i.image_url into v_matcha from menu_items i
    join menu_categories c on c.id = i.category_id join menu_menus m on m.id = c.menu_id
    where m.brand_id = v_tove and i.name ilike '%blueberry%matcha%' and coalesce(i.image_url,'') <> '' limit 1;
  select i.image_url into v_coffee from menu_items i
    join menu_categories c on c.id = i.category_id join menu_menus m on m.id = c.menu_id
    where m.brand_id = v_tove and i.name ilike '%signature blend%' and coalesce(i.image_url,'') <> '' limit 1;
  select i.image_url into v_hotlatte from menu_items i
    join menu_categories c on c.id = i.category_id join menu_menus m on m.id = c.menu_id
    where m.brand_id = v_tove and i.name ilike '%vanilla oat matcha%' and coalesce(i.image_url,'') <> '' limit 1;
  select i.image_url into v_focaccia from menu_items i
    join menu_categories c on c.id = i.category_id join menu_menus m on m.id = c.menu_id
    where m.brand_id = v_tove and i.name ilike '%focaccia%' and coalesce(i.image_url,'') <> '' limit 1;

  v_json := jsonb_build_array(
    jsonb_build_object(
      'image_url', coalesce(v_matcha, c_fallback),
      'pos', '50% 45%',        -- crop: keep the cup centred, hand at the top
      'tone', 'green',
      'tag', 'SIGNATURE MATCHA',
      'title', 'Iced Blueberry Marble Matcha',
      'sub', 'Fresh. Layered. Unexpected.',
      'parts', 'Blueberry cold foam, Kyoto Uji ceremonial matcha, Choice of milk, Over ice'
    ),
    jsonb_build_object(
      'image_url', coalesce(v_coffee, ''),
      'tone', 'cream',
      'tag', 'COFFEE',
      'title', 'Signature Blend',
      'sub', 'Roasted for milk, good black.',
      'parts', 'South America & Asia, Medium roast, 100% Arabica, Caramel & milk chocolate'
    ),
    jsonb_build_object(
      'image_url', coalesce(v_hotlatte, ''),
      'tone', 'cream',
      'tag', 'HOT MATCHA',
      'title', 'Vanilla Oat Matcha Latte',
      'sub', 'Warm, grassy, gently sweet.',
      'parts', 'Kyoto Uji ceremonial grade, Steamed oat milk, Sweet vanilla'
    ),
    jsonb_build_object(
      'image_url', coalesce(v_focaccia, ''),
      'tone', 'tan',
      'tag', 'BAKED DAILY',
      'title', 'Cheese & Hot Honey Focaccia',
      'sub', 'Out of the oven every morning.',
      'parts', 'Homemade red pesto, Creamy burrata, Sun-dried tomatoes, Hot honey'
    )
  );

  -- kiosk_slides, not hero_slides: the kiosk carousel and the banner at the top
  -- of the tablet menu are different surfaces and shouldn't move together.
  insert into menu_app_settings (key, value) values
    ('kiosk_slides:' || v_loc, v_json::text),
    ('kiosk_address:' || v_loc, '183 Evington Road, Leicester · Open daily 8am–11pm')
  on conflict (key) do update set value = excluded.value;
end $$;

-- ---------- 3. Check ----------
select key, left(value, 240) as value
from menu_app_settings
where key in (
  'kiosk_slides:be8de364-ff8f-5ce5-9d6f-fadbb5676e5d',
  'kiosk_address:be8de364-ff8f-5ce5-9d6f-fadbb5676e5d',
  'welcome_logo_url:be8de364-ff8f-5ce5-9d6f-fadbb5676e5d'
)
order by key;

notify pgrst, 'reload schema';
