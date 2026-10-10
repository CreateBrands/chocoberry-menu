-- Tove kiosk welcome: the carousel slides.
--
-- Each slide is a real menu item, matched on its exact name, using that item's
-- own photo and its own description. An item that isn't found, or has no
-- photo, drops out of the list rather than leaving a blank slide — so this is
-- safe to re-run after the menu changes.
--
-- Descriptions come from the menu rather than being written here: a kiosk
-- listing ingredients that don't match the item is an allergen problem. The
-- two "parts" chip rows below are the ones the design specified; the rest show
-- the item's own description instead.
--
-- Run section 1 first if you want to see what it will build.

-- ---------- 1. What will each slide show? ----------
with tove as (select id from menu_brands where name ilike '%tove%' limit 1),
items as (
  select i.name, i.image_url, i.description
  from menu_items i
  join menu_categories c on c.id = i.category_id
  join menu_menus m on m.id = c.menu_id
  where m.brand_id = (select id from tove)
),
want (ord, item_name, tone, tag, parts, pos) as (values
  (1, 'Iced Blueberry Marble Matcha', 'green', 'SIGNATURE MATCHA', 'Blueberry cold foam, Kyoto Uji ceremonial matcha, Choice of milk, Over ice', '50% 45%'),
  (2, 'Iced Cinnamon Roll Matcha',    'cream', 'SEASONAL DROP',    '',                                                                          '50% 40%'),
  (3, 'Flat White',                   'cream', 'COFFEE',           '',                                                                          '50% 40%'),
  (4, 'Cheese & Hot Honey Focaccia',  'tan',   'BAKED DAILY',      'Homemade red pesto, Creamy burrata, Sun-dried tomatoes, Hot honey',         '50% 40%'),
  (5, 'Classic Basque Cheesecake',    'cream', 'BASQUE CHEESECAKE','',                                                                          '50% 40%')
)
select w.ord, w.item_name, w.tag, w.tone,
       case when i.image_url is null then '— dropped: no item of that name with a photo —' else 'ok' end as status,
       coalesce(left(i.description, 80), '') as shows_as_subtitle
from want w
left join lateral (
  select im.image_url, im.description from items im
  where im.name = w.item_name and coalesce(im.image_url, '') <> '' limit 1
) i on true
order by w.ord;

-- ---------- 2. Build them ----------
with tove as (select id from menu_brands where name ilike '%tove%' limit 1),
items as (
  select i.name, i.image_url, i.description
  from menu_items i
  join menu_categories c on c.id = i.category_id
  join menu_menus m on m.id = c.menu_id
  where m.brand_id = (select id from tove)
),
want (ord, item_name, tone, tag, parts, pos) as (values
  (1, 'Iced Blueberry Marble Matcha', 'green', 'SIGNATURE MATCHA', 'Blueberry cold foam, Kyoto Uji ceremonial matcha, Choice of milk, Over ice', '50% 45%'),
  (2, 'Iced Cinnamon Roll Matcha',    'cream', 'SEASONAL DROP',    '',                                                                          '50% 40%'),
  (3, 'Flat White',                   'cream', 'COFFEE',           '',                                                                          '50% 40%'),
  (4, 'Cheese & Hot Honey Focaccia',  'tan',   'BAKED DAILY',      'Homemade red pesto, Creamy burrata, Sun-dried tomatoes, Hot honey',         '50% 40%'),
  (5, 'Classic Basque Cheesecake',    'cream', 'BASQUE CHEESECAKE','',                                                                          '50% 40%')
),
slide_rows as (
  select w.ord, jsonb_build_object(
    'image_url', i.image_url,
    'pos',       w.pos,
    'tone',      w.tone,
    'tag',       w.tag,
    'title',     w.item_name,
    'sub',       coalesce(left(i.description, 110), ''),
    'parts',     w.parts
  ) as slide
  from want w
  join lateral (
    select im.image_url, im.description from items im
    where im.name = w.item_name and coalesce(im.image_url, '') <> '' limit 1
  ) i on true
),
built as (select jsonb_agg(slide order by ord) as j from slide_rows)
insert into menu_app_settings (key, value)
select 'kiosk_slides:be8de364-ff8f-5ce5-9d6f-fadbb5676e5d', j::text
from built where j is not null
on conflict (key) do update set value = excluded.value;

-- Footer line off: the kiosk stands in the shop, so nobody there needs the
-- address. Put one back in Admin and the line reappears.
insert into menu_app_settings (key, value) values
  ('kiosk_address:be8de364-ff8f-5ce5-9d6f-fadbb5676e5d', '')
on conflict (key) do update set value = excluded.value;

-- ---------- 3. Edge to edge ----------
-- kiosk_inset_top was set while the Android status bar was swallowing taps on
-- the top row of buttons. The kiosk runs in lock-task mode now, with no bars
-- to avoid, so a stored inset is just an empty band across a full-bleed
-- screen. The app no longer insets anything unless a value says to, and this
-- removes the values. (If a status bar ever reappears and eats the buttons,
-- put a number back in Admin under the store's kiosk settings.)
select key, value as was_set_to
from menu_app_settings
where key like 'kiosk_inset_%';

delete from menu_app_settings where key like 'kiosk_inset_%';

-- ---------- 4. Check ----------
select jsonb_array_length(value::jsonb) as slides,
       (select string_agg(s->>'title', ' · ') from jsonb_array_elements(value::jsonb) s) as titles
from menu_app_settings
where key = 'kiosk_slides:be8de364-ff8f-5ce5-9d6f-fadbb5676e5d';

notify pgrst, 'reload schema';
