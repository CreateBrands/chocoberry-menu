-- Dubai + Sharjah tablet menus, seeded from the apetito export (15 Oct).
--
-- Source: the window["sharedData"] payload in the saved menu page — the
-- customer-facing menu the Dubai stores already publish. AED, with Arabic
-- for every category, item and description.
--
-- Run db/dubai_menu_setup.sql FIRST (it creates the two stores).
--
-- Idempotent by construction: menus, categories and items are each looked up
-- by a stable apetito id kept in pos_menu_id / pos_name / pos_id, then
-- inserted or updated. Re-run after a price or translation changes in
-- apetito and it brings those across without duplicating anything.
--
-- Touches no UK brand, menu, category or item.

do $$
declare
  v_brand uuid;
  v_menu  uuid;
  v_cat   uuid;
  v_item  uuid;
begin
  select id into v_brand from menu_brands where lower(name) = 'chocoberry uae' limit 1;
  if v_brand is null then
    insert into menu_brands (name, theme_key, accent_color)
    select 'Chocoberry UAE', coalesce(theme_key, 'chocoberry'), accent_color
    from menu_brands where lower(name) like '%chocoberry%' order by created_at limit 1;
    if not found then
      insert into menu_brands (name, theme_key) values ('Chocoberry UAE', 'chocoberry');
    end if;
    select id into v_brand from menu_brands where lower(name) = 'chocoberry uae' limit 1;
    raise notice 'Created brand Chocoberry UAE = %', v_brand;
  end if;


  -- ===== Dubai Menu =====
  select id into v_menu from menu_menus where brand_id = v_brand and pos_menu_id = 'apetito:77461' limit 1;
  if v_menu is null then
    insert into menu_menus (brand_id, name, pos_menu_id, sort_order) values (v_brand, 'Dubai Menu', 'apetito:77461', 10) returning id into v_menu;
  else
    update menu_menus set name = 'Dubai Menu', sort_order = 10 where id = v_menu;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97321' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'PASTRIES', 'المعجنات', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/812cae2d-dc3b-47aa-8848-da56551b6870/conversions/compressed-chocoberry-013-small.jpg', 10, 'kitchen', 'apetito:97321') returning id into v_cat;
  else
    update menu_categories set name = 'PASTRIES', name_ar = 'المعجنات', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/812cae2d-dc3b-47aa-8848-da56551b6870/conversions/compressed-chocoberry-013-small.jpg', sort_order = 10, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249993' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Vanilla Meringue', 'مرنغ الفانيليا', 'vanilla sponge, vanilla chantilly burnt meringue', 'كيكة إسفنجية بالفانيليا، كريمة شانتيلي بالفانيليا، مرينغ محروق', 43, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e3a59207-fefe-45b5-8173-3cf31f6b7755/conversions/compressed-chocoberry-103-optimized.jpg', '{}'::text[], 10, 'apetito:249993', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Vanilla Meringue', name_ar = 'مرنغ الفانيليا', description = 'vanilla sponge, vanilla chantilly burnt meringue', description_ar = 'كيكة إسفنجية بالفانيليا، كريمة شانتيلي بالفانيليا، مرينغ محروق',
      price = 43, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e3a59207-fefe-45b5-8173-3cf31f6b7755/conversions/compressed-chocoberry-103-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249994' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'San Sebastian', 'سان سيباستيان', 'vanilla cream cheese, mix berries', 'جبنة كريمية بالفانيليا، مزيج من التوت', 47, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d0175e14-0b07-4ed3-a0db-85eeef736c4e/conversions/compressed-chocoberry-117-optimized.jpg', '{}'::text[], 20, 'apetito:249994', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'San Sebastian', name_ar = 'سان سيباستيان', description = 'vanilla cream cheese, mix berries', description_ar = 'جبنة كريمية بالفانيليا، مزيج من التوت',
      price = 47, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d0175e14-0b07-4ed3-a0db-85eeef736c4e/conversions/compressed-chocoberry-117-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249996' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Moka Cake', 'كعكة موكا', 'coffee sponge, coffee cream, caramel', 'كيكة إسفنجية بالقهوة، كريمة قهوة، كراميل', 38, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/6c2c48f4-dacd-4563-9a13-7901a68fd432/conversions/compressed-chocoberry-109-optimized.jpg', '{}'::text[], 30, 'apetito:249996', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Moka Cake', name_ar = 'كعكة موكا', description = 'coffee sponge, coffee cream, caramel', description_ar = 'كيكة إسفنجية بالقهوة، كريمة قهوة، كراميل',
      price = 38, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/6c2c48f4-dacd-4563-9a13-7901a68fd432/conversions/compressed-chocoberry-109-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249998' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chocolate Fudge Cake', 'كعكة فادج الشوكولاتة', 'Chocolate sponge, dark chocolate ganache, caramel', 'كيكة إسفنجية بالشوكولاتة، غاناش الشوكولاتة الداكنة، كراميل', 49, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/76afe1b5-ab58-4a35-942b-62a828d74a07/conversions/compressed-untitled-14-optimized.jpg', '{}'::text[], 40, 'apetito:249998', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chocolate Fudge Cake', name_ar = 'كعكة فادج الشوكولاتة', description = 'Chocolate sponge, dark chocolate ganache, caramel', description_ar = 'كيكة إسفنجية بالشوكولاتة، غاناش الشوكولاتة الداكنة، كراميل',
      price = 49, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/76afe1b5-ab58-4a35-942b-62a828d74a07/conversions/compressed-untitled-14-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249999' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Carrot Cake', 'كعكة الجزر', 'carrot & cinnamon sponge, cream cheese frosting', 'كيكة إسفنجية بالجزر والقرفة، مغطاة بكريمة الجبن', 39, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/0d8d19ea-46a7-46e0-9002-2076cbeee7d4/conversions/compressed-untitled-32-optimized.jpg', '{}'::text[], 50, 'apetito:249999', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Carrot Cake', name_ar = 'كعكة الجزر', description = 'carrot & cinnamon sponge, cream cheese frosting', description_ar = 'كيكة إسفنجية بالجزر والقرفة، مغطاة بكريمة الجبن',
      price = 39, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/0d8d19ea-46a7-46e0-9002-2076cbeee7d4/conversions/compressed-untitled-32-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249982' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'London Viral Cake', 'كعكة لندن الفيروسية', null, null, 49, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/a8a06875-b369-4ac0-acf3-2acd7b6a02f7/conversions/compressed-dsc9101-optimized.jpg', '{}'::text[], 60, 'apetito:249982', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'London Viral Cake', name_ar = 'كعكة لندن الفيروسية', description = null, description_ar = null,
      price = 49, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/a8a06875-b369-4ac0-acf3-2acd7b6a02f7/conversions/compressed-dsc9101-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250001' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Amalfi Lemon', 'ليمون أمالفي', 'lemon mousse, candied yuzu, white chocolate', 'موس الليمون، يوزو مسكر، شوكولاتة بيضاء', 36, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/a5ce98ab-5ff8-4bf6-95a9-9dcd924e74d6/conversions/compressed-chocoberry-021-optimized.jpg', '{}'::text[], 70, 'apetito:250001', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Amalfi Lemon', name_ar = 'ليمون أمالفي', description = 'lemon mousse, candied yuzu, white chocolate', description_ar = 'موس الليمون، يوزو مسكر، شوكولاتة بيضاء',
      price = 36, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/a5ce98ab-5ff8-4bf6-95a9-9dcd924e74d6/conversions/compressed-chocoberry-021-optimized.jpg', tags = '{}'::text[], sort_order = 70, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250002' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Pavlova', 'بافلوفا', 'French meringue, mascarpone vanilla cream, red berries', 'مرينغ فرنسي، كريمة فانيليا ماسكاربوني، توت أحمر', 40, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f81e4a3c-8b33-4e1f-9172-f27a1ecf338b/conversions/compressed-chocoberry-013-optimized.jpg', '{}'::text[], 80, 'apetito:250002', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Pavlova', name_ar = 'بافلوفا', description = 'French meringue, mascarpone vanilla cream, red berries', description_ar = 'مرينغ فرنسي، كريمة فانيليا ماسكاربوني، توت أحمر',
      price = 40, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f81e4a3c-8b33-4e1f-9172-f27a1ecf338b/conversions/compressed-chocoberry-013-optimized.jpg', tags = '{}'::text[], sort_order = 80, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250003' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Mango passion', 'شغف المانجو', 'mango sponge, passion fruit curd, mango insert', 'كيكة المانجو الإسفنجية، كريمة فاكهة الباشن، حشوة المانجو', 43, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/dba34d22-d38b-4463-9e33-4ca4eca109b6/conversions/compressed-chocoberry-025-optimized.jpg', '{}'::text[], 90, 'apetito:250003', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Mango passion', name_ar = 'شغف المانجو', description = 'mango sponge, passion fruit curd, mango insert', description_ar = 'كيكة المانجو الإسفنجية، كريمة فاكهة الباشن، حشوة المانجو',
      price = 43, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/dba34d22-d38b-4463-9e33-4ca4eca109b6/conversions/compressed-chocoberry-025-optimized.jpg', tags = '{}'::text[], sort_order = 90, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250004' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Calamansi Tart', 'تارت كالامانسي', 'almond frangipane, kalamansi curd, Italian meringue', 'فرانجيبان اللوز، خثارة كالامانسي، مرنغ إيطالي', 36, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/30549efe-fafc-47c0-9a02-5d991d3ad9be/conversions/compressed-chocoberry-028-optimized.jpg', '{}'::text[], 100, 'apetito:250004', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Calamansi Tart', name_ar = 'تارت كالامانسي', description = 'almond frangipane, kalamansi curd, Italian meringue', description_ar = 'فرانجيبان اللوز، خثارة كالامانسي، مرنغ إيطالي',
      price = 36, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/30549efe-fafc-47c0-9a02-5d991d3ad9be/conversions/compressed-chocoberry-028-optimized.jpg', tags = '{}'::text[], sort_order = 100, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250005' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Coconut Rice Pudding', 'بودنغ الأرز بجوز الهند', 'coconut rice pudding, vanilla strawberry gel, fresh strawberry', 'بودنغ أرز بجوز الهند، جيلي الفراولة بالفانيليا، فراولة طازجة', 43, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5a355968-a18e-416f-8b40-39b5b02b2099/conversions/compressed-chocoberry-032-optimized.jpg', '{}'::text[], 110, 'apetito:250005', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Coconut Rice Pudding', name_ar = 'بودنغ الأرز بجوز الهند', description = 'coconut rice pudding, vanilla strawberry gel, fresh strawberry', description_ar = 'بودنغ أرز بجوز الهند، جيلي الفراولة بالفانيليا، فراولة طازجة',
      price = 43, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5a355968-a18e-416f-8b40-39b5b02b2099/conversions/compressed-chocoberry-032-optimized.jpg', tags = '{}'::text[], sort_order = 110, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250006' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Pistachio & Rose', 'الفستق والورد', 'Sicilian pistachio mousse, rose gel, vanilla cream', 'موس الفستق الصقلي، جل الورد، كريمة الفانيليا', 36, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9c6b82ee-4133-4ab2-9976-462ff9571de5/conversions/compressed-chocoberry-053-optimized.jpg', '{}'::text[], 120, 'apetito:250006', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Pistachio & Rose', name_ar = 'الفستق والورد', description = 'Sicilian pistachio mousse, rose gel, vanilla cream', description_ar = 'موس الفستق الصقلي، جل الورد، كريمة الفانيليا',
      price = 36, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9c6b82ee-4133-4ab2-9976-462ff9571de5/conversions/compressed-chocoberry-053-optimized.jpg', tags = '{}'::text[], sort_order = 120, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250007' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, '100% Pistachio', 'فستق 100%', 'pistachio mousse, pistachio praline insert, crunchy pistachio shell', 'موس الفستق، حشوة برالين الفستق، قشرة الفستق المقرمشة', 45, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/85bbaf3a-c498-4f59-bfe5-6bd856414877/conversions/compressed-chocoberry-016-optimized.jpg', '{}'::text[], 130, 'apetito:250007', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = '100% Pistachio', name_ar = 'فستق 100%', description = 'pistachio mousse, pistachio praline insert, crunchy pistachio shell', description_ar = 'موس الفستق، حشوة برالين الفستق، قشرة الفستق المقرمشة',
      price = 45, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/85bbaf3a-c498-4f59-bfe5-6bd856414877/conversions/compressed-chocoberry-016-optimized.jpg', tags = '{}'::text[], sort_order = 130, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250009' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Madagascar Vanilla Flower', 'زهرة الفانيليا المدغشقرية', 'vanilla panna cotta, vanilla mascarpone chantilly, vanilla curd', 'بانا كوتا بالفانيليا، شانتيلي ماسكاربوني بالفانيليا، كريمة الفانيليا', 45, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/0113c36c-6763-453d-9615-7c78b42abede/conversions/compressed-chocoberry-037-optimized.jpg', '{}'::text[], 140, 'apetito:250009', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Madagascar Vanilla Flower', name_ar = 'زهرة الفانيليا المدغشقرية', description = 'vanilla panna cotta, vanilla mascarpone chantilly, vanilla curd', description_ar = 'بانا كوتا بالفانيليا، شانتيلي ماسكاربوني بالفانيليا، كريمة الفانيليا',
      price = 45, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/0113c36c-6763-453d-9615-7c78b42abede/conversions/compressed-chocoberry-037-optimized.jpg', tags = '{}'::text[], sort_order = 140, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:258835' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Caviar Tiramisu', 'تيراميسو الكافيار', null, null, 50, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/74d8e977-e214-4f8f-bc71-d94f63393fd1/conversions/compressed-tiramisu-caviar-optimized.jpg', '{}'::text[], 150, 'apetito:258835', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Caviar Tiramisu', name_ar = 'تيراميسو الكافيار', description = null, description_ar = null,
      price = 50, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/74d8e977-e214-4f8f-bc71-d94f63393fd1/conversions/compressed-tiramisu-caviar-optimized.jpg', tags = '{}'::text[], sort_order = 150, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250010' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Classic Tiramisu', 'تيراميسو كلاسيكي', 'lady fingers coffee soaked biscuit, mascarpone cream, cocoa powder', 'بسكويت ليدي فينجرز منقوع في القهوة، كريمة ماسكاربوني، مسحوق الكاكاو', 45, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/7b3135dc-5018-4d9c-898e-5f0f1af03f79/conversions/compressed-tiramisu-optimized.jpg', '{}'::text[], 160, 'apetito:250010', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Classic Tiramisu', name_ar = 'تيراميسو كلاسيكي', description = 'lady fingers coffee soaked biscuit, mascarpone cream, cocoa powder', description_ar = 'بسكويت ليدي فينجرز منقوع في القهوة، كريمة ماسكاربوني، مسحوق الكاكاو',
      price = 45, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/7b3135dc-5018-4d9c-898e-5f0f1af03f79/conversions/compressed-tiramisu-optimized.jpg', tags = '{}'::text[], sort_order = 160, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250011' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Saffron Tres Leche', 'زعفران تريس ليتش', 'vanilla sponge, whipped cream, milk saffron sauce', 'كيكة إسفنجية بالفانيليا، كريمة مخفوقة، صلصة حليب بالزعفران', 45, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/accfd7f8-6e61-42ee-afa3-aa073ffe1744/conversions/compressed-saffron-milk-cake-optimized.jpg', '{}'::text[], 170, 'apetito:250011', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Saffron Tres Leche', name_ar = 'زعفران تريس ليتش', description = 'vanilla sponge, whipped cream, milk saffron sauce', description_ar = 'كيكة إسفنجية بالفانيليا، كريمة مخفوقة، صلصة حليب بالزعفران',
      price = 45, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/accfd7f8-6e61-42ee-afa3-aa073ffe1744/conversions/compressed-saffron-milk-cake-optimized.jpg', tags = '{}'::text[], sort_order = 170, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250140' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Pistachio Tres Leches', 'فستق تريس ليتشيس', 'Soft pistachio sponge soaked in three types of pistachio milks & topped with pistachio cream.', 'كعكة إسفنجية ناعمة بالفستق منقوعة في ثلاثة أنواع من حليب الفستق ومغطاة بكريمة الفستق.', 45, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/fc67bb22-5c6d-4d31-9b65-c3fc6387f60e/conversions/compressed-pistachio-milk-cake-optimized.jpg', '{}'::text[], 180, 'apetito:250140', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Pistachio Tres Leches', name_ar = 'فستق تريس ليتشيس', description = 'Soft pistachio sponge soaked in three types of pistachio milks & topped with pistachio cream.', description_ar = 'كعكة إسفنجية ناعمة بالفستق منقوعة في ثلاثة أنواع من حليب الفستق ومغطاة بكريمة الفستق.',
      price = 45, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/fc67bb22-5c6d-4d31-9b65-c3fc6387f60e/conversions/compressed-pistachio-milk-cake-optimized.jpg', tags = '{}'::text[], sort_order = 180, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250012' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Lava Cake', 'كعكة الحمم البركانية', 'Warm molten chocolate cake served with gelato.', 'كعكة الشوكولاتة الساخنة المذابة تقدم مع الآيس كريم.', 55, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d8fe492e-ab45-494c-8e8b-9ad5a48f185c/conversions/compressed-chocoberry-085-optimized.jpg', '{}'::text[], 190, 'apetito:250012', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Lava Cake', name_ar = 'كعكة الحمم البركانية', description = 'Warm molten chocolate cake served with gelato.', description_ar = 'كعكة الشوكولاتة الساخنة المذابة تقدم مع الآيس كريم.',
      price = 55, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d8fe492e-ab45-494c-8e8b-9ad5a48f185c/conversions/compressed-chocoberry-085-optimized.jpg', tags = '{}'::text[], sort_order = 190, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250013' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Fresh Indulgence Crepe', 'كريب فاخر طازج', null, null, 49, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3c44e06f-baa1-4f92-a5f0-27abbc659821/conversions/compressed-create-this-image-same-good-202608051509-optimized.jpg', '{}'::text[], 200, 'apetito:250013', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Fresh Indulgence Crepe', name_ar = 'كريب فاخر طازج', description = null, description_ar = null,
      price = 49, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3c44e06f-baa1-4f92-a5f0-27abbc659821/conversions/compressed-create-this-image-same-good-202608051509-optimized.jpg', tags = '{}'::text[], sort_order = 200, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250150' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Banoffee Crepe', 'كريب بانوفي', null, null, 45, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ad4608f8-2952-4b4f-9c66-57d7d9f596b5/conversions/5dbac196dc3157ec14351159313b555e-optimized.jpg', '{}'::text[], 210, 'apetito:250150', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Banoffee Crepe', name_ar = 'كريب بانوفي', description = null, description_ar = null,
      price = 45, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ad4608f8-2952-4b4f-9c66-57d7d9f596b5/conversions/5dbac196dc3157ec14351159313b555e-optimized.jpg', tags = '{}'::text[], sort_order = 210, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250014' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Strawberry Crepe', 'كريب الفراولة', 'Sweet strawberries with passion fruit drizzle in a warm crêpe.', 'فراولة حلوة مع رذاذ فاكهة الباشن فروت في كريب دافئ.', 45, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/cb05539d-e99a-4934-bc32-bc9d8bbcd5f8/conversions/compressed-create-this-image-same-good-202608051331-optimized.jpg', '{}'::text[], 220, 'apetito:250014', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Strawberry Crepe', name_ar = 'كريب الفراولة', description = 'Sweet strawberries with passion fruit drizzle in a warm crêpe.', description_ar = 'فراولة حلوة مع رذاذ فاكهة الباشن فروت في كريب دافئ.',
      price = 45, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/cb05539d-e99a-4934-bc32-bc9d8bbcd5f8/conversions/compressed-create-this-image-same-good-202608051331-optimized.jpg', tags = '{}'::text[], sort_order = 220, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97322' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'ALL DAY BREAKFAST', 'وجبة إفطار طوال اليوم', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/8b2886ed-038e-4e61-a1a8-8ececc52298d/conversions/blob-small.jpg', 20, 'kitchen', 'apetito:97322') returning id into v_cat;
  else
    update menu_categories set name = 'ALL DAY BREAKFAST', name_ar = 'وجبة إفطار طوال اليوم', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/8b2886ed-038e-4e61-a1a8-8ececc52298d/conversions/blob-small.jpg', sort_order = 20, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250016' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Big Bang', 'الانفجار العظيم', 'Scrambled eggs served with crispy hash brown, baked beans, grilled halloumi, French toast with honey jar, roasted tomatoes & fresh berries', 'بيض مخفوق يقدم مع بطاطس مقلية مقرمشة، فاصوليا مطبوخة، جبنة حلومي مشوية، خبز محمص فرنسي مع جرة عسل، طماطم مشوية وتوت طازج', 73, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c188e523-d89f-4547-ba3f-ed0c50b78f81/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:250016', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Big Bang', name_ar = 'الانفجار العظيم', description = 'Scrambled eggs served with crispy hash brown, baked beans, grilled halloumi, French toast with honey jar, roasted tomatoes & fresh berries', description_ar = 'بيض مخفوق يقدم مع بطاطس مقلية مقرمشة، فاصوليا مطبوخة، جبنة حلومي مشوية، خبز محمص فرنسي مع جرة عسل، طماطم مشوية وتوت طازج',
      price = 73, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c188e523-d89f-4547-ba3f-ed0c50b78f81/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250017' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Classic English Breakfast', 'فطور إنجليزي كلاسيكي', 'Traditional English spread of eggs, sausages, bacon, baked beans, crispy hash brown, grilled vine tomatoes, mushrooms and green leaves', 'طبق إنجليزي تقليدي من البيض والنقانق ولحم الخنزير المقدد والفاصوليا المخبوزة والبطاطس المقلية المقرمشة والطماطم المشوية والفطر والأوراق الخضراء', 69, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/656fb97c-5b7a-40c7-b3dc-3c5781208b99/conversions/blob-optimized.jpg', array['Bestseller']::text[], 20, 'apetito:250017', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Classic English Breakfast', name_ar = 'فطور إنجليزي كلاسيكي', description = 'Traditional English spread of eggs, sausages, bacon, baked beans, crispy hash brown, grilled vine tomatoes, mushrooms and green leaves', description_ar = 'طبق إنجليزي تقليدي من البيض والنقانق ولحم الخنزير المقدد والفاصوليا المخبوزة والبطاطس المقلية المقرمشة والطماطم المشوية والفطر والأوراق الخضراء',
      price = 69, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/656fb97c-5b7a-40c7-b3dc-3c5781208b99/conversions/blob-optimized.jpg', tags = array['Bestseller']::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250018' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'The Mediterranean', 'البحر الأبيض المتوسط', 'A vibrant platter of soft scrambled eggs, avocado wedges, crispy falafel, feta, hummus, flyover yogurt, olives, cucumber, fresh orange slices & warm pita bread', 'طبق نابض بالحياة من البيض المخفوق الناعم، وشرائح الأفوكادو، والفلافل المقرمشة، والجبن الفيتا، والحمص، والزبادي، والزيتون، والخيار، وشرائح البرتقال الطازجة، وخبز البيتا الدافئ.', 67, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/06a515ef-53b5-4a45-a47b-0dbcf755171b/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:250018', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'The Mediterranean', name_ar = 'البحر الأبيض المتوسط', description = 'A vibrant platter of soft scrambled eggs, avocado wedges, crispy falafel, feta, hummus, flyover yogurt, olives, cucumber, fresh orange slices & warm pita bread', description_ar = 'طبق نابض بالحياة من البيض المخفوق الناعم، وشرائح الأفوكادو، والفلافل المقرمشة، والجبن الفيتا، والحمص، والزبادي، والزيتون، والخيار، وشرائح البرتقال الطازجة، وخبز البيتا الدافئ.',
      price = 67, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/06a515ef-53b5-4a45-a47b-0dbcf755171b/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250020' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Shakshuka', 'شكشوكة', 'A flavourful skillet of spicy tomato sauce topped with perfectly poached eggs, marinated feta, a hint of sweet chili, served with a warm breadbasket.', 'مقلاة لذيذة من صلصة الطماطم الحارة مغطاة بالبيض المسلوق بشكل مثالي، والجبن الفيتا المتبل، وقليل من الفلفل الحلو، وتقدم مع سلة خبز دافئة.', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/7e43a4ca-649e-4ae5-8c1f-2538ffb52640/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:250020', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Shakshuka', name_ar = 'شكشوكة', description = 'A flavourful skillet of spicy tomato sauce topped with perfectly poached eggs, marinated feta, a hint of sweet chili, served with a warm breadbasket.', description_ar = 'مقلاة لذيذة من صلصة الطماطم الحارة مغطاة بالبيض المسلوق بشكل مثالي، والجبن الفيتا المتبل، وقليل من الفلفل الحلو، وتقدم مع سلة خبز دافئة.',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/7e43a4ca-649e-4ae5-8c1f-2538ffb52640/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250021' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Egg Menemen', 'بيض مينيمن', 'A Turkish classic of scrambled eggs cooked in spicy tomato sauce with bell peppers, crumble feta cheese & a touch of sweet chili, served with a warm breadbasket.', 'طبق تركي كلاسيكي من البيض المخفوق المطبوخ في صلصة الطماطم الحارة مع الفلفل الحلو وجبن الفيتا المفتت ولمسة من الفلفل الحلو، ويقدم مع سلة خبز دافئة.', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3dc55d14-33b5-4216-b690-a4483ff2827b/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:250021', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Egg Menemen', name_ar = 'بيض مينيمن', description = 'A Turkish classic of scrambled eggs cooked in spicy tomato sauce with bell peppers, crumble feta cheese & a touch of sweet chili, served with a warm breadbasket.', description_ar = 'طبق تركي كلاسيكي من البيض المخفوق المطبوخ في صلصة الطماطم الحارة مع الفلفل الحلو وجبن الفيتا المفتت ولمسة من الفلفل الحلو، ويقدم مع سلة خبز دافئة.',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3dc55d14-33b5-4216-b690-a4483ff2827b/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250023' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'French Omelette', 'أومليت فرنسي', 'Soft and fluffy folded French omelette served with a fresh mixed green tomato salad and a warm bread basket.', 'عجة فرنسية مطوية ناعمة ورقيقة تقدم مع سلطة طماطم خضراء مشكلة طازجة وسلة خبز دافئة.', 53, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/22aaa255-bba0-46a7-8747-68cfadc7502a/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:250023', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'French Omelette', name_ar = 'أومليت فرنسي', description = 'Soft and fluffy folded French omelette served with a fresh mixed green tomato salad and a warm bread basket.', description_ar = 'عجة فرنسية مطوية ناعمة ورقيقة تقدم مع سلطة طماطم خضراء مشكلة طازجة وسلة خبز دافئة.',
      price = 53, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/22aaa255-bba0-46a7-8747-68cfadc7502a/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250025' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Classic Scrambled Egg', 'البيض المخفوق الكلاسيكي', 'Three farm-fresh eggs, softly scrambled to perfection, served with a fresh mixed green & tomato salad and warm bread basket.', 'ثلاث بيضات طازجة مخفوقة بشكل ناعم حتى تصل إلى درجة الكمال، تقدم مع سلطة خضراء طازجة وطماطم وسلة خبز دافئة.', 55, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c6effbcb-7f8b-4d40-bd55-2c9170ce484f/conversions/blob-optimized.jpg', '{}'::text[], 70, 'apetito:250025', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Classic Scrambled Egg', name_ar = 'البيض المخفوق الكلاسيكي', description = 'Three farm-fresh eggs, softly scrambled to perfection, served with a fresh mixed green & tomato salad and warm bread basket.', description_ar = 'ثلاث بيضات طازجة مخفوقة بشكل ناعم حتى تصل إلى درجة الكمال، تقدم مع سلطة خضراء طازجة وطماطم وسلة خبز دافئة.',
      price = 55, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c6effbcb-7f8b-4d40-bd55-2c9170ce484f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 70, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250026' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Eggs Benedict', 'بيض بنديكت', 'Two perfectly poached eggs on toasted English muffins with turkey bacon, topped with silky hollandaise sauce, served with grilled asparagus', 'بيضتان مسلوقتان بشكل مثالي على خبز إنجليزي محمص مع لحم ديك رومي مقدد، ومغطاة بصلصة هولنديز حريرية، وتقدم مع الهليون المشوي', 69, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/bc2a1d7f-8af4-4e01-bcc9-c75cab1e8471/conversions/blob-optimized.jpg', '{}'::text[], 80, 'apetito:250026', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Eggs Benedict', name_ar = 'بيض بنديكت', description = 'Two perfectly poached eggs on toasted English muffins with turkey bacon, topped with silky hollandaise sauce, served with grilled asparagus', description_ar = 'بيضتان مسلوقتان بشكل مثالي على خبز إنجليزي محمص مع لحم ديك رومي مقدد، ومغطاة بصلصة هولنديز حريرية، وتقدم مع الهليون المشوي',
      price = 69, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/bc2a1d7f-8af4-4e01-bcc9-c75cab1e8471/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 80, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250027' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Eggs Royale', 'بيض رويال', 'Two perfectly poached eggs on toasted English muffins with smoked salmon, topped with silky hollandaise sauce, served with grilled asparagus, and roasted vine tomatoes', 'بيضتان مسلوقتان بشكل مثالي على خبز إنجليزي محمص مع سمك السلمون المدخن، ومغطاة بصلصة هولنديز حريرية، وتقدم مع الهليون المشوي والطماطم المشوية', 73, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9d07d36e-206c-481f-84fd-d84ee1e7dfd8/conversions/blob-optimized.jpg', '{}'::text[], 90, 'apetito:250027', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Eggs Royale', name_ar = 'بيض رويال', description = 'Two perfectly poached eggs on toasted English muffins with smoked salmon, topped with silky hollandaise sauce, served with grilled asparagus, and roasted vine tomatoes', description_ar = 'بيضتان مسلوقتان بشكل مثالي على خبز إنجليزي محمص مع سمك السلمون المدخن، ومغطاة بصلصة هولنديز حريرية، وتقدم مع الهليون المشوي والطماطم المشوية',
      price = 73, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9d07d36e-206c-481f-84fd-d84ee1e7dfd8/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 90, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250028' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Egg Avocado Croissant', 'كرواسون البيض والأفوكادو', 'Flaky butter croissant filled with soft scrambled eggs, topped with fresh avocado slices and a sprinkle of chives.', 'كرواسون زبدة متقشرة محشوة بالبيض المخفوق الناعم، ومغطاة بشرائح الأفوكادو الطازجة ورشة من الثوم المعمر.', 55, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/497cd618-4b57-4116-bf37-3d1fb223bf50/conversions/blob-optimized.jpg', array['Bestseller']::text[], 100, 'apetito:250028', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Egg Avocado Croissant', name_ar = 'كرواسون البيض والأفوكادو', description = 'Flaky butter croissant filled with soft scrambled eggs, topped with fresh avocado slices and a sprinkle of chives.', description_ar = 'كرواسون زبدة متقشرة محشوة بالبيض المخفوق الناعم، ومغطاة بشرائح الأفوكادو الطازجة ورشة من الثوم المعمر.',
      price = 55, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/497cd618-4b57-4116-bf37-3d1fb223bf50/conversions/blob-optimized.jpg', tags = array['Bestseller']::text[], sort_order = 100, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250030' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Smoked Salmon Croissant Benedict', 'كرواسون بنديكت بالسلمون المدخن', 'Flaky croissant topped with smoked salmon, poached eggs, Arugula Leaves & homemade hollandaise sauce.', 'كرواسون متقشر مغطى بالسلمون المدخن والبيض المسلوق وأوراق الجرجير وصلصة هولنديز محلية الصنع.', 65, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ae4748b0-b344-434c-ac86-96177b03cb1b/conversions/blob-optimized.jpg', '{}'::text[], 110, 'apetito:250030', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Smoked Salmon Croissant Benedict', name_ar = 'كرواسون بنديكت بالسلمون المدخن', description = 'Flaky croissant topped with smoked salmon, poached eggs, Arugula Leaves & homemade hollandaise sauce.', description_ar = 'كرواسون متقشر مغطى بالسلمون المدخن والبيض المسلوق وأوراق الجرجير وصلصة هولنديز محلية الصنع.',
      price = 65, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ae4748b0-b344-434c-ac86-96177b03cb1b/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 110, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250031' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Cilbir - Turkish Eggs', 'سيلبير - بيض تركي', 'Silky poached eggs over flavored Greek yogurt, finished with paprika chili butter, grilled chillies & fresh dill', 'بيض مسلوق ناعم على زبادي يوناني بنكهة مميزة، مع زبدة الفلفل الحار والبابريكا والفلفل الحار المشوي والشبت الطازج', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b107ed9f-b2a9-4207-83aa-f7355a01c810/conversions/blob-optimized.jpg', '{}'::text[], 120, 'apetito:250031', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Cilbir - Turkish Eggs', name_ar = 'سيلبير - بيض تركي', description = 'Silky poached eggs over flavored Greek yogurt, finished with paprika chili butter, grilled chillies & fresh dill', description_ar = 'بيض مسلوق ناعم على زبادي يوناني بنكهة مميزة، مع زبدة الفلفل الحار والبابريكا والفلفل الحار المشوي والشبت الطازج',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b107ed9f-b2a9-4207-83aa-f7355a01c810/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 120, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250032' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Melty Egg Muffin', 'كعكة البيض الذائبة', 'Toasted English muffin stacked with fried eggs, crispy hash brown, melted cheese, creamy avocado & fresh greens.', 'كعكة إنجليزية محمصة محشوة بالبيض المقلي، وبطاطس مقلية مقرمشة، وجبن ذائب، وأفوكادو كريمي، وخضراوات طازجة.', 57, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/aef79498-1de5-4012-a603-d2530ca103ff/conversions/blob-optimized.jpg', '{}'::text[], 130, 'apetito:250032', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Melty Egg Muffin', name_ar = 'كعكة البيض الذائبة', description = 'Toasted English muffin stacked with fried eggs, crispy hash brown, melted cheese, creamy avocado & fresh greens.', description_ar = 'كعكة إنجليزية محمصة محشوة بالبيض المقلي، وبطاطس مقلية مقرمشة، وجبن ذائب، وأفوكادو كريمي، وخضراوات طازجة.',
      price = 57, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/aef79498-1de5-4012-a603-d2530ca103ff/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 130, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250033' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Breakfast Bowl', 'وعاء الإفطار', 'Potato tots with mixed vegetables, Grilled halloumi, boiled eggs, salad leaves,, olives & grilled cherry tomatoes', 'بطاطس توتس مع خضار مشكلة، حلومي مشوي، بيض مسلوق، أوراق سلطة، زيتون وطماطم كرزية مشوية', 69, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d3b2e47e-1317-4972-835e-ccd9f7880032/conversions/blob-optimized.jpg', '{}'::text[], 140, 'apetito:250033', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Breakfast Bowl', name_ar = 'وعاء الإفطار', description = 'Potato tots with mixed vegetables, Grilled halloumi, boiled eggs, salad leaves,, olives & grilled cherry tomatoes', description_ar = 'بطاطس توتس مع خضار مشكلة، حلومي مشوي، بيض مسلوق، أوراق سلطة، زيتون وطماطم كرزية مشوية',
      price = 69, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d3b2e47e-1317-4972-835e-ccd9f7880032/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 140, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250037' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Burrata and Avocado Tartine', 'تارتين البوراتا والأفوكادو', 'Rustic sourdough topped with creamy burrata, smashed avocado, pomegranate seed , & extra virgin olive oil.', 'خبز العجين المخمر الريفي المغطى بالبراتا الكريمية والأفوكادو المهروس وبذور الرمان وزيت الزيتون البكر الممتاز.', 65, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/33602bfd-add4-495f-9846-24d11c1fb8a7/conversions/blob-optimized.jpg', '{}'::text[], 150, 'apetito:250037', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Burrata and Avocado Tartine', name_ar = 'تارتين البوراتا والأفوكادو', description = 'Rustic sourdough topped with creamy burrata, smashed avocado, pomegranate seed , & extra virgin olive oil.', description_ar = 'خبز العجين المخمر الريفي المغطى بالبراتا الكريمية والأفوكادو المهروس وبذور الرمان وزيت الزيتون البكر الممتاز.',
      price = 65, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/33602bfd-add4-495f-9846-24d11c1fb8a7/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 150, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250038' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Creamy Truffle Wild Mushroom Toast', 'خبز محمص بالفطر البري مع الكمأة الكريمية', 'Toasted sourdough with garlic butter, topped with truffle cream cheese, mixed mushrooms & a drizzle of white truffle oil. & fresh black truffle saving', 'خبز العجين المخمر المحمص مع زبدة الثوم، ومغطى بجبنة كريمة الكمأة، وفطر مشكل، ورشة من زيت الكمأة البيضاء، وزيت الكمأة السوداء الطازج', 67, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/63a583ed-91e7-4a49-b74e-5fbc43f1c088/conversions/blob-optimized.jpg', '{}'::text[], 160, 'apetito:250038', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Creamy Truffle Wild Mushroom Toast', name_ar = 'خبز محمص بالفطر البري مع الكمأة الكريمية', description = 'Toasted sourdough with garlic butter, topped with truffle cream cheese, mixed mushrooms & a drizzle of white truffle oil. & fresh black truffle saving', description_ar = 'خبز العجين المخمر المحمص مع زبدة الثوم، ومغطى بجبنة كريمة الكمأة، وفطر مشكل، ورشة من زيت الكمأة البيضاء، وزيت الكمأة السوداء الطازج',
      price = 67, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/63a583ed-91e7-4a49-b74e-5fbc43f1c088/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 160, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250039' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Avocado Mushroom Toast', 'خبز محمص بالأفوكادو والفطر', 'Toasted sourdough with garlic butter, topped with sauteed mushrooms, and micro green', 'خبز العجين المخمر المحمص مع زبدة الثوم، ومغطى بالفطر المقلي والخضراوات الصغيرة', 67, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/31b50b5e-141d-46a3-be22-a352ce34be87/conversions/blob-optimized.jpg', '{}'::text[], 170, 'apetito:250039', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Avocado Mushroom Toast', name_ar = 'خبز محمص بالأفوكادو والفطر', description = 'Toasted sourdough with garlic butter, topped with sauteed mushrooms, and micro green', description_ar = 'خبز العجين المخمر المحمص مع زبدة الثوم، ومغطى بالفطر المقلي والخضراوات الصغيرة',
      price = 67, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/31b50b5e-141d-46a3-be22-a352ce34be87/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 170, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250041' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Smashed Avocado On Toast', 'أفوكادو مهروس على الخبز المحمص', 'Toasted sourdough topped with lightly smashed seasoned avocado, juicy heirloom tomatoes, crumbled feta & a drizzle of balsamic glaze.', 'خبز العجين المخمر المحمص مغطى بالأفوكادو المهروس قليلاً والطماطم الموروثة اللذيذة والجبن الفيتا المفتت ورشة من صلصة البلسميك.', 53, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/bdf26981-0a12-455f-9e27-f50b4d74e4a8/conversions/blob-optimized.jpg', '{}'::text[], 180, 'apetito:250041', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Smashed Avocado On Toast', name_ar = 'أفوكادو مهروس على الخبز المحمص', description = 'Toasted sourdough topped with lightly smashed seasoned avocado, juicy heirloom tomatoes, crumbled feta & a drizzle of balsamic glaze.', description_ar = 'خبز العجين المخمر المحمص مغطى بالأفوكادو المهروس قليلاً والطماطم الموروثة اللذيذة والجبن الفيتا المفتت ورشة من صلصة البلسميك.',
      price = 53, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/bdf26981-0a12-455f-9e27-f50b4d74e4a8/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 180, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250042' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Cheese On Toast', 'الجبن على الخبز المحمص', 'Sourdough topped with mixed cheese, bell peppers, onions, olives, confit tomatoes & fresh herbs.', 'خبز العجين المخمر مغطى بالجبن المختلط والفلفل الحلو والبصل والزيتون والطماطم المحفوظة والأعشاب الطازجة.', 55, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/85ad2773-9275-4f65-8ab3-4f128278ed77/conversions/blob-optimized.jpg', '{}'::text[], 190, 'apetito:250042', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Cheese On Toast', name_ar = 'الجبن على الخبز المحمص', description = 'Sourdough topped with mixed cheese, bell peppers, onions, olives, confit tomatoes & fresh herbs.', description_ar = 'خبز العجين المخمر مغطى بالجبن المختلط والفلفل الحلو والبصل والزيتون والطماطم المحفوظة والأعشاب الطازجة.',
      price = 55, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/85ad2773-9275-4f65-8ab3-4f128278ed77/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 190, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250043' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Oatmeal Porridge with Raspberry sauce & mix berries', 'عصيدة الشوفان مع صلصة التوت ومزيج التوت', 'flat roll oats cooked with organic coconut milk serve with mix berries & raspberry sauce', 'لفائف الشوفان المسطحة المطبوخة بحليب جوز الهند العضوي تقدم مع مزيج من التوت وصلصة التوت', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/2ccec30c-7cf1-4973-84bc-dc9688e7850c/conversions/blob-optimized.jpg', '{}'::text[], 200, 'apetito:250043', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Oatmeal Porridge with Raspberry sauce & mix berries', name_ar = 'عصيدة الشوفان مع صلصة التوت ومزيج التوت', description = 'flat roll oats cooked with organic coconut milk serve with mix berries & raspberry sauce', description_ar = 'لفائف الشوفان المسطحة المطبوخة بحليب جوز الهند العضوي تقدم مع مزيج من التوت وصلصة التوت',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/2ccec30c-7cf1-4973-84bc-dc9688e7850c/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 200, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250044' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Acai Power Bowl', 'أساي باور بول', 'Smooth organic açaí blend topped with fresh strawberries, blackberries, raspberries, red currants, banana slices & a sprinkle of chia seeds.', 'مزيج أساي عضوي ناعم مغطى بالفراولة الطازجة، والتوت الأسود، والتوت الأحمر، والكشمش الأحمر، وشرائح الموز، ورشة من بذور الشيا.', 65, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/20429083-e341-4b44-b1a5-0b8e3f73a294/conversions/blob-optimized.jpg', '{}'::text[], 210, 'apetito:250044', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Acai Power Bowl', name_ar = 'أساي باور بول', description = 'Smooth organic açaí blend topped with fresh strawberries, blackberries, raspberries, red currants, banana slices & a sprinkle of chia seeds.', description_ar = 'مزيج أساي عضوي ناعم مغطى بالفراولة الطازجة، والتوت الأسود، والتوت الأحمر، والكشمش الأحمر، وشرائح الموز، ورشة من بذور الشيا.',
      price = 65, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/20429083-e341-4b44-b1a5-0b8e3f73a294/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 210, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250047' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Granola Bowl With Mixed Berries', 'وعاء جرانولا مع التوت المختلط', 'Homemade crunchy granola served on a bowl of organic honey-whipped yogurt infused, topped with fresh mixed berries and honey.', 'جرانولا مقرمشة محلية الصنع تقدم في وعاء من الزبادي المخفوق العضوي الممزوج بالعسل، ومغطاة بالتوت الطازج والعسل.', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/44b514a2-1013-4249-8b44-df7af155269f/conversions/blob-optimized.jpg', '{}'::text[], 220, 'apetito:250047', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Granola Bowl With Mixed Berries', name_ar = 'وعاء جرانولا مع التوت المختلط', description = 'Homemade crunchy granola served on a bowl of organic honey-whipped yogurt infused, topped with fresh mixed berries and honey.', description_ar = 'جرانولا مقرمشة محلية الصنع تقدم في وعاء من الزبادي المخفوق العضوي الممزوج بالعسل، ومغطاة بالتوت الطازج والعسل.',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/44b514a2-1013-4249-8b44-df7af155269f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 220, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250049' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Hot Fudge Nutella French Toast', 'خبز محمص فرنسي بالنوتيلا والفادج الساخن', 'Brioche Bread, Creme Anglaise, Butter, Nutella, Brownie', 'خبز بريوش، كريمة انجليزية، زبدة، نوتيلا، براوني', 55, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3b8ca71f-836d-4d55-af01-1059222e557c/conversions/blob-optimized.jpg', '{}'::text[], 230, 'apetito:250049', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Hot Fudge Nutella French Toast', name_ar = 'خبز محمص فرنسي بالنوتيلا والفادج الساخن', description = 'Brioche Bread, Creme Anglaise, Butter, Nutella, Brownie', description_ar = 'خبز بريوش، كريمة انجليزية، زبدة، نوتيلا، براوني',
      price = 55, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3b8ca71f-836d-4d55-af01-1059222e557c/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 230, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250051' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chocoberry Speical Pancakes', 'فطائر شوكوبيري الخاصة', 'A fluffy stack of six golden pancakes topped with fresh mixed berries and a dusting of powdered sugar.', 'كومة رقيقة من ست فطائر ذهبية اللون مغطاة بالتوت الطازج المختلط ورشة من السكر البودرة.', 65, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/786860a5-826b-4e87-9ca0-08777d9643ca/conversions/compressed-untitled-43-optimized.jpg', '{}'::text[], 240, 'apetito:250051', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chocoberry Speical Pancakes', name_ar = 'فطائر شوكوبيري الخاصة', description = 'A fluffy stack of six golden pancakes topped with fresh mixed berries and a dusting of powdered sugar.', description_ar = 'كومة رقيقة من ست فطائر ذهبية اللون مغطاة بالتوت الطازج المختلط ورشة من السكر البودرة.',
      price = 65, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/786860a5-826b-4e87-9ca0-08777d9643ca/conversions/compressed-untitled-43-optimized.jpg', tags = '{}'::text[], sort_order = 240, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97323' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'SANDWICHES', 'السندويشات', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/be9158f6-2974-4cfa-a8dc-ece9664e4881/conversions/blob-small.jpg', 30, 'kitchen', 'apetito:97323') returning id into v_cat;
  else
    update menu_categories set name = 'SANDWICHES', name_ar = 'السندويشات', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/be9158f6-2974-4cfa-a8dc-ece9664e4881/conversions/blob-small.jpg', sort_order = 30, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250053' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Grilled Chicken & Pesto Sandwich', 'ساندويتش دجاج مشوي مع بيستو', 'Grilled Chicken Breast with sundried tomatoes, fresh greens & basil pesto on toasted panini bread. Served with fries.', 'صدر دجاج مشوي مع طماطم مجففة، خضراوات طازجة، وبيستو الريحان، على خبز بانيني محمص. يُقدم مع بطاطس مقلية.', 53, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/11f8e3e2-99e3-4216-97a5-513c408de5c0/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:250053', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Grilled Chicken & Pesto Sandwich', name_ar = 'ساندويتش دجاج مشوي مع بيستو', description = 'Grilled Chicken Breast with sundried tomatoes, fresh greens & basil pesto on toasted panini bread. Served with fries.', description_ar = 'صدر دجاج مشوي مع طماطم مجففة، خضراوات طازجة، وبيستو الريحان، على خبز بانيني محمص. يُقدم مع بطاطس مقلية.',
      price = 53, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/11f8e3e2-99e3-4216-97a5-513c408de5c0/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250054' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Pesto Halloumi Sandwich', 'ساندويتش بيستو حلومي', 'Grilled halloumi with sundried tomatoes, fresh greens & basil pesto on toasted panini bread. Served with fries.', 'حلوم مشوي مع طماطم مجففة، خضراوات طازجة، وبيستو الريحان، على خبز بانيني محمص. يُقدم مع بطاطا مقلية.', 53, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f20148d4-ec42-46d5-88f0-f33ee476200b/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:250054', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Pesto Halloumi Sandwich', name_ar = 'ساندويتش بيستو حلومي', description = 'Grilled halloumi with sundried tomatoes, fresh greens & basil pesto on toasted panini bread. Served with fries.', description_ar = 'حلوم مشوي مع طماطم مجففة، خضراوات طازجة، وبيستو الريحان، على خبز بانيني محمص. يُقدم مع بطاطا مقلية.',
      price = 53, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f20148d4-ec42-46d5-88f0-f33ee476200b/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250055' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chicken Sando Melt', 'ساندويتش دجاج ميلت', 'Brioche Bread, Spicy Chicken Breast, Cheese Sauce, Comeback Sauce, Side Salad, Potato Strips.', 'خبز بريوش، صدور دجاج حارة، صلصة الجبن، صلصة العودة، سلطة جانبية، شرائح البطاطس.', 69, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ec8bbb58-4c68-4c40-b83d-f0660d76b28f/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:250055', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chicken Sando Melt', name_ar = 'ساندويتش دجاج ميلت', description = 'Brioche Bread, Spicy Chicken Breast, Cheese Sauce, Comeback Sauce, Side Salad, Potato Strips.', description_ar = 'خبز بريوش، صدور دجاج حارة، صلصة الجبن، صلصة العودة، سلطة جانبية، شرائح البطاطس.',
      price = 69, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ec8bbb58-4c68-4c40-b83d-f0660d76b28f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250057' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chicken Club', 'نادي الدجاج', 'Brioche Slice Bread, Grilled Chicken Breast, Cheese, Fried Egg, Avocado, Tomato, Chipotle Mayo, Side Salad.', 'شريحة خبز بريوش، صدر دجاج مشوي، جبن، بيض مقلي، أفوكادو، طماطم، مايونيز شيبولتي، سلطة جانبية.', 69, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/96e7cc91-66a9-47d5-9704-b95c6b484215/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:250057', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chicken Club', name_ar = 'نادي الدجاج', description = 'Brioche Slice Bread, Grilled Chicken Breast, Cheese, Fried Egg, Avocado, Tomato, Chipotle Mayo, Side Salad.', description_ar = 'شريحة خبز بريوش، صدر دجاج مشوي، جبن، بيض مقلي، أفوكادو، طماطم، مايونيز شيبولتي، سلطة جانبية.',
      price = 69, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/96e7cc91-66a9-47d5-9704-b95c6b484215/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250058' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Buttermilk Chicken Burger', 'برجر دجاج باللبن الرائب', 'Crispy Nashville-style buttermilk chicken with lettuce, tomato, melted cheese, sweet relish & comeback–sriracha sauce in a soft potato bun. Served with salad or fries.', 'دجاج مقرمش على طريقة ناشفيل، مُغطى باللبن الرائب، مع خس، طماطم، جبن ذائب، مخلل حلو، وصلصة سريراتشا، في خبز بطاطس طري. يُقدم مع سلطة أو بطاطس مقلية.', 69, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/2f4fe63b-d65d-4166-a8aa-9951b8843ddf/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:250058', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Buttermilk Chicken Burger', name_ar = 'برجر دجاج باللبن الرائب', description = 'Crispy Nashville-style buttermilk chicken with lettuce, tomato, melted cheese, sweet relish & comeback–sriracha sauce in a soft potato bun. Served with salad or fries.', description_ar = 'دجاج مقرمش على طريقة ناشفيل، مُغطى باللبن الرائب، مع خس، طماطم، جبن ذائب، مخلل حلو، وصلصة سريراتشا، في خبز بطاطس طري. يُقدم مع سلطة أو بطاطس مقلية.',
      price = 69, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/2f4fe63b-d65d-4166-a8aa-9951b8843ddf/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250059' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Old Fashioned BBQ Wagyu Beef Burger', 'برجر لحم واغيو المشوي على الطريقة القديمة', 'Potato Bun, B.B.Q Wagyu Beef Patties, Lettuce, Comeback Sauce, Melted Cheese, Pickle Relish, & Caramelized Onion Serve with Side Salad Or French Fries', 'خبز البطاطس، فطائر لحم واغيو المشوية، خس، صلصة كام باك، جبن ذائب، مخلل، وبصل مكرمل، تقدم مع سلطة جانبية أو بطاطس مقلية', 79, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c586d9d0-8ef9-4b1f-9099-ba397e3009dc/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:250059', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Old Fashioned BBQ Wagyu Beef Burger', name_ar = 'برجر لحم واغيو المشوي على الطريقة القديمة', description = 'Potato Bun, B.B.Q Wagyu Beef Patties, Lettuce, Comeback Sauce, Melted Cheese, Pickle Relish, & Caramelized Onion Serve with Side Salad Or French Fries', description_ar = 'خبز البطاطس، فطائر لحم واغيو المشوية، خس، صلصة كام باك، جبن ذائب، مخلل، وبصل مكرمل، تقدم مع سلطة جانبية أو بطاطس مقلية',
      price = 79, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c586d9d0-8ef9-4b1f-9099-ba397e3009dc/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97324' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'APPETIZERS', 'المقبلات', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5a22659a-75e4-4485-8c96-5e496dac157a/conversions/blob-small.jpg', 40, 'kitchen', 'apetito:97324') returning id into v_cat;
  else
    update menu_categories set name = 'APPETIZERS', name_ar = 'المقبلات', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5a22659a-75e4-4485-8c96-5e496dac157a/conversions/blob-small.jpg', sort_order = 40, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250062' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'K-Pops', 'الكيبوب', 'Korean chicken pops tossed in spicy Korean BBQ sauce & sesame seeds. Served with ranch sauce.', 'قطع دجاج كورية مقرمشة مغموسة في صلصة الباربكيو الكورية الحارة وبذور السمسم. تقدم مع صلصة الرانش.', 49, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/30cbada1-88bb-40a4-916c-448a147a28fe/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:250062', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'K-Pops', name_ar = 'الكيبوب', description = 'Korean chicken pops tossed in spicy Korean BBQ sauce & sesame seeds. Served with ranch sauce.', description_ar = 'قطع دجاج كورية مقرمشة مغموسة في صلصة الباربكيو الكورية الحارة وبذور السمسم. تقدم مع صلصة الرانش.',
      price = 49, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/30cbada1-88bb-40a4-916c-448a147a28fe/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250064' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Roasted Corn Cobs', 'كيزان الذرة المشوية', 'Cornfed Tender Corn, Paprika Butter, Coriander, Chipotle Dip.', 'ذرة طرية من ذرة تتغذى على الذرة، زبدة البابريكا، الكزبرة، صلصة شيبوتلي.', 63, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3e2f0531-b2cc-4cfb-954a-537327260872/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:250064', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Roasted Corn Cobs', name_ar = 'كيزان الذرة المشوية', description = 'Cornfed Tender Corn, Paprika Butter, Coriander, Chipotle Dip.', description_ar = 'ذرة طرية من ذرة تتغذى على الذرة، زبدة البابريكا، الكزبرة، صلصة شيبوتلي.',
      price = 63, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3e2f0531-b2cc-4cfb-954a-537327260872/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250065' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Quesadilla', 'الكيساديلا', 'Tortilla Bread, Chicken Quesadilla Mix, Cheese, Sourcream, Guacamole, Salsa, Lemon.', 'خبز التورتيلا، مزيج كاساديا الدجاج، الجبن، الكريمة الحامضة، الجواكامولي، الصلصة، الليمون.', 49, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9c582502-7374-4e9e-b182-460efdc499ed/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:250065', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Quesadilla', name_ar = 'الكيساديلا', description = 'Tortilla Bread, Chicken Quesadilla Mix, Cheese, Sourcream, Guacamole, Salsa, Lemon.', description_ar = 'خبز التورتيلا، مزيج كاساديا الدجاج، الجبن، الكريمة الحامضة، الجواكامولي، الصلصة، الليمون.',
      price = 49, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9c582502-7374-4e9e-b182-460efdc499ed/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250067' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chicken Slider', 'شطيرة دجاج سلايدر', 'Brioche Bun, Crispy Chicken, Cheese Sauce, Iceburg, Sriracha Mayo, Pickle, French Fries, Ranch Sauce.', 'كعكة بريوش، دجاج مقرمش، صلصة الجبن، آيسبرغ، مايونيز سريراتشا، مخلل، بطاطس مقلية، صلصة رانش.', 63, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ac7c1e2b-2372-4f53-96b8-8351bf905403/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:250067', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chicken Slider', name_ar = 'شطيرة دجاج سلايدر', description = 'Brioche Bun, Crispy Chicken, Cheese Sauce, Iceburg, Sriracha Mayo, Pickle, French Fries, Ranch Sauce.', description_ar = 'كعكة بريوش، دجاج مقرمش، صلصة الجبن، آيسبرغ، مايونيز سريراتشا، مخلل، بطاطس مقلية، صلصة رانش.',
      price = 63, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ac7c1e2b-2372-4f53-96b8-8351bf905403/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250068' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Wagyu Beef Slider', 'شريحة لحم واغيو', 'Brioche Bun, Wagyu Beef Patty, Cheese Slice, baby jam lettuce, come back sauce, relish, & caramelize onion serve with French fries', 'خبز بريوش، فطيرة لحم واغيو، شريحة جبن، خس مربى صغير، صلصة باك، مخلل، وبصل مكرمل، يقدم مع بطاطس مقلية', 75, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c771ab6f-a0b8-4710-98f2-ad40564ed04f/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:250068', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Wagyu Beef Slider', name_ar = 'شريحة لحم واغيو', description = 'Brioche Bun, Wagyu Beef Patty, Cheese Slice, baby jam lettuce, come back sauce, relish, & caramelize onion serve with French fries', description_ar = 'خبز بريوش، فطيرة لحم واغيو، شريحة جبن، خس مربى صغير، صلصة باك، مخلل، وبصل مكرمل، يقدم مع بطاطس مقلية',
      price = 75, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c771ab6f-a0b8-4710-98f2-ad40564ed04f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250069' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Patatas Bravas', 'باتاتاس برافاس', 'Fried Potatoes, Bravas Sauce, Cheese, Salsa, Sour Cream', 'بطاطس مقلية، صلصة برافاس، جبن، صلصة، كريمة حامضة', 45, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/016be40e-08d1-4d87-9c66-02952de440fc/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:250069', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Patatas Bravas', name_ar = 'باتاتاس برافاس', description = 'Fried Potatoes, Bravas Sauce, Cheese, Salsa, Sour Cream', description_ar = 'بطاطس مقلية، صلصة برافاس، جبن، صلصة، كريمة حامضة',
      price = 45, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/016be40e-08d1-4d87-9c66-02952de440fc/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250070' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Dynamite Shrimp', 'روبيان ديناميت', 'Crispy tempura shrimp tossed in creamy dynamite sauce, topped with chives, black sesame & sakura.', 'روبيان تمبورا مقرمش ممزوج بصلصة الديناميت الكريمية، ومغطى بالثوم المعمر والسمسم الأسود والساكورا.', 63, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/60f93261-5732-452b-86f8-c41280f6dd80/conversions/blob-optimized.jpg', '{}'::text[], 70, 'apetito:250070', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Dynamite Shrimp', name_ar = 'روبيان ديناميت', description = 'Crispy tempura shrimp tossed in creamy dynamite sauce, topped with chives, black sesame & sakura.', description_ar = 'روبيان تمبورا مقرمش ممزوج بصلصة الديناميت الكريمية، ومغطى بالثوم المعمر والسمسم الأسود والساكورا.',
      price = 63, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/60f93261-5732-452b-86f8-c41280f6dd80/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 70, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97325' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'SOUPS', 'الشوربات', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f8985e3d-e8cf-436f-90c7-08ed1a4cfa9e/conversions/blob-small.jpg', 50, 'kitchen', 'apetito:97325') returning id into v_cat;
  else
    update menu_categories set name = 'SOUPS', name_ar = 'الشوربات', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f8985e3d-e8cf-436f-90c7-08ed1a4cfa9e/conversions/blob-small.jpg', sort_order = 50, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250071' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Wild Mushroom Soup', 'حساء الفطر البري', 'Wild Mushrooms, Dry Mushrooms, Leeks, Cream, Veg Broth, Toasted Bread', 'فطر بري، فطر جاف، كراث، كريمة، مرق خضار، خبز محمص', 37, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b4977296-a781-4bb3-aa5d-397685397bb6/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:250071', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Wild Mushroom Soup', name_ar = 'حساء الفطر البري', description = 'Wild Mushrooms, Dry Mushrooms, Leeks, Cream, Veg Broth, Toasted Bread', description_ar = 'فطر بري، فطر جاف، كراث، كريمة، مرق خضار، خبز محمص',
      price = 37, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b4977296-a781-4bb3-aa5d-397685397bb6/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250072' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Lentil Soup', 'شوربة العدس', 'Red Lentils, Veg Broth, Roasted Cumin Seed, Sweet Paprika, Paprika Oil & Toasted bread', 'عدس أحمر، مرق خضار، بذور كمون محمصة، بابريكا حلوة، زيت بابريكا وخبز محمص', 37, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/714ba7f9-cb0f-44ca-b4cb-24808c491dfb/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:250072', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Lentil Soup', name_ar = 'شوربة العدس', description = 'Red Lentils, Veg Broth, Roasted Cumin Seed, Sweet Paprika, Paprika Oil & Toasted bread', description_ar = 'عدس أحمر، مرق خضار، بذور كمون محمصة، بابريكا حلوة، زيت بابريكا وخبز محمص',
      price = 37, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/714ba7f9-cb0f-44ca-b4cb-24808c491dfb/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250073' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Roasted Tomato', 'طماطم مشوية', 'Roasted tomato soup made with butte, fresh basil, onion, carrot, garlic, fresh thyme serve with basil oil, toasted garlic bread', 'شوربة الطماطم المحمصة المصنوعة من الزبدة والريحان الطازج والبصل والجزر والثوم والزعتر الطازج تقدم مع زيت الريحان وخبز الثوم المحمص', 37, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d8d118f3-1af3-4a7a-ab45-3e1e67e355a0/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:250073', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Roasted Tomato', name_ar = 'طماطم مشوية', description = 'Roasted tomato soup made with butte, fresh basil, onion, carrot, garlic, fresh thyme serve with basil oil, toasted garlic bread', description_ar = 'شوربة الطماطم المحمصة المصنوعة من الزبدة والريحان الطازج والبصل والجزر والثوم والزعتر الطازج تقدم مع زيت الريحان وخبز الثوم المحمص',
      price = 37, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d8d118f3-1af3-4a7a-ab45-3e1e67e355a0/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97326' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'SALADS', 'السلطات', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/37134937-4443-4fd3-af34-2558722f2d7d/conversions/blob-small.jpg', 60, 'kitchen', 'apetito:97326') returning id into v_cat;
  else
    update menu_categories set name = 'SALADS', name_ar = 'السلطات', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/37134937-4443-4fd3-af34-2558722f2d7d/conversions/blob-small.jpg', sort_order = 60, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250074' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Baby Arugula Salad', 'سلطة الجرجير الصغير', 'Freshness In Every Leaf Baby Arugula, Fresh Berries, Orange Segment, Feta Cheese, Radish, Balsamic Glaze Dressing, & Olive Oil', 'نضارة في كل ورقة جرجير صغير، توت طازج، شريحة برتقال، جبنة فيتا، فجل، صلصة بلسميك، وزيت زيتون', 53, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e8eb19b0-8272-4d20-8a54-54bfa300fb9b/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:250074', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Baby Arugula Salad', name_ar = 'سلطة الجرجير الصغير', description = 'Freshness In Every Leaf Baby Arugula, Fresh Berries, Orange Segment, Feta Cheese, Radish, Balsamic Glaze Dressing, & Olive Oil', description_ar = 'نضارة في كل ورقة جرجير صغير، توت طازج، شريحة برتقال، جبنة فيتا، فجل، صلصة بلسميك، وزيت زيتون',
      price = 53, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e8eb19b0-8272-4d20-8a54-54bfa300fb9b/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250075' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Quinoa Salad', 'سلطة الكينوا', 'Quinoa Mix, Lettuce, Avocado, Roasted Bell Pepper, Heirloom Tomato, Lemon Herb Dressing', 'مزيج الكينوا، خس، أفوكادو، فلفل رومي مشوي، طماطم قديمة، صلصة ليمون وأعشاب', 53, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ccfb298f-df07-419b-9f5c-7a336c4d7042/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:250075', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Quinoa Salad', name_ar = 'سلطة الكينوا', description = 'Quinoa Mix, Lettuce, Avocado, Roasted Bell Pepper, Heirloom Tomato, Lemon Herb Dressing', description_ar = 'مزيج الكينوا، خس، أفوكادو، فلفل رومي مشوي، طماطم قديمة، صلصة ليمون وأعشاب',
      price = 53, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ccfb298f-df07-419b-9f5c-7a336c4d7042/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250076' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Avocado Ceasar Salad', 'سلطة سيزر بالأفوكادو', 'Baby Gem, Creamy Caesar Dressing, Avocado Cubes, Heirloom Tomato, Parmesan Cheese, Bread Crisp.', 'بيبي جيم، صلصة سيزر الكريمية، مكعبات الأفوكادو، الطماطم التراثية، جبن البارميزان، خبز مقرمش.', 63, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/63bd0f76-942d-43b0-a559-81b72e55f7b1/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:250076', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Avocado Ceasar Salad', name_ar = 'سلطة سيزر بالأفوكادو', description = 'Baby Gem, Creamy Caesar Dressing, Avocado Cubes, Heirloom Tomato, Parmesan Cheese, Bread Crisp.', description_ar = 'بيبي جيم، صلصة سيزر الكريمية، مكعبات الأفوكادو، الطماطم التراثية، جبن البارميزان، خبز مقرمش.',
      price = 63, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/63bd0f76-942d-43b0-a559-81b72e55f7b1/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250077' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Burrata Salad', 'سلطة بوراتا', 'Baby Arugula, Burrata, Mix Fresh Berry, Homemade Fruit Caviar, Cucumber,& Balsamic Dressing', 'جرجير صغير، بوراتا، مزيج من التوت الطازج، كافيار الفاكهة محلي الصنع، خيار، وصلصة بلسميك', 73, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/4a6801b3-3047-498c-8191-d2caa10f2eee/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:250077', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Burrata Salad', name_ar = 'سلطة بوراتا', description = 'Baby Arugula, Burrata, Mix Fresh Berry, Homemade Fruit Caviar, Cucumber,& Balsamic Dressing', description_ar = 'جرجير صغير، بوراتا، مزيج من التوت الطازج، كافيار الفاكهة محلي الصنع، خيار، وصلصة بلسميك',
      price = 73, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/4a6801b3-3047-498c-8191-d2caa10f2eee/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97327' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'BOWLS', 'أوعية', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/8f6f0c82-7756-4a54-b4ad-f0bc16a31f45/conversions/blob-small.jpg', 70, 'kitchen', 'apetito:97327') returning id into v_cat;
  else
    update menu_categories set name = 'BOWLS', name_ar = 'أوعية', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/8f6f0c82-7756-4a54-b4ad-f0bc16a31f45/conversions/blob-small.jpg', sort_order = 70, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250078' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Salmon Bowl', 'طبق السلمون', 'Norwegian Salmon, Gochujang Sauce, Quinoa Mix, Avocado, Mix Salad, Confit Tomatoes, Torched Corn, Mix Salad', 'سمك السلمون النرويجي، صلصة غوتشوجانغ، مزيج الكينوا، الأفوكادو، سلطة مشكلة، طماطم كونفي، ذرة مشوية، سلطة مشكلة', 75, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3edc4fe3-bcf8-49fe-a232-becce2f96b7d/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:250078', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Salmon Bowl', name_ar = 'طبق السلمون', description = 'Norwegian Salmon, Gochujang Sauce, Quinoa Mix, Avocado, Mix Salad, Confit Tomatoes, Torched Corn, Mix Salad', description_ar = 'سمك السلمون النرويجي، صلصة غوتشوجانغ، مزيج الكينوا، الأفوكادو، سلطة مشكلة، طماطم كونفي، ذرة مشوية، سلطة مشكلة',
      price = 75, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3edc4fe3-bcf8-49fe-a232-becce2f96b7d/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250079' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chicken Shawarma', 'شاورما دجاج', 'Loaded With Flavour, Rice Chicken Shawarma, Mediterranean Salad, Hummus, Tahini, Tomato Salsa And Green Salad ..', 'محملة بالنكهة، أرز شاورما دجاج، سلطة البحر الأبيض المتوسط، حمص، طحينة، صلصة الطماطم والسلطة الخضراء.', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3d177e42-560a-426a-a819-239f94f08e22/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:250079', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chicken Shawarma', name_ar = 'شاورما دجاج', description = 'Loaded With Flavour, Rice Chicken Shawarma, Mediterranean Salad, Hummus, Tahini, Tomato Salsa And Green Salad ..', description_ar = 'محملة بالنكهة، أرز شاورما دجاج، سلطة البحر الأبيض المتوسط، حمص، طحينة، صلصة الطماطم والسلطة الخضراء.',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3d177e42-560a-426a-a819-239f94f08e22/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250080' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Fire Cracker Chicken`', 'دجاج فاير كراكر', 'Fire Cracker Chicken Is A Tasty And Satisfying Stir Fry Bowl Made With Succulent Fired Chicken Tossed In A Tangy And Spicy Sauce. This Dish feature a medley of fresh Vegetable . Complimented With fluffy white Steamed Rice .This flery creation will make your taste buds dance and leave you pleasantly full .', 'دجاج فاير كراكر طبق مقلي شهي ومُرضٍ، مصنوع من دجاج مشوي شهي، ممزوج بصلصة لاذعة وحارة. يتميز هذا الطبق بمزيج من الخضراوات الطازجة، ويُقدم مع أرز أبيض مطهو على البخار. هذا الطبق اللذيذ سيُبهج براعم التذوق لديك ويمنحك شعورًا بالشبع.', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/93bfc0cd-ce53-4ab2-8341-eaa15e52562f/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:250080', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Fire Cracker Chicken`', name_ar = 'دجاج فاير كراكر', description = 'Fire Cracker Chicken Is A Tasty And Satisfying Stir Fry Bowl Made With Succulent Fired Chicken Tossed In A Tangy And Spicy Sauce. This Dish feature a medley of fresh Vegetable . Complimented With fluffy white Steamed Rice .This flery creation will make your taste buds dance and leave you pleasantly full .', description_ar = 'دجاج فاير كراكر طبق مقلي شهي ومُرضٍ، مصنوع من دجاج مشوي شهي، ممزوج بصلصة لاذعة وحارة. يتميز هذا الطبق بمزيج من الخضراوات الطازجة، ويُقدم مع أرز أبيض مطهو على البخار. هذا الطبق اللذيذ سيُبهج براعم التذوق لديك ويمنحك شعورًا بالشبع.',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/93bfc0cd-ce53-4ab2-8341-eaa15e52562f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250081' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Beef Sesame Noodles', 'نودلز لحم البقر بالسمسم', 'Stir Fry Noodles With Beef Strips, Vegetables, And Korean Spices.', 'المعكرونة المقلية مع شرائح اللحم البقري والخضروات والتوابل الكورية.', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ff9dd648-48bf-4985-b712-95713c8e70e5/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:250081', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Beef Sesame Noodles', name_ar = 'نودلز لحم البقر بالسمسم', description = 'Stir Fry Noodles With Beef Strips, Vegetables, And Korean Spices.', description_ar = 'المعكرونة المقلية مع شرائح اللحم البقري والخضروات والتوابل الكورية.',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ff9dd648-48bf-4985-b712-95713c8e70e5/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250082' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chicken Sesame Noodles', 'نودلز الدجاج بالسمسم', 'Stir Fry Noodles With Chicken Strips, Vegetables, And Korean Spices.', 'المعكرونة المقلية مع شرائح الدجاج والخضروات والتوابل الكورية.', 55, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/29ef6f3c-711d-4fb7-86e3-79158c37b82a/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:250082', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chicken Sesame Noodles', name_ar = 'نودلز الدجاج بالسمسم', description = 'Stir Fry Noodles With Chicken Strips, Vegetables, And Korean Spices.', description_ar = 'المعكرونة المقلية مع شرائح الدجاج والخضروات والتوابل الكورية.',
      price = 55, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/29ef6f3c-711d-4fb7-86e3-79158c37b82a/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250083' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chicken Santa Fe Bowl', 'وعاء دجاج سانتا في', 'Spicy Grilled Chicken, Quinoa Mix, Baby Mix Greens , Heirloom Tomatoes, Jalapenos, Avocado, Black Beans, & Tomato Salsa', 'دجاج مشوي حار، مزيج الكينوا، خضراوات مشكلة صغيرة، طماطم قديمة، فلفل هالبينو، أفوكادو، فاصوليا سوداء، وصلصة طماطم', 63, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/6a846cb3-4958-424b-8c8f-a28c72679cac/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:250083', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chicken Santa Fe Bowl', name_ar = 'وعاء دجاج سانتا في', description = 'Spicy Grilled Chicken, Quinoa Mix, Baby Mix Greens , Heirloom Tomatoes, Jalapenos, Avocado, Black Beans, & Tomato Salsa', description_ar = 'دجاج مشوي حار، مزيج الكينوا، خضراوات مشكلة صغيرة، طماطم قديمة، فلفل هالبينو، أفوكادو، فاصوليا سوداء، وصلصة طماطم',
      price = 63, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/6a846cb3-4958-424b-8c8f-a28c72679cac/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97328' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'MAINS', 'التيار الكهربائي', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/67d7bafc-db6f-4371-afab-c329460d6a51/conversions/blob-small.jpg', 80, 'kitchen', 'apetito:97328') returning id into v_cat;
  else
    update menu_categories set name = 'MAINS', name_ar = 'التيار الكهربائي', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/67d7bafc-db6f-4371-afab-c329460d6a51/conversions/blob-small.jpg', sort_order = 80, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250084' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Truffle Rigtoni Alfredo', 'ريجتوني ألفريدو بالكمأة', 'Creamy Truffle Sauce, Rigatoni Pasta, Grana Padano, Fresh Black Truffle & Truffle Oil.', 'صلصة الكمأة الكريمية، معكرونة ريجاتوني، جرانا بادانو، الكمأة السوداء الطازجة وزيت الكمأة.', 85, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5d2b458e-a9d9-4730-ae79-2c63eefebc03/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:250084', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Truffle Rigtoni Alfredo', name_ar = 'ريجتوني ألفريدو بالكمأة', description = 'Creamy Truffle Sauce, Rigatoni Pasta, Grana Padano, Fresh Black Truffle & Truffle Oil.', description_ar = 'صلصة الكمأة الكريمية، معكرونة ريجاتوني، جرانا بادانو، الكمأة السوداء الطازجة وزيت الكمأة.',
      price = 85, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5d2b458e-a9d9-4730-ae79-2c63eefebc03/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250087' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Wild Mushroom Risotto', 'ريزوتو الفطر البري', 'Mix Mushrooms, Mushroom Broth, Italian Rice, Grana Padano, Cheese Shavings, White Truffle Oil, Fresh Black Truffle, Parsley .', 'مزيج الفطر، مرق الفطر، الأرز الإيطالي، جرانا بادانو، رقائق الجبن، زيت الكمأة البيضاء، الكمأة السوداء الطازجة، البقدونس.', 79, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/540db591-5556-4fbe-bea8-875b78c58f0c/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:250087', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Wild Mushroom Risotto', name_ar = 'ريزوتو الفطر البري', description = 'Mix Mushrooms, Mushroom Broth, Italian Rice, Grana Padano, Cheese Shavings, White Truffle Oil, Fresh Black Truffle, Parsley .', description_ar = 'مزيج الفطر، مرق الفطر، الأرز الإيطالي، جرانا بادانو، رقائق الجبن، زيت الكمأة البيضاء، الكمأة السوداء الطازجة، البقدونس.',
      price = 79, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/540db591-5556-4fbe-bea8-875b78c58f0c/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250090' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Creamy Arrabbiata  Chicken Pasta', 'معكرونة دجاج أرابياتا بالكريمة', 'Penne pasta in creamy arrabbiata sauce, topped with herbed-crust chicken, grana padano & fresh basil.', 'معكرونة بيني في صلصة أرابياتا الكريمية، مغطاة بالدجاج المغطى بقشرة الأعشاب، وجبنة غرانابادانو، والريحان الطازج.', 69, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/20199865-1d23-45d0-ba88-eafb6c6b5f96/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:250090', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Creamy Arrabbiata  Chicken Pasta', name_ar = 'معكرونة دجاج أرابياتا بالكريمة', description = 'Penne pasta in creamy arrabbiata sauce, topped with herbed-crust chicken, grana padano & fresh basil.', description_ar = 'معكرونة بيني في صلصة أرابياتا الكريمية، مغطاة بالدجاج المغطى بقشرة الأعشاب، وجبنة غرانابادانو، والريحان الطازج.',
      price = 69, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/20199865-1d23-45d0-ba88-eafb6c6b5f96/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250092' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Grilled Chicken with Creamy Mushroom Sauce', 'دجاج مشوي مع صلصة الفطر الكريمية', 'Juicy grilled chicken breast served with creamy wild mushroom sauce & fresh herbs.', 'صدر دجاج مشوي شهي يقدم مع صلصة الفطر البري الكريمية والأعشاب الطازجة.', 71, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/678ced2f-0111-4cc1-accf-5157a04b6f75/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:250092', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Grilled Chicken with Creamy Mushroom Sauce', name_ar = 'دجاج مشوي مع صلصة الفطر الكريمية', description = 'Juicy grilled chicken breast served with creamy wild mushroom sauce & fresh herbs.', description_ar = 'صدر دجاج مشوي شهي يقدم مع صلصة الفطر البري الكريمية والأعشاب الطازجة.',
      price = 71, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/678ced2f-0111-4cc1-accf-5157a04b6f75/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250093' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Beef Tenderloin Steak with Creamy Mushroom Sauce', 'شريحة لحم تندرلوين مع صلصة الفطر الكريمية', 'Grilled Wagyu Tenderloin Served with Creamy Mushroom Sauce, Sauteed Exotic Vegetables.', 'لحم واغيو مشوي يقدم مع صلصة الفطر الكريمية، وخضراوات غريبة مقلية.', 149, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/23a42d49-e771-45e8-b8cc-eb70e8528719/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:250093', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Beef Tenderloin Steak with Creamy Mushroom Sauce', name_ar = 'شريحة لحم تندرلوين مع صلصة الفطر الكريمية', description = 'Grilled Wagyu Tenderloin Served with Creamy Mushroom Sauce, Sauteed Exotic Vegetables.', description_ar = 'لحم واغيو مشوي يقدم مع صلصة الفطر الكريمية، وخضراوات غريبة مقلية.',
      price = 149, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/23a42d49-e771-45e8-b8cc-eb70e8528719/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250096' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Wagyu Rib-eye Steak', 'شريحة لحم ريب آي من لحم الواغيو', '5–7 grade wagyu rib-eye served with heirloom carrots, asparagus, roasted baby potato, & jue', 'شريحة لحم واغيو من الدرجة 5-7 تقدم مع جزر تراثي، وهليون، وبطاطا صغيرة مشوية، وعصير.', 165, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/73ac19eb-880b-4ed1-a185-74c0f47c5228/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:250096', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Wagyu Rib-eye Steak', name_ar = 'شريحة لحم ريب آي من لحم الواغيو', description = '5–7 grade wagyu rib-eye served with heirloom carrots, asparagus, roasted baby potato, & jue', description_ar = 'شريحة لحم واغيو من الدرجة 5-7 تقدم مع جزر تراثي، وهليون، وبطاطا صغيرة مشوية، وعصير.',
      price = 165, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/73ac19eb-880b-4ed1-a185-74c0f47c5228/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250094' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Grilled Salmon with Sweet Potato Puree', 'سمك السلمون المشوي مع هريس البطاطا الحلوة', 'Butter Grill Salmon, with Exotic Vegetables, & Sweet Potato Puree', 'سمك السلمون المشوي بالزبدة، مع خضراوات غريبة، وهريس البطاطا الحلوة', 75, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/da88d8ff-b10c-42df-8b8a-510a7a7a9bbe/conversions/blob-optimized.jpg', array['New']::text[], 70, 'apetito:250094', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Grilled Salmon with Sweet Potato Puree', name_ar = 'سمك السلمون المشوي مع هريس البطاطا الحلوة', description = 'Butter Grill Salmon, with Exotic Vegetables, & Sweet Potato Puree', description_ar = 'سمك السلمون المشوي بالزبدة، مع خضراوات غريبة، وهريس البطاطا الحلوة',
      price = 75, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/da88d8ff-b10c-42df-8b8a-510a7a7a9bbe/conversions/blob-optimized.jpg', tags = array['New']::text[], sort_order = 70, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97332' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'KIDS MENU', 'قائمة طعام الأطفال', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/1691c3ed-9eca-4565-9a94-2cfb1dfd240e/conversions/blob-small.jpg', 90, 'kitchen', 'apetito:97332') returning id into v_cat;
  else
    update menu_categories set name = 'KIDS MENU', name_ar = 'قائمة طعام الأطفال', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/1691c3ed-9eca-4565-9a94-2cfb1dfd240e/conversions/blob-small.jpg', sort_order = 90, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250115' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Alfredo Penne Pasta Kids', 'معكرونة ألفريدو بيني للأطفال', 'Penne pasta tossed in creamy Alfredo sauce with parmesan cheese.', 'معكرونة بيني ممزوجة بصلصة ألفريدو الكريمية مع جبن البارميزان.', 19, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/16a0955d-daf5-4c3f-8334-c80a9aa63751/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:250115', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Alfredo Penne Pasta Kids', name_ar = 'معكرونة ألفريدو بيني للأطفال', description = 'Penne pasta tossed in creamy Alfredo sauce with parmesan cheese.', description_ar = 'معكرونة بيني ممزوجة بصلصة ألفريدو الكريمية مع جبن البارميزان.',
      price = 19, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/16a0955d-daf5-4c3f-8334-c80a9aa63751/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250116' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Classic Beef Slider Kids', 'ساندوتش لحم بقري كلاسيكي للأطفال', 'One beef slider with melted cheese, served with fries & ketchup.', 'شطيرة لحم بقري مع جبن ذائب، تقدم مع البطاطس المقلية والكاتشب.', 20, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3f66b4d7-359b-41a2-9ac6-0c369b607051/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:250116', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Classic Beef Slider Kids', name_ar = 'ساندوتش لحم بقري كلاسيكي للأطفال', description = 'One beef slider with melted cheese, served with fries & ketchup.', description_ar = 'شطيرة لحم بقري مع جبن ذائب، تقدم مع البطاطس المقلية والكاتشب.',
      price = 20, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3f66b4d7-359b-41a2-9ac6-0c369b607051/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250117' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Classic Chicken Slider Kids', 'ساندوتش دجاج كلاسيكي للأطفال', 'One crispy chicken slider with melted cheese, served with fries & ketchup.', 'قطعة واحدة من ساندوتش الدجاج المقرمش مع الجبن الذائب، تقدم مع البطاطس المقلية والكاتشب.', 16, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f20576e6-1786-4cda-8081-e379af770d10/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:250117', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Classic Chicken Slider Kids', name_ar = 'ساندوتش دجاج كلاسيكي للأطفال', description = 'One crispy chicken slider with melted cheese, served with fries & ketchup.', description_ar = 'قطعة واحدة من ساندوتش الدجاج المقرمش مع الجبن الذائب، تقدم مع البطاطس المقلية والكاتشب.',
      price = 16, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f20576e6-1786-4cda-8081-e379af770d10/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250118' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Crispy Chicken Tenders and Fries Kids', 'قطع دجاج مقرمشة مع بطاطس مقلية للأطفال', 'Crispy chicken tenders served with fries & ketchup.', 'قطع دجاج مقرمشة تقدم مع البطاطس المقلية والكاتشب.', 19, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d57039a8-f4f1-4c5e-b549-97afb5c3746f/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:250118', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Crispy Chicken Tenders and Fries Kids', name_ar = 'قطع دجاج مقرمشة مع بطاطس مقلية للأطفال', description = 'Crispy chicken tenders served with fries & ketchup.', description_ar = 'قطع دجاج مقرمشة تقدم مع البطاطس المقلية والكاتشب.',
      price = 19, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d57039a8-f4f1-4c5e-b549-97afb5c3746f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250119' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Toasted Cheese Melt Kids', 'جبن محمص للأطفال', 'Toasted sandwich with melted cheese, served with fries & ketchup.', 'ساندويتش محمص مع الجبن الذائب، يقدم مع البطاطس المقلية والكاتشب.', 16, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/da9eb91a-a410-4ac6-8e63-50ee3260ce9c/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:250119', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Toasted Cheese Melt Kids', name_ar = 'جبن محمص للأطفال', description = 'Toasted sandwich with melted cheese, served with fries & ketchup.', description_ar = 'ساندويتش محمص مع الجبن الذائب، يقدم مع البطاطس المقلية والكاتشب.',
      price = 16, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/da9eb91a-a410-4ac6-8e63-50ee3260ce9c/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250120' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Mac and Cheese', 'المعكرونة والجبن', 'Creamy macaroni pasta baked with melted cheese.', 'معكرونة كريمية مخبوزة مع الجبن المذاب.', 19, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/a0baf295-0ff3-4cb2-9c84-0406f09b0a2f/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:250120', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Mac and Cheese', name_ar = 'المعكرونة والجبن', description = 'Creamy macaroni pasta baked with melted cheese.', description_ar = 'معكرونة كريمية مخبوزة مع الجبن المذاب.',
      price = 19, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/a0baf295-0ff3-4cb2-9c84-0406f09b0a2f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97333' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'BAKERY', 'مخبز', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ea71bc1f-f13d-48b2-8b1e-3ab5bc059251/conversions/blob-small.jpg', 100, 'kitchen', 'apetito:97333') returning id into v_cat;
  else
    update menu_categories set name = 'BAKERY', name_ar = 'مخبز', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ea71bc1f-f13d-48b2-8b1e-3ab5bc059251/conversions/blob-small.jpg', sort_order = 100, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250121' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Bread Basket', 'سلة الخبز', 'Slices of multigrain and turmeric sourdough, cut and served warm.', 'شرائح من الخبز المخمر متعدد الحبوب والكركم، مقطعة ومقدمة دافئة.', 25, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/08c8e500-a4e7-4ded-93a0-550130e0a8d6/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:250121', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Bread Basket', name_ar = 'سلة الخبز', description = 'Slices of multigrain and turmeric sourdough, cut and served warm.', description_ar = 'شرائح من الخبز المخمر متعدد الحبوب والكركم، مقطعة ومقدمة دافئة.',
      price = 25, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/08c8e500-a4e7-4ded-93a0-550130e0a8d6/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250122' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Almond Croissant', 'كرواسون اللوز', 'Buttery croissant filled with almond cream and topped with toasted almond flakes.', 'كرواسون زبداني محشو بكريمة اللوز ومغطى برقائق اللوز المحمصة.', 17, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c4e6967c-cada-491a-b541-59635b40cbb3/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:250122', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Almond Croissant', name_ar = 'كرواسون اللوز', description = 'Buttery croissant filled with almond cream and topped with toasted almond flakes.', description_ar = 'كرواسون زبداني محشو بكريمة اللوز ومغطى برقائق اللوز المحمصة.',
      price = 17, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c4e6967c-cada-491a-b541-59635b40cbb3/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250123' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Cheese Croissant', 'كرواسون الجبن', 'Buttery croissant filled with a blend of three cheeses.', 'كرواسون زبداني محشو بمزيج من ثلاثة أنواع من الجبن.', 17, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/039170fb-4059-4d29-87ba-917dde1ef962/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:250123', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Cheese Croissant', name_ar = 'كرواسون الجبن', description = 'Buttery croissant filled with a blend of three cheeses.', description_ar = 'كرواسون زبداني محشو بمزيج من ثلاثة أنواع من الجبن.',
      price = 17, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/039170fb-4059-4d29-87ba-917dde1ef962/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250124' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Butter Croissant', 'كرواسون الزبدة', 'Freshly baked, classic French butter croissant.', 'كرواسون الزبدة الفرنسي الكلاسيكي الطازج.', 13, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d3d36ada-6c7c-4afd-99b7-3701f32caa32/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:250124', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Butter Croissant', name_ar = 'كرواسون الزبدة', description = 'Freshly baked, classic French butter croissant.', description_ar = 'كرواسون الزبدة الفرنسي الكلاسيكي الطازج.',
      price = 13, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d3d36ada-6c7c-4afd-99b7-3701f32caa32/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250125' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Pain Au Chocolate', 'خبز الشوكولاتة', 'Flaky French pastry filled with rich chocolate.', 'معجنات فرنسية متقشرة محشوة بالشوكولاتة الغنية.', 17, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b5f9f495-fbea-468c-86d6-23e8c2a472d6/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:250125', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Pain Au Chocolate', name_ar = 'خبز الشوكولاتة', description = 'Flaky French pastry filled with rich chocolate.', description_ar = 'معجنات فرنسية متقشرة محشوة بالشوكولاتة الغنية.',
      price = 17, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b5f9f495-fbea-468c-86d6-23e8c2a472d6/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97335' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'CHOCOBERRY TREATS', 'حلوى الشوكولاتة والتوت', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/218ce8c3-6297-4ea0-a050-8603ff6193b6/conversions/1bce941a132252916b0e4ba3a915afd1-thumbnail.jpg', 110, 'kitchen', 'apetito:97335') returning id into v_cat;
  else
    update menu_categories set name = 'CHOCOBERRY TREATS', name_ar = 'حلوى الشوكولاتة والتوت', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/218ce8c3-6297-4ea0-a050-8603ff6193b6/conversions/1bce941a132252916b0e4ba3a915afd1-thumbnail.jpg', sort_order = 110, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250145' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Waffle Bites', 'قطع الوافل', 'Freshly Baked Belgian Waffle, White Chocolate & Milk Chocolate', 'وافل بلجيكي طازج، شوكولاتة بيضاء وشوكولاتة بالحليب', 69, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/218ce8c3-6297-4ea0-a050-8603ff6193b6/conversions/1bce941a132252916b0e4ba3a915afd1-optimized.jpg', '{}'::text[], 10, 'apetito:250145', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Waffle Bites', name_ar = 'قطع الوافل', description = 'Freshly Baked Belgian Waffle, White Chocolate & Milk Chocolate', description_ar = 'وافل بلجيكي طازج، شوكولاتة بيضاء وشوكولاتة بالحليب',
      price = 69, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/218ce8c3-6297-4ea0-a050-8603ff6193b6/conversions/1bce941a132252916b0e4ba3a915afd1-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250148' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chocolate Chip Cookie Dough', 'عجينة كوكيز رقائق الشوكولاتة', 'Choco Chip WhoaCookie Dough, Chocolate Chips, Melted Milk Chocolate', 'عجينة كوكيز رقائق الشوكولاتة، رقائق الشوكولاتة، شوكولاتة الحليب المذابة', 49, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9b98b2c6-f37a-4fcc-8c3a-feab08de315a/conversions/cd3826899042ea901e48d228e0c739a4-optimized.jpg', '{}'::text[], 20, 'apetito:250148', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chocolate Chip Cookie Dough', name_ar = 'عجينة كوكيز رقائق الشوكولاتة', description = 'Choco Chip WhoaCookie Dough, Chocolate Chips, Melted Milk Chocolate', description_ar = 'عجينة كوكيز رقائق الشوكولاتة، رقائق الشوكولاتة، شوكولاتة الحليب المذابة',
      price = 49, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9b98b2c6-f37a-4fcc-8c3a-feab08de315a/conversions/cd3826899042ea901e48d228e0c739a4-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250149' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'White Chocolate Chip Cookie Dough', 'عجينة كوكيز رقائق الشوكولاتة البيضاء', 'Cookie Dough, White Chocolate Chips, Melted White Chocolate', 'عجينة الكوكيز، رقائق الشوكولاتة البيضاء، الشوكولاتة البيضاء المذابة', 49, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e6f14389-0df4-44d9-995e-dcf9eea374bf/conversions/0c437ba298c01bfc49e4a4cea5f483e0-optimized.jpg', '{}'::text[], 30, 'apetito:250149', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'White Chocolate Chip Cookie Dough', name_ar = 'عجينة كوكيز رقائق الشوكولاتة البيضاء', description = 'Cookie Dough, White Chocolate Chips, Melted White Chocolate', description_ar = 'عجينة الكوكيز، رقائق الشوكولاتة البيضاء، الشوكولاتة البيضاء المذابة',
      price = 49, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e6f14389-0df4-44d9-995e-dcf9eea374bf/conversions/0c437ba298c01bfc49e4a4cea5f483e0-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250155' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chocolate Covered Strawberries Selection', 'تشكيلة من الفراولة المغطاة بالشوكولاتة', 'Selection Of Fresh Strawberries Dipped Finest Chocolate Dark, Milk, White, Rose', 'تشكيلة من الفراولة الطازجة المغطسة بأفخر أنواع الشوكولاتة: الداكنة، والحليب، والبيضاء، والوردية', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b2923b0b-4f95-45bc-bb14-c36e1dcdd695/conversions/a9cfd89a17f20662eb702b567b5c0dc7-optimized.jpg', '{}'::text[], 40, 'apetito:250155', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chocolate Covered Strawberries Selection', name_ar = 'تشكيلة من الفراولة المغطاة بالشوكولاتة', description = 'Selection Of Fresh Strawberries Dipped Finest Chocolate Dark, Milk, White, Rose', description_ar = 'تشكيلة من الفراولة الطازجة المغطسة بأفخر أنواع الشوكولاتة: الداكنة، والحليب، والبيضاء، والوردية',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b2923b0b-4f95-45bc-bb14-c36e1dcdd695/conversions/a9cfd89a17f20662eb702b567b5c0dc7-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250154' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Berrylicious Choco-Cup', 'كوب شوكولاتة بالتوت اللذيذ', null, null, 75, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/64173459-dd4d-4587-99b8-18e39a4344cd/conversions/compressed-chatgpt-image-feb-27-2026-10-42-47-am-optimized.jpg', '{}'::text[], 50, 'apetito:250154', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Berrylicious Choco-Cup', name_ar = 'كوب شوكولاتة بالتوت اللذيذ', description = null, description_ar = null,
      price = 75, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/64173459-dd4d-4587-99b8-18e39a4344cd/conversions/compressed-chatgpt-image-feb-27-2026-10-42-47-am-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97336' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'SIGNATURE MATCHAS', 'أعواد الثقاب المميزة', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b792201f-cc5b-4995-89c1-5ab8cc25ae68/conversions/blob-small.jpg', 120, 'kitchen', 'apetito:97336') returning id into v_cat;
  else
    update menu_categories set name = 'SIGNATURE MATCHAS', name_ar = 'أعواد الثقاب المميزة', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b792201f-cc5b-4995-89c1-5ab8cc25ae68/conversions/blob-small.jpg', sort_order = 120, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250157' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced Blueberry Marble Matcha', 'ماتشا بنكهة التوت الأزرق المثلجة', null, null, 35, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/cc3c6c69-f115-4b45-8344-965528f751f3/conversions/compressed-blueberry-matcha-optimized.jpg', '{}'::text[], 10, 'apetito:250157', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced Blueberry Marble Matcha', name_ar = 'ماتشا بنكهة التوت الأزرق المثلجة', description = null, description_ar = null,
      price = 35, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/cc3c6c69-f115-4b45-8344-965528f751f3/conversions/compressed-blueberry-matcha-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250158' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced Strawberry Matcha', 'ماتشا الفراولة المثلجة', 'Ice Matcha latte with strawberry foam', 'لاتيه ماتشا مثلج مع رغوة الفراولة', 35, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/166d75b5-c267-4d33-82b7-be4a252ebdff/conversions/compressed-strawberry-matcha-optimized.jpg', '{}'::text[], 20, 'apetito:250158', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced Strawberry Matcha', name_ar = 'ماتشا الفراولة المثلجة', description = 'Ice Matcha latte with strawberry foam', description_ar = 'لاتيه ماتشا مثلج مع رغوة الفراولة',
      price = 35, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/166d75b5-c267-4d33-82b7-be4a252ebdff/conversions/compressed-strawberry-matcha-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250159' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced Mango Matcha', 'مانجو ماتشا مثلجة', 'Mango Matcha', 'مانجو ماتشا', 35, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/93c13a2d-8e01-42ec-966a-7ebf8ba1ad2d/conversions/compressed-mango-matcha-optimized.jpg', '{}'::text[], 30, 'apetito:250159', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced Mango Matcha', name_ar = 'مانجو ماتشا مثلجة', description = 'Mango Matcha', description_ar = 'مانجو ماتشا',
      price = 35, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/93c13a2d-8e01-42ec-966a-7ebf8ba1ad2d/conversions/compressed-mango-matcha-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250160' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Matcha Latte', 'ماتشا لاتيه', 'Matcha Latte', 'ماتشا لاتيه', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ccc3e596-6dc6-45fc-9f75-e9502e4f150d/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:250160', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Matcha Latte', name_ar = 'ماتشا لاتيه', description = 'Matcha Latte', description_ar = 'ماتشا لاتيه',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ccc3e596-6dc6-45fc-9f75-e9502e4f150d/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250161' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced Matcha Latte', 'لاتيه ماتشا مثلج', 'Refreshing chilled matcha with milk.', 'الماتشا المثلج المنعش مع الحليب.', 30, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/733cb45b-73f5-4576-b0b9-5ff7e4107827/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:250161', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced Matcha Latte', name_ar = 'لاتيه ماتشا مثلج', description = 'Refreshing chilled matcha with milk.', description_ar = 'الماتشا المثلج المنعش مع الحليب.',
      price = 30, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/733cb45b-73f5-4576-b0b9-5ff7e4107827/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250162' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Ice Matcha Latte With Salted Vanila', 'لاتيه ماتشا مثلج مع فانيليا مملحة', 'Indulge In The Perfect Harmony Of Sweet And Salty: Salted Caramel Mocha Bliss Double Espresso, Steamed Milk, Salted Caramel Sauce, Fresh Cream', 'استمتع بتناغم مثالي بين الحلاوة والملوحة: موكا الكراميل المملح، قهوة إسبريسو مزدوجة، حليب مبخر، صلصة الكراميل المملح، كريمة طازجة', 33, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ca99636f-190c-4a4a-81a7-b7cee87fd5dc/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:250162', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Ice Matcha Latte With Salted Vanila', name_ar = 'لاتيه ماتشا مثلج مع فانيليا مملحة', description = 'Indulge In The Perfect Harmony Of Sweet And Salty: Salted Caramel Mocha Bliss Double Espresso, Steamed Milk, Salted Caramel Sauce, Fresh Cream', description_ar = 'استمتع بتناغم مثالي بين الحلاوة والملوحة: موكا الكراميل المملح، قهوة إسبريسو مزدوجة، حليب مبخر، صلصة الكراميل المملح، كريمة طازجة',
      price = 33, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ca99636f-190c-4a4a-81a7-b7cee87fd5dc/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97337' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'SIGNATURE COFFEE', 'قهوة مميزة', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/1d06fe69-0bf7-4134-94c5-6cdc711f88e0/conversions/blob-small.jpg', 130, 'kitchen', 'apetito:97337') returning id into v_cat;
  else
    update menu_categories set name = 'SIGNATURE COFFEE', name_ar = 'قهوة مميزة', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/1d06fe69-0bf7-4134-94c5-6cdc711f88e0/conversions/blob-small.jpg', sort_order = 130, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250163' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Spanish Latte', 'لاتيه إسباني', 'Double Espresso, Steamed Milk, Condensed Milk', 'إسبريسو مزدوج، حليب مبخر، حليب مكثف', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/6b8be8cc-1bdc-4f8b-8f8b-414c0e0ddf85/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:250163', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Spanish Latte', name_ar = 'لاتيه إسباني', description = 'Double Espresso, Steamed Milk, Condensed Milk', description_ar = 'إسبريسو مزدوج، حليب مبخر، حليب مكثف',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/6b8be8cc-1bdc-4f8b-8f8b-414c0e0ddf85/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250164' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Mocha', 'موكا', 'Indulge in the Rich Harmony of Chocolate of Double Espresso, Steamed Milk, Dark Chocolate Sauce, Fresh Cream', 'استمتع بالتناغم الغني بين شوكولاتة الإسبريسو المزدوج والحليب المبخر وصلصة الشوكولاتة الداكنة والكريمة الطازجة', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/44af2a45-c15c-45bd-a1a2-e4fb568659da/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:250164', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Mocha', name_ar = 'موكا', description = 'Indulge in the Rich Harmony of Chocolate of Double Espresso, Steamed Milk, Dark Chocolate Sauce, Fresh Cream', description_ar = 'استمتع بالتناغم الغني بين شوكولاتة الإسبريسو المزدوج والحليب المبخر وصلصة الشوكولاتة الداكنة والكريمة الطازجة',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/44af2a45-c15c-45bd-a1a2-e4fb568659da/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250165' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Salted Caramel Latte', 'لاتيه الكراميل المملح', 'Latte infused with caramel and a touch of sea salt.', 'لاتيه مع الكراميل مع لمسة من ملح البحر.', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b061d44b-4f84-4f27-8598-c678d33c4241/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:250165', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Salted Caramel Latte', name_ar = 'لاتيه الكراميل المملح', description = 'Latte infused with caramel and a touch of sea salt.', description_ar = 'لاتيه مع الكراميل مع لمسة من ملح البحر.',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b061d44b-4f84-4f27-8598-c678d33c4241/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250166' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'White Mocha', 'موكا بيضاء', 'Espresso with white chocolate and silky steamed milk.', 'إسبرسو مع الشوكولاتة البيضاء والحليب المبخر الحريري.', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/10ebbcdf-2111-40ec-89c1-bffca870309e/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:250166', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'White Mocha', name_ar = 'موكا بيضاء', description = 'Espresso with white chocolate and silky steamed milk.', description_ar = 'إسبرسو مع الشوكولاتة البيضاء والحليب المبخر الحريري.',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/10ebbcdf-2111-40ec-89c1-bffca870309e/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250167' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Qahwa', 'قهوة', 'Traditional Arabic coffee with cardamom & spices.', 'القهوة العربية التقليدية مع الهيل والتوابل.', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/54bcf41b-156f-4b8c-aee1-f651cb21b5a2/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:250167', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Qahwa', name_ar = 'قهوة', description = 'Traditional Arabic coffee with cardamom & spices.', description_ar = 'القهوة العربية التقليدية مع الهيل والتوابل.',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/54bcf41b-156f-4b8c-aee1-f651cb21b5a2/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250168' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Saudi Qahwa', 'القهوة السعودية', null, null, 28, null, '{}'::text[], 60, 'apetito:250168', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Saudi Qahwa', name_ar = 'القهوة السعودية', description = null, description_ar = null,
      price = 28, image_url = null, tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250169' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Turkish Coffee', 'القهوة التركية', 'Strong, aromatic coffee brewed the authentic way.', 'قهوة قوية وعطرية تم تحضيرها بالطريقة الأصيلة.', 26, null, '{}'::text[], 70, 'apetito:250169', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Turkish Coffee', name_ar = 'القهوة التركية', description = 'Strong, aromatic coffee brewed the authentic way.', description_ar = 'قهوة قوية وعطرية تم تحضيرها بالطريقة الأصيلة.',
      price = 26, image_url = null, tags = '{}'::text[], sort_order = 70, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250170' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'V60', 'V60', 'Chilled, slow-brewed pour-over served over ice.', 'مشروب بارد يتم تحضيره ببطء ويتم تقديمه مع الثلج.', 34, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/78c54c51-8519-4ffb-986c-19f416697926/conversions/blob-optimized.jpg', '{}'::text[], 80, 'apetito:250170', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'V60', name_ar = 'V60', description = 'Chilled, slow-brewed pour-over served over ice.', description_ar = 'مشروب بارد يتم تحضيره ببطء ويتم تقديمه مع الثلج.',
      price = 34, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/78c54c51-8519-4ffb-986c-19f416697926/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 80, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97338' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'COFFEE', 'قهوة', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/6d7235d2-a63b-4d06-bec0-b1c0b3047b79/conversions/blob-small.jpg', 140, 'kitchen', 'apetito:97338') returning id into v_cat;
  else
    update menu_categories set name = 'COFFEE', name_ar = 'قهوة', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/6d7235d2-a63b-4d06-bec0-b1c0b3047b79/conversions/blob-small.jpg', sort_order = 140, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250171' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Espresso', 'إسبرسو', 'Single Origin Arabica Beans', 'حبوب أرابيكا ذات المنشأ الواحد', 18, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/36b8f725-5989-4466-b3e5-4083e2f7aed3/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:250171', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Espresso', name_ar = 'إسبرسو', description = 'Single Origin Arabica Beans', description_ar = 'حبوب أرابيكا ذات المنشأ الواحد',
      price = 18, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/36b8f725-5989-4466-b3e5-4083e2f7aed3/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250172' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Espresso Macchiato', 'إسبرسو ماكياتو', 'A Perfect Dance of Bold and Smooth -- Espresso Macchiato Magic in Every single sip Origin Arabica Beans, Milk Foam', 'رقصة مثالية من الجرأة والنعومة - سحر الإسبريسو ماكياتو في كل رشفة حبوب أرابيكا الأصلية، رغوة الحليب', 23, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/39eab791-eed2-4f76-b12e-e1a58f8330f4/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:250172', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Espresso Macchiato', name_ar = 'إسبرسو ماكياتو', description = 'A Perfect Dance of Bold and Smooth -- Espresso Macchiato Magic in Every single sip Origin Arabica Beans, Milk Foam', description_ar = 'رقصة مثالية من الجرأة والنعومة - سحر الإسبريسو ماكياتو في كل رشفة حبوب أرابيكا الأصلية، رغوة الحليب',
      price = 23, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/39eab791-eed2-4f76-b12e-e1a58f8330f4/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250173' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Hot Chocolate', 'شكولاته ساخنة', null, null, 34, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e1bf7386-e956-4c21-a32a-08273bfb6f35/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:250173', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Hot Chocolate', name_ar = 'شكولاته ساخنة', description = null, description_ar = null,
      price = 34, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e1bf7386-e956-4c21-a32a-08273bfb6f35/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250174' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Americano', 'أمريكانو', null, null, 24, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/97e5738a-2200-4c95-916d-9b717196c021/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:250174', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Americano', name_ar = 'أمريكانو', description = null, description_ar = null,
      price = 24, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/97e5738a-2200-4c95-916d-9b717196c021/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250175' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Caffe Latte', 'كافيه لاتيه', 'Embrace The Creamy Bliss Of Every Caffe Latte Single Espresso, Steamed Milk', 'استمتع بالنكهة الكريمية لكل قهوة لاتيه مع إسبريسو واحد وحليب مبخر', 24, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/4935b9cc-e469-4a81-ba03-a3fefc431d1f/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:250175', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Caffe Latte', name_ar = 'كافيه لاتيه', description = 'Embrace The Creamy Bliss Of Every Caffe Latte Single Espresso, Steamed Milk', description_ar = 'استمتع بالنكهة الكريمية لكل قهوة لاتيه مع إسبريسو واحد وحليب مبخر',
      price = 24, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/4935b9cc-e469-4a81-ba03-a3fefc431d1f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250176' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Cappuccino', 'كابتشينو', 'ingle Espresso, Foamed Steamed Milk', 'إنجل إسبريسو، حليب مبخر رغوي', 24, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/15bc23d9-f0d1-4de4-9846-1bbecaa05ae7/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:250176', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Cappuccino', name_ar = 'كابتشينو', description = 'ingle Espresso, Foamed Steamed Milk', description_ar = 'إنجل إسبريسو، حليب مبخر رغوي',
      price = 24, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/15bc23d9-f0d1-4de4-9846-1bbecaa05ae7/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250177' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Flat White', 'فلات وايت', 'Elegance In Every Sip -- Flat White Coffee PerfectiontteDouble Espresso, Steamed Milk', 'أناقة في كل رشفة - قهوة فلات وايت المثالية، إسبرسو مزدوج، حليب مبخر', 24, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/cd10656a-de33-4789-9519-a7bb78c9cf1f/conversions/blob-optimized.jpg', '{}'::text[], 70, 'apetito:250177', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Flat White', name_ar = 'فلات وايت', description = 'Elegance In Every Sip -- Flat White Coffee PerfectiontteDouble Espresso, Steamed Milk', description_ar = 'أناقة في كل رشفة - قهوة فلات وايت المثالية، إسبرسو مزدوج، حليب مبخر',
      price = 24, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/cd10656a-de33-4789-9519-a7bb78c9cf1f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 70, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250178' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Piccolo Latte', 'بيكولو لاتيه', 'Single Espresso, Steamed Milk', 'إسبرسو فردي، حليب مبخر', 23, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/2a6e4b36-253d-48c2-b896-3790171381a8/conversions/blob-optimized.jpg', '{}'::text[], 80, 'apetito:250178', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Piccolo Latte', name_ar = 'بيكولو لاتيه', description = 'Single Espresso, Steamed Milk', description_ar = 'إسبرسو فردي، حليب مبخر',
      price = 23, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/2a6e4b36-253d-48c2-b896-3790171381a8/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 80, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250179' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Cortado latte', 'كورتادو لاتيه', 'A Perfect Harmony of espresso and foam -- The Cortado Late BlissDouble Espresso, Steamed Milk', 'تناغم مثالي بين الإسبريسو والرغوة - كورتادو ليت بليس، إسبريسو مزدوج، حليب مبخر', 24, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d596bb8d-23b4-4f91-a6bf-1fa037e08485/conversions/blob-optimized.jpg', '{}'::text[], 90, 'apetito:250179', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Cortado latte', name_ar = 'كورتادو لاتيه', description = 'A Perfect Harmony of espresso and foam -- The Cortado Late BlissDouble Espresso, Steamed Milk', description_ar = 'تناغم مثالي بين الإسبريسو والرغوة - كورتادو ليت بليس، إسبريسو مزدوج، حليب مبخر',
      price = 24, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d596bb8d-23b4-4f91-a6bf-1fa037e08485/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 90, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97340' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'COLD COFFEE', 'قهوة باردة', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/36b89d97-827c-43cc-b835-da8c31942191/conversions/blob-small.jpg', 150, 'kitchen', 'apetito:97340') returning id into v_cat;
  else
    update menu_categories set name = 'COLD COFFEE', name_ar = 'قهوة باردة', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/36b89d97-827c-43cc-b835-da8c31942191/conversions/blob-small.jpg', sort_order = 150, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250187' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced Latte', 'لاتيه مثلج', 'Chill with Every Sip: The Perfect Iced Latte Double Expresso, Cold Foamed Milk', 'استرخِ مع كل رشفة: لاتيه مثلج مثالي، دبل إكسبرسو، حليب رغوي بارد', 24, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d08a3b98-1080-4711-a52f-9232ec9d35be/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:250187', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced Latte', name_ar = 'لاتيه مثلج', description = 'Chill with Every Sip: The Perfect Iced Latte Double Expresso, Cold Foamed Milk', description_ar = 'استرخِ مع كل رشفة: لاتيه مثلج مثالي، دبل إكسبرسو، حليب رغوي بارد',
      price = 24, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d08a3b98-1080-4711-a52f-9232ec9d35be/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250188' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced Spanish Latte', 'لاتيه إسباني مثلج', 'Double Espresso, Cold Foamed Milk, Condense Milk', 'إسبريسو مزدوج، حليب رغوي بارد، حليب مكثف', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/45582350-923a-4651-a599-6a58725af2d0/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:250188', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced Spanish Latte', name_ar = 'لاتيه إسباني مثلج', description = 'Double Espresso, Cold Foamed Milk, Condense Milk', description_ar = 'إسبريسو مزدوج، حليب رغوي بارد، حليب مكثف',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/45582350-923a-4651-a599-6a58725af2d0/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250189' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced Mocha', 'موكا مثلجة', 'Chill Out With A Dreamy Iced Mocha Double Espresso, Cold Foamed Milk, Dark Chocolate Sauce, Cream', 'استرخِ مع موكا مثلج حالم مع إسبريسو مزدوج، حليب رغوي بارد، صلصة شوكولاتة داكنة، كريمة', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3f64c202-2628-4817-8361-d7f2d9ea0cbe/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:250189', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced Mocha', name_ar = 'موكا مثلجة', description = 'Chill Out With A Dreamy Iced Mocha Double Espresso, Cold Foamed Milk, Dark Chocolate Sauce, Cream', description_ar = 'استرخِ مع موكا مثلج حالم مع إسبريسو مزدوج، حليب رغوي بارد، صلصة شوكولاتة داكنة، كريمة',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3f64c202-2628-4817-8361-d7f2d9ea0cbe/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250190' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced American', 'مثلج أمريكي', 'Chill Out With Our Refreshing Iced American Delight Double Espresso, Iced Water', 'استمتع بالاسترخاء مع قهوتنا الأمريكية المثلجة المنعشة دبل إسبريسو، مع الماء المثلج', 24, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/31fa10b4-6562-4dac-8b02-257cf895af82/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:250190', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced American', name_ar = 'مثلج أمريكي', description = 'Chill Out With Our Refreshing Iced American Delight Double Espresso, Iced Water', description_ar = 'استمتع بالاسترخاء مع قهوتنا الأمريكية المثلجة المنعشة دبل إسبريسو، مع الماء المثلج',
      price = 24, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/31fa10b4-6562-4dac-8b02-257cf895af82/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97342' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'TEAS', 'الشاي', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c965e92a-96ea-434b-bafc-cbd67d679be4/conversions/compressed-chatgpt-image-apr-22-2026-03-31-36-pm-small.jpg', 160, 'kitchen', 'apetito:97342') returning id into v_cat;
  else
    update menu_categories set name = 'TEAS', name_ar = 'الشاي', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c965e92a-96ea-434b-bafc-cbd67d679be4/conversions/compressed-chatgpt-image-apr-22-2026-03-31-36-pm-small.jpg', sort_order = 160, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250195' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Organic English Breakfast', 'إفطار إنجليزي عضوي', 'Full-bodied, traditional black tea.', 'شاي أسود تقليدي كامل القوام.', 25, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/bbb3c561-9084-4f1b-a070-c105d1b7f924/conversions/compressed-chatgpt-image-apr-22-2026-03-26-29-pm-optimized.jpg', '{}'::text[], 10, 'apetito:250195', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Organic English Breakfast', name_ar = 'إفطار إنجليزي عضوي', description = 'Full-bodied, traditional black tea.', description_ar = 'شاي أسود تقليدي كامل القوام.',
      price = 25, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/bbb3c561-9084-4f1b-a070-c105d1b7f924/conversions/compressed-chatgpt-image-apr-22-2026-03-26-29-pm-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250196' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Organic Green Tea', 'شاي أخضر عضوي', 'Smooth, light & refreshing green tea.', 'شاي أخضر ناعم وخفيف ومنعش.', 27, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/49a15346-47b8-4b6d-9c11-d18b7ed324aa/conversions/compressed-chatgpt-image-apr-22-2026-03-22-03-pm-optimized.jpg', '{}'::text[], 20, 'apetito:250196', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Organic Green Tea', name_ar = 'شاي أخضر عضوي', description = 'Smooth, light & refreshing green tea.', description_ar = 'شاي أخضر ناعم وخفيف ومنعش.',
      price = 27, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/49a15346-47b8-4b6d-9c11-d18b7ed324aa/conversions/compressed-chatgpt-image-apr-22-2026-03-22-03-pm-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250197' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Moroccan Tea', 'الشاي المغربي', 'Refreshing green tea with fresh mint & sweetness.', 'شاي أخضر منعش بنكهة النعناع الطازج والحلاوة.', 27, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e8764bfc-6f89-4ab6-9576-9385d95aabb5/conversions/compressed-chatgpt-image-apr-22-2026-03-33-12-pm-optimized.jpg', '{}'::text[], 30, 'apetito:250197', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Moroccan Tea', name_ar = 'الشاي المغربي', description = 'Refreshing green tea with fresh mint & sweetness.', description_ar = 'شاي أخضر منعش بنكهة النعناع الطازج والحلاوة.',
      price = 27, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e8764bfc-6f89-4ab6-9576-9385d95aabb5/conversions/compressed-chatgpt-image-apr-22-2026-03-33-12-pm-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250198' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Organic Chamomile', 'البابونج العضوي', 'Gentle, calming herbal tea.', 'شاي أعشاب لطيف ومهدئ.', 27, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/67ece08a-2d65-4003-8615-d4a14628b347/conversions/compressed-chatgpt-image-apr-22-2026-03-43-59-pm-optimized.jpg', '{}'::text[], 40, 'apetito:250198', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Organic Chamomile', name_ar = 'البابونج العضوي', description = 'Gentle, calming herbal tea.', description_ar = 'شاي أعشاب لطيف ومهدئ.',
      price = 27, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/67ece08a-2d65-4003-8615-d4a14628b347/conversions/compressed-chatgpt-image-apr-22-2026-03-43-59-pm-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250199' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Organic Earl Grey', 'شاي إيرل جراي عضوي', 'Fragrant saffron tea with a touch of rose honey.', 'شاي الزعفران العطري مع لمسة من عسل الورد.', 27, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/12712609-4dad-498b-bffe-d96afa0436a9/conversions/compressed-chatgpt-image-apr-22-2026-03-23-57-pm-optimized.jpg', '{}'::text[], 50, 'apetito:250199', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Organic Earl Grey', name_ar = 'شاي إيرل جراي عضوي', description = 'Fragrant saffron tea with a touch of rose honey.', description_ar = 'شاي الزعفران العطري مع لمسة من عسل الورد.',
      price = 27, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/12712609-4dad-498b-bffe-d96afa0436a9/conversions/compressed-chatgpt-image-apr-22-2026-03-23-57-pm-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250200' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Almond Coconut Tea', 'شاي اللوز وجوز الهند', null, null, 27, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e9ecb128-a0ca-4359-817d-ddf084777846/conversions/compressed-chatgpt-image-apr-22-2026-03-29-41-pm-optimized.jpg', '{}'::text[], 60, 'apetito:250200', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Almond Coconut Tea', name_ar = 'شاي اللوز وجوز الهند', description = null, description_ar = null,
      price = 27, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e9ecb128-a0ca-4359-817d-ddf084777846/conversions/compressed-chatgpt-image-apr-22-2026-03-29-41-pm-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250201' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Hibiscus Tea', 'شاي الكركديه', null, null, 29, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/da19da52-dff8-4bc8-af2d-1be368c7f4e3/conversions/compressed-chatgpt-image-apr-22-2026-03-31-36-pm-optimized.jpg', '{}'::text[], 70, 'apetito:250201', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Hibiscus Tea', name_ar = 'شاي الكركديه', description = null, description_ar = null,
      price = 29, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/da19da52-dff8-4bc8-af2d-1be368c7f4e3/conversions/compressed-chatgpt-image-apr-22-2026-03-31-36-pm-optimized.jpg', tags = '{}'::text[], sort_order = 70, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97343' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'MOCKTAILS', 'الكوكتيلات غير الكحولية', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/1333024d-7018-4f9f-a45c-8cc54981a8d5/conversions/blob-thumbnail.jpg', 170, 'kitchen', 'apetito:97343') returning id into v_cat;
  else
    update menu_categories set name = 'MOCKTAILS', name_ar = 'الكوكتيلات غير الكحولية', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/1333024d-7018-4f9f-a45c-8cc54981a8d5/conversions/blob-thumbnail.jpg', sort_order = 170, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250203' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Blue Tropical Mojito', 'موخيتو استوائي أزرق', 'Escape to Paradise with Every Sip of Our Blue Tropical Mojito. Lime Juice, Blue Curacao, Soda Water, Smoked Lemon Syrup', 'انطلق إلى عالمٍ من النعيم مع كل رشفة من موهيتو بلو تروبيكال. عصير ليمون، بلو كوراساو، مياه غازية، وشراب ليمون مدخن.', 35, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/1333024d-7018-4f9f-a45c-8cc54981a8d5/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:250203', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Blue Tropical Mojito', name_ar = 'موخيتو استوائي أزرق', description = 'Escape to Paradise with Every Sip of Our Blue Tropical Mojito. Lime Juice, Blue Curacao, Soda Water, Smoked Lemon Syrup', description_ar = 'انطلق إلى عالمٍ من النعيم مع كل رشفة من موهيتو بلو تروبيكال. عصير ليمون، بلو كوراساو، مياه غازية، وشراب ليمون مدخن.',
      price = 35, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/1333024d-7018-4f9f-a45c-8cc54981a8d5/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250204' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Lemon & Peach Mojito', 'موهيتو الليمون والخوخ', 'Refreshing Delight: Lemon & Peach MojitoLemon Juice, Peach Puree, Peach Fruit, Soda Water, Sugar, Ice', 'متعة منعشة: موهيتو الليمون والخوخ، عصير ليمون، هريس خوخ، فاكهة خوخ، ماء صودا، سكر، ثلج', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/66d7019f-e6a0-4be8-b8b5-6900ae5f2505/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:250204', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Lemon & Peach Mojito', name_ar = 'موهيتو الليمون والخوخ', description = 'Refreshing Delight: Lemon & Peach MojitoLemon Juice, Peach Puree, Peach Fruit, Soda Water, Sugar, Ice', description_ar = 'متعة منعشة: موهيتو الليمون والخوخ، عصير ليمون، هريس خوخ، فاكهة خوخ، ماء صودا، سكر، ثلج',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/66d7019f-e6a0-4be8-b8b5-6900ae5f2505/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250205' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Mango Passion Mojito', 'موهيتو مانجو باشن', 'Mango Passion Mojito, featuring a tropical blend of mango and passion fruit sauce, fresh mint, and soda water, garnished beautifully with fresh mint leaves, passion fruit, and dried lemon slices over crushed ice.', 'موهيتو مانجو باشن، يتميز بمزيج استوائي من صلصة المانجو والباشن فروت، والنعناع الطازج، والمياه الغازية، ومزين بشكل جميل بأوراق النعناع الطازجة، والباشن فروت، وشرائح الليمون المجففة على الثلج المجروش.', 35, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/eeb1da56-d6b1-4fbb-8afa-5fdcaa19182c/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:250205', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Mango Passion Mojito', name_ar = 'موهيتو مانجو باشن', description = 'Mango Passion Mojito, featuring a tropical blend of mango and passion fruit sauce, fresh mint, and soda water, garnished beautifully with fresh mint leaves, passion fruit, and dried lemon slices over crushed ice.', description_ar = 'موهيتو مانجو باشن، يتميز بمزيج استوائي من صلصة المانجو والباشن فروت، والنعناع الطازج، والمياه الغازية، ومزين بشكل جميل بأوراق النعناع الطازجة، والباشن فروت، وشرائح الليمون المجففة على الثلج المجروش.',
      price = 35, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/eeb1da56-d6b1-4fbb-8afa-5fdcaa19182c/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250206' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Mixed Berry', 'التوت المختلط', 'Mixed Berry Mojito, featuring a vibrant combination of raspberry and mixed berry sauce, refreshing mint syrup, and zesty lemon juice, topped with soda water and garnished beautifully with fresh berries, mint leaves, and a dried lemon slice.', 'موخيتو التوت المختلط، يتميز بمزيج نابض بالحياة من صلصة التوت البري والتوت المختلط، وشراب النعناع المنعش، وعصير الليمون المنعش، ومغطى بمياه الصودا ومزين بشكل جميل بالتوت الطازج وأوراق النعناع وشريحة الليمون المجففة.', 35, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/2d50879a-09ef-4fb2-8970-c6476f2934be/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:250206', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Mixed Berry', name_ar = 'التوت المختلط', description = 'Mixed Berry Mojito, featuring a vibrant combination of raspberry and mixed berry sauce, refreshing mint syrup, and zesty lemon juice, topped with soda water and garnished beautifully with fresh berries, mint leaves, and a dried lemon slice.', description_ar = 'موخيتو التوت المختلط، يتميز بمزيج نابض بالحياة من صلصة التوت البري والتوت المختلط، وشراب النعناع المنعش، وعصير الليمون المنعش، ومغطى بمياه الصودا ومزين بشكل جميل بالتوت الطازج وأوراق النعناع وشريحة الليمون المجففة.',
      price = 35, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/2d50879a-09ef-4fb2-8970-c6476f2934be/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250207' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Passion  Orange Mojito', 'موهيتو البرتقال العاطفي', 'Orange Juice, Passion Fruit Purry, Lemon Juice, Soda Water, Sugar, Ice', 'عصير برتقال، هريس فاكهة العاطفة، عصير ليمون، ماء صودا، سكر، ثلج', 33, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/94407a36-aef2-4658-bcbc-550083bf6a07/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:250207', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Passion  Orange Mojito', name_ar = 'موهيتو البرتقال العاطفي', description = 'Orange Juice, Passion Fruit Purry, Lemon Juice, Soda Water, Sugar, Ice', description_ar = 'عصير برتقال، هريس فاكهة العاطفة، عصير ليمون، ماء صودا، سكر، ثلج',
      price = 33, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/94407a36-aef2-4658-bcbc-550083bf6a07/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250208' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Strawberry Mojito', 'موهيتو الفراولة', 'Refreshing Sweet with a strawberry Twist Lemon Juice, Strawberry Puree, Fresh Strawberries, Soda Water, Sugar, Ice', 'حلوى منعشة مع لمسة من الفراولة عصير ليمون، هريس الفراولة، فراولة طازجة، ماء صودا، سكر، ثلج', 33, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/206aea89-c438-4d36-b757-a34ee4923821/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:250208', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Strawberry Mojito', name_ar = 'موهيتو الفراولة', description = 'Refreshing Sweet with a strawberry Twist Lemon Juice, Strawberry Puree, Fresh Strawberries, Soda Water, Sugar, Ice', description_ar = 'حلوى منعشة مع لمسة من الفراولة عصير ليمون، هريس الفراولة، فراولة طازجة، ماء صودا، سكر، ثلج',
      price = 33, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/206aea89-c438-4d36-b757-a34ee4923821/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250209' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Peach Tea', 'شاي الخوخ', null, null, 32, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/a026d61f-08c9-4f2e-b5dd-387afdadbf06/conversions/blob-optimized.jpg', '{}'::text[], 70, 'apetito:250209', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Peach Tea', name_ar = 'شاي الخوخ', description = null, description_ar = null,
      price = 32, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/a026d61f-08c9-4f2e-b5dd-387afdadbf06/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 70, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250210' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced Hibiscus Tea', 'شاي الكركديه المثلج', null, null, 32, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d4307410-c7b5-44b1-ab37-49bd3ecde52b/conversions/compressed-chatgpt-image-apr-25-2026-04-10-18-pm-optimized.jpg', array['Bestseller','New']::text[], 80, 'apetito:250210', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced Hibiscus Tea', name_ar = 'شاي الكركديه المثلج', description = null, description_ar = null,
      price = 32, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d4307410-c7b5-44b1-ab37-49bd3ecde52b/conversions/compressed-chatgpt-image-apr-25-2026-04-10-18-pm-optimized.jpg', tags = array['Bestseller','New']::text[], sort_order = 80, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97344' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'SMOOTHIES', 'العصائر', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9f67f7e3-c947-4165-95d4-0d60b1686f32/conversions/blob-small.jpg', 180, 'kitchen', 'apetito:97344') returning id into v_cat;
  else
    update menu_categories set name = 'SMOOTHIES', name_ar = 'العصائر', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9f67f7e3-c947-4165-95d4-0d60b1686f32/conversions/blob-small.jpg', sort_order = 180, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250211' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Acai & Wild Berry', 'أساي والتوت البري', 'Refresh Your Day With A Burst Of Acai & Wild Berry BlissAcai Berry, Wild Berry Sauce, Ice, Almond Milk', 'أنعش يومك بنكهة فاكهة الآساي والتوت البري، صلصة التوت البري، الثلج، حليب اللوز', 38, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/96384729-05d5-4b2b-940b-d6bea9054a61/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:250211', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Acai & Wild Berry', name_ar = 'أساي والتوت البري', description = 'Refresh Your Day With A Burst Of Acai & Wild Berry BlissAcai Berry, Wild Berry Sauce, Ice, Almond Milk', description_ar = 'أنعش يومك بنكهة فاكهة الآساي والتوت البري، صلصة التوت البري، الثلج، حليب اللوز',
      price = 38, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/96384729-05d5-4b2b-940b-d6bea9054a61/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250212' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Mango Smoothie', 'عصير المانجو', 'Mango, Passion Fruit, Pineapple, Ice, Apple Juice', 'مانجو، باشن فروت، أناناس، ثلج، عصير تفاح', 38, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/fdf8e0a7-9731-4a53-9159-ea0112c966be/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:250212', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Mango Smoothie', name_ar = 'عصير المانجو', description = 'Mango, Passion Fruit, Pineapple, Ice, Apple Juice', description_ar = 'مانجو، باشن فروت، أناناس، ثلج، عصير تفاح',
      price = 38, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/fdf8e0a7-9731-4a53-9159-ea0112c966be/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250213' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Green Energizer', 'المنشط الأخضر', 'Spinach, Celeray, Broccoli, Mango, Banana, Pineapple, Ice', 'السبانخ، الكرفس، البروكلي، المانجو، الموز، الأناناس، الثلج', 38, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ae941fac-c815-4b71-a460-0635c7b070d8/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:250213', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Green Energizer', name_ar = 'المنشط الأخضر', description = 'Spinach, Celeray, Broccoli, Mango, Banana, Pineapple, Ice', description_ar = 'السبانخ، الكرفس، البروكلي، المانجو، الموز، الأناناس، الثلج',
      price = 38, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ae941fac-c815-4b71-a460-0635c7b070d8/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250214' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Pink Berry Smoothie', 'عصير التوت الوردي', 'Strawberry, Pink Dragon Fruit, Ice', 'الفراولة، فاكهة التنين الوردية، الثلج', 38, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/67e39e01-5089-4346-a654-fb4b884c0f8b/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:250214', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Pink Berry Smoothie', name_ar = 'عصير التوت الوردي', description = 'Strawberry, Pink Dragon Fruit, Ice', description_ar = 'الفراولة، فاكهة التنين الوردية، الثلج',
      price = 38, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/67e39e01-5089-4346-a654-fb4b884c0f8b/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250215' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Cookie Shake', 'ميلك شيك الكوكيز', 'Indulge In A Dreamy Cookie Shake -- Sweet Bliss In Evert SipOreo Cookie, Gelato, Ice, Milk', 'استمتع بكوكيز شيك حالمة - نعيم حلو في كل مشروب أوريو كوكيز، جيلاتو، ثلج، حليب', 38, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5b605765-4419-463c-a8a0-41f0fd5ae36b/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:250215', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Cookie Shake', name_ar = 'ميلك شيك الكوكيز', description = 'Indulge In A Dreamy Cookie Shake -- Sweet Bliss In Evert SipOreo Cookie, Gelato, Ice, Milk', description_ar = 'استمتع بكوكيز شيك حالمة - نعيم حلو في كل مشروب أوريو كوكيز، جيلاتو، ثلج، حليب',
      price = 38, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5b605765-4419-463c-a8a0-41f0fd5ae36b/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97345' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'FRESH JUICES', 'عصائر طازجة', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/509becfd-d80d-4caf-a067-38c14539b724/conversions/e0e28279850fc99a32a31f032ac7a078-thumbnail.jpg', 190, 'kitchen', 'apetito:97345') returning id into v_cat;
  else
    update menu_categories set name = 'FRESH JUICES', name_ar = 'عصائر طازجة', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/509becfd-d80d-4caf-a067-38c14539b724/conversions/e0e28279850fc99a32a31f032ac7a078-thumbnail.jpg', sort_order = 190, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250216' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Watermelon Juice', 'عصير البطيخ', null, null, 25, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/509becfd-d80d-4caf-a067-38c14539b724/conversions/e0e28279850fc99a32a31f032ac7a078-optimized.jpg', '{}'::text[], 10, 'apetito:250216', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Watermelon Juice', name_ar = 'عصير البطيخ', description = null, description_ar = null,
      price = 25, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/509becfd-d80d-4caf-a067-38c14539b724/conversions/e0e28279850fc99a32a31f032ac7a078-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250217' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Fresh Orange Juice', 'عصير برتقال طازج', 'Freshly Squeezed Juice', 'عصير طازج', 25, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/feb1574c-fff4-444b-9710-7738ad9ff75d/conversions/a6a590d9a1d8dda3ed8b53d5bcabad3d-optimized.jpg', '{}'::text[], 20, 'apetito:250217', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Fresh Orange Juice', name_ar = 'عصير برتقال طازج', description = 'Freshly Squeezed Juice', description_ar = 'عصير طازج',
      price = 25, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/feb1574c-fff4-444b-9710-7738ad9ff75d/conversions/a6a590d9a1d8dda3ed8b53d5bcabad3d-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:250218' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Apple Juice', 'عصير التفاح', 'Crisp & naturally sweet Freshly-pressed apple juice.', 'عصير تفاح طازج ومنعش وحلو بشكل طبيعي.', 25, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/cb51111d-b205-4cf3-b363-fa99b51c319d/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:250218', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Apple Juice', name_ar = 'عصير التفاح', description = 'Crisp & naturally sweet Freshly-pressed apple juice.', description_ar = 'عصير تفاح طازج ومنعش وحلو بشكل طبيعي.',
      price = 25, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/cb51111d-b205-4cf3-b363-fa99b51c319d/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;

  -- ===== Sharjah Menu =====
  select id into v_menu from menu_menus where brand_id = v_brand and pos_menu_id = 'apetito:76088' limit 1;
  if v_menu is null then
    insert into menu_menus (brand_id, name, pos_menu_id, sort_order) values (v_brand, 'Sharjah Menu', 'apetito:76088', 20) returning id into v_menu;
  else
    update menu_menus set name = 'Sharjah Menu', sort_order = 20 where id = v_menu;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97257' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'PASTRIES', 'المعجنات', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/812cae2d-dc3b-47aa-8848-da56551b6870/conversions/compressed-chocoberry-013-small.jpg', 10, 'kitchen', 'apetito:97257') returning id into v_cat;
  else
    update menu_categories set name = 'PASTRIES', name_ar = 'المعجنات', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/812cae2d-dc3b-47aa-8848-da56551b6870/conversions/compressed-chocoberry-013-small.jpg', sort_order = 10, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:256687' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Caviar Tiramisu', 'تيراميسو الكافيار', 'Creamy tiramisu, Rich Chocolate and Caviar on Top', 'تيراميسو كريمي، شوكولاتة غنية وكافيار في الأعلى', 50, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/46c9b52b-ee43-47a4-8c1b-f69e31c9716a/conversions/compressed-create-tiramisu-caviar-glass-2k-20260912195502-optimized.jpg', array['Bestseller']::text[], 10, 'apetito:256687', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Caviar Tiramisu', name_ar = 'تيراميسو الكافيار', description = 'Creamy tiramisu, Rich Chocolate and Caviar on Top', description_ar = 'تيراميسو كريمي، شوكولاتة غنية وكافيار في الأعلى',
      price = 50, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/46c9b52b-ee43-47a4-8c1b-f69e31c9716a/conversions/compressed-create-tiramisu-caviar-glass-2k-20260912195502-optimized.jpg', tags = array['Bestseller']::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249539' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Classic Tiramisu', 'تيراميسو كلاسيكي', 'lady fingers coffee soaked biscuit, mascarpone cream, cocoa powder', 'بسكويت ليدي فينجرز منقوع في القهوة، كريمة ماسكاربوني، مسحوق الكاكاو', 45, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e7bf6590-30e6-4631-bde1-9217e5e961a4/conversions/compressed-chocoberry-048-optimized.jpg', '{}'::text[], 20, 'apetito:249539', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Classic Tiramisu', name_ar = 'تيراميسو كلاسيكي', description = 'lady fingers coffee soaked biscuit, mascarpone cream, cocoa powder', description_ar = 'بسكويت ليدي فينجرز منقوع في القهوة، كريمة ماسكاربوني، مسحوق الكاكاو',
      price = 45, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e7bf6590-30e6-4631-bde1-9217e5e961a4/conversions/compressed-chocoberry-048-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:252270' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Pistachio Tres Leche', 'فستق تريس ليتشي', null, null, 45, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9796c34f-ec6e-4943-ba75-75b38995611a/conversions/compressed-create-pistachio-milk-cake-glass-202608201612-optimized.jpg', array['Bestseller']::text[], 30, 'apetito:252270', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Pistachio Tres Leche', name_ar = 'فستق تريس ليتشي', description = null, description_ar = null,
      price = 45, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9796c34f-ec6e-4943-ba75-75b38995611a/conversions/compressed-create-pistachio-milk-cake-glass-202608201612-optimized.jpg', tags = array['Bestseller']::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249540' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Saffron Tres Leche', 'زعفران تريس ليتش', 'vanilla sponge, whipped cream, milk saffron sauce', 'كيكة إسفنجية بالفانيليا، كريمة مخفوقة، صلصة حليب بالزعفران', 45, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/06632047-3c14-4801-8a9a-d6aced6aafa6/conversions/compressed-chocoberry-072-optimized.jpg', '{}'::text[], 40, 'apetito:249540', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Saffron Tres Leche', name_ar = 'زعفران تريس ليتش', description = 'vanilla sponge, whipped cream, milk saffron sauce', description_ar = 'كيكة إسفنجية بالفانيليا، كريمة مخفوقة، صلصة حليب بالزعفران',
      price = 45, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/06632047-3c14-4801-8a9a-d6aced6aafa6/conversions/compressed-chocoberry-072-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249523' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Vanilla Meringue', 'مرنغ الفانيليا', 'vanilla sponge, vanilla chantilly burnt meringue', 'كيكة إسفنجية بالفانيليا، كريمة شانتيلي بالفانيليا، مرينغ محروق', 43, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e3a59207-fefe-45b5-8173-3cf31f6b7755/conversions/compressed-chocoberry-103-optimized.jpg', '{}'::text[], 50, 'apetito:249523', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Vanilla Meringue', name_ar = 'مرنغ الفانيليا', description = 'vanilla sponge, vanilla chantilly burnt meringue', description_ar = 'كيكة إسفنجية بالفانيليا، كريمة شانتيلي بالفانيليا، مرينغ محروق',
      price = 43, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e3a59207-fefe-45b5-8173-3cf31f6b7755/conversions/compressed-chocoberry-103-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249524' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'San Sebastian', 'سان سيباستيان', 'vanilla cream cheese, mix berries', 'جبنة كريمية بالفانيليا، مزيج من التوت', 47, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d0175e14-0b07-4ed3-a0db-85eeef736c4e/conversions/compressed-chocoberry-117-optimized.jpg', '{}'::text[], 60, 'apetito:249524', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'San Sebastian', name_ar = 'سان سيباستيان', description = 'vanilla cream cheese, mix berries', description_ar = 'جبنة كريمية بالفانيليا، مزيج من التوت',
      price = 47, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d0175e14-0b07-4ed3-a0db-85eeef736c4e/conversions/compressed-chocoberry-117-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249526' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Moka Cake', 'كعكة موكا', 'coffee sponge, coffee cream, caramel', 'كيكة إسفنجية بالقهوة، كريمة قهوة، كراميل', 38, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/6c2c48f4-dacd-4563-9a13-7901a68fd432/conversions/compressed-chocoberry-109-optimized.jpg', '{}'::text[], 70, 'apetito:249526', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Moka Cake', name_ar = 'كعكة موكا', description = 'coffee sponge, coffee cream, caramel', description_ar = 'كيكة إسفنجية بالقهوة، كريمة قهوة، كراميل',
      price = 38, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/6c2c48f4-dacd-4563-9a13-7901a68fd432/conversions/compressed-chocoberry-109-optimized.jpg', tags = '{}'::text[], sort_order = 70, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249528' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chocolate Fudge Cake', 'كعكة فادج الشوكولاتة', 'Chocolate sponge, dark chocolate ganache, caramel', 'كيكة إسفنجية بالشوكولاتة، غاناش الشوكولاتة الداكنة، كراميل', 49, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/a9ce716d-6357-4f4d-b841-7f7524fd67b4/conversions/compressed-untitled-14-optimized.jpg', '{}'::text[], 80, 'apetito:249528', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chocolate Fudge Cake', name_ar = 'كعكة فادج الشوكولاتة', description = 'Chocolate sponge, dark chocolate ganache, caramel', description_ar = 'كيكة إسفنجية بالشوكولاتة، غاناش الشوكولاتة الداكنة، كراميل',
      price = 49, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/a9ce716d-6357-4f4d-b841-7f7524fd67b4/conversions/compressed-untitled-14-optimized.jpg', tags = '{}'::text[], sort_order = 80, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249529' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Carrot Cake', 'كعكة الجزر', 'carrot & cinnamon sponge, cream cheese frosting', 'كيكة إسفنجية بالجزر والقرفة، مغطاة بكريمة الجبن', 39, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ec735174-8113-44c0-a5ce-41f5924742fd/conversions/compressed-untitled-32-optimized.jpg', '{}'::text[], 90, 'apetito:249529', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Carrot Cake', name_ar = 'كعكة الجزر', description = 'carrot & cinnamon sponge, cream cheese frosting', description_ar = 'كيكة إسفنجية بالجزر والقرفة، مغطاة بكريمة الجبن',
      price = 39, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ec735174-8113-44c0-a5ce-41f5924742fd/conversions/compressed-untitled-32-optimized.jpg', tags = '{}'::text[], sort_order = 90, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249522' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'London Viral Cake', 'كعكة لندن الفيروسية', null, null, 49, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/7989f9bd-ce4d-4da6-b454-41b40f12b148/conversions/compressed-dsc9101-optimized.jpg', '{}'::text[], 100, 'apetito:249522', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'London Viral Cake', name_ar = 'كعكة لندن الفيروسية', description = null, description_ar = null,
      price = 49, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/7989f9bd-ce4d-4da6-b454-41b40f12b148/conversions/compressed-dsc9101-optimized.jpg', tags = '{}'::text[], sort_order = 100, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249530' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Amalfi Lemon', 'ليمون أمالفي', 'lemon mousse, candied yuzu, white chocolate', 'موس الليمون، يوزو مسكر، شوكولاتة بيضاء', 36, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/a5ce98ab-5ff8-4bf6-95a9-9dcd924e74d6/conversions/compressed-chocoberry-021-optimized.jpg', '{}'::text[], 110, 'apetito:249530', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Amalfi Lemon', name_ar = 'ليمون أمالفي', description = 'lemon mousse, candied yuzu, white chocolate', description_ar = 'موس الليمون، يوزو مسكر، شوكولاتة بيضاء',
      price = 36, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/a5ce98ab-5ff8-4bf6-95a9-9dcd924e74d6/conversions/compressed-chocoberry-021-optimized.jpg', tags = '{}'::text[], sort_order = 110, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249531' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Pavlova', 'بافلوفا', 'French meringue, mascarpone vanilla cream, red berries', 'مرينغ فرنسي، كريمة فانيليا ماسكاربوني، توت أحمر', 40, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f81e4a3c-8b33-4e1f-9172-f27a1ecf338b/conversions/compressed-chocoberry-013-optimized.jpg', '{}'::text[], 120, 'apetito:249531', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Pavlova', name_ar = 'بافلوفا', description = 'French meringue, mascarpone vanilla cream, red berries', description_ar = 'مرينغ فرنسي، كريمة فانيليا ماسكاربوني، توت أحمر',
      price = 40, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f81e4a3c-8b33-4e1f-9172-f27a1ecf338b/conversions/compressed-chocoberry-013-optimized.jpg', tags = '{}'::text[], sort_order = 120, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249532' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Mango passion', 'شغف المانجو', 'mango sponge, passion fruit curd, mango insert', 'كيكة المانجو الإسفنجية، كريمة فاكهة الباشن، حشوة المانجو', 43, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/dba34d22-d38b-4463-9e33-4ca4eca109b6/conversions/compressed-chocoberry-025-optimized.jpg', '{}'::text[], 130, 'apetito:249532', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Mango passion', name_ar = 'شغف المانجو', description = 'mango sponge, passion fruit curd, mango insert', description_ar = 'كيكة المانجو الإسفنجية، كريمة فاكهة الباشن، حشوة المانجو',
      price = 43, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/dba34d22-d38b-4463-9e33-4ca4eca109b6/conversions/compressed-chocoberry-025-optimized.jpg', tags = '{}'::text[], sort_order = 130, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249533' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Calamansi Tart', 'تارت كالامانسي', 'almond frangipane, kalamansi curd, Italian meringue', 'فرانجيبان اللوز، خثارة كالامانسي، مرنغ إيطالي', 36, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/30549efe-fafc-47c0-9a02-5d991d3ad9be/conversions/compressed-chocoberry-028-optimized.jpg', '{}'::text[], 140, 'apetito:249533', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Calamansi Tart', name_ar = 'تارت كالامانسي', description = 'almond frangipane, kalamansi curd, Italian meringue', description_ar = 'فرانجيبان اللوز، خثارة كالامانسي، مرنغ إيطالي',
      price = 36, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/30549efe-fafc-47c0-9a02-5d991d3ad9be/conversions/compressed-chocoberry-028-optimized.jpg', tags = '{}'::text[], sort_order = 140, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249534' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Coconut Rice Pudding', 'بودنغ الأرز بجوز الهند', 'coconut rice pudding, vanilla strawberry gel, fresh strawberry', 'بودنغ أرز بجوز الهند، جيلي الفراولة بالفانيليا، فراولة طازجة', 43, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5a355968-a18e-416f-8b40-39b5b02b2099/conversions/compressed-chocoberry-032-optimized.jpg', '{}'::text[], 150, 'apetito:249534', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Coconut Rice Pudding', name_ar = 'بودنغ الأرز بجوز الهند', description = 'coconut rice pudding, vanilla strawberry gel, fresh strawberry', description_ar = 'بودنغ أرز بجوز الهند، جيلي الفراولة بالفانيليا، فراولة طازجة',
      price = 43, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5a355968-a18e-416f-8b40-39b5b02b2099/conversions/compressed-chocoberry-032-optimized.jpg', tags = '{}'::text[], sort_order = 150, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249535' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Pistachio & Rose', 'الفستق والورد', 'Sicilian pistachio mousse, rose gel, vanilla cream', 'موس الفستق الصقلي، جل الورد، كريمة الفانيليا', 36, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9c6b82ee-4133-4ab2-9976-462ff9571de5/conversions/compressed-chocoberry-053-optimized.jpg', '{}'::text[], 160, 'apetito:249535', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Pistachio & Rose', name_ar = 'الفستق والورد', description = 'Sicilian pistachio mousse, rose gel, vanilla cream', description_ar = 'موس الفستق الصقلي، جل الورد، كريمة الفانيليا',
      price = 36, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9c6b82ee-4133-4ab2-9976-462ff9571de5/conversions/compressed-chocoberry-053-optimized.jpg', tags = '{}'::text[], sort_order = 160, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249536' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, '100% Pistachio', 'فستق 100%', 'pistachio mousse, pistachio praline insert, crunchy pistachio shell', 'موس الفستق، حشوة برالين الفستق، قشرة الفستق المقرمشة', 45, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/85bbaf3a-c498-4f59-bfe5-6bd856414877/conversions/compressed-chocoberry-016-optimized.jpg', '{}'::text[], 170, 'apetito:249536', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = '100% Pistachio', name_ar = 'فستق 100%', description = 'pistachio mousse, pistachio praline insert, crunchy pistachio shell', description_ar = 'موس الفستق، حشوة برالين الفستق، قشرة الفستق المقرمشة',
      price = 45, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/85bbaf3a-c498-4f59-bfe5-6bd856414877/conversions/compressed-chocoberry-016-optimized.jpg', tags = '{}'::text[], sort_order = 170, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249538' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Madagascar Vanilla Flower', 'زهرة الفانيليا المدغشقرية', 'vanilla panna cotta, vanilla mascarpone chantilly, vanilla curd', 'بانا كوتا بالفانيليا، شانتيلي ماسكاربوني بالفانيليا، كريمة الفانيليا', 45, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/0113c36c-6763-453d-9615-7c78b42abede/conversions/compressed-chocoberry-037-optimized.jpg', '{}'::text[], 180, 'apetito:249538', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Madagascar Vanilla Flower', name_ar = 'زهرة الفانيليا المدغشقرية', description = 'vanilla panna cotta, vanilla mascarpone chantilly, vanilla curd', description_ar = 'بانا كوتا بالفانيليا، شانتيلي ماسكاربوني بالفانيليا، كريمة الفانيليا',
      price = 45, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/0113c36c-6763-453d-9615-7c78b42abede/conversions/compressed-chocoberry-037-optimized.jpg', tags = '{}'::text[], sort_order = 180, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249541' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Lava Cake', 'كعكة الحمم البركانية', 'Warm molten chocolate cake served with gelato.', 'كعكة الشوكولاتة الساخنة المذابة تقدم مع الآيس كريم.', 55, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d8fe492e-ab45-494c-8e8b-9ad5a48f185c/conversions/compressed-chocoberry-085-optimized.jpg', '{}'::text[], 190, 'apetito:249541', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Lava Cake', name_ar = 'كعكة الحمم البركانية', description = 'Warm molten chocolate cake served with gelato.', description_ar = 'كعكة الشوكولاتة الساخنة المذابة تقدم مع الآيس كريم.',
      price = 55, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d8fe492e-ab45-494c-8e8b-9ad5a48f185c/conversions/compressed-chocoberry-085-optimized.jpg', tags = '{}'::text[], sort_order = 190, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249542' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Fresh Indulgence Crepe', 'كريب فاخر طازج', null, null, 49, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3c44e06f-baa1-4f92-a5f0-27abbc659821/conversions/compressed-create-this-image-same-good-202608051509-optimized.jpg', '{}'::text[], 200, 'apetito:249542', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Fresh Indulgence Crepe', name_ar = 'كريب فاخر طازج', description = null, description_ar = null,
      price = 49, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3c44e06f-baa1-4f92-a5f0-27abbc659821/conversions/compressed-create-this-image-same-good-202608051509-optimized.jpg', tags = '{}'::text[], sort_order = 200, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:249543' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Strawberry Crepe', 'كريب الفراولة', 'Sweet strawberries with passion fruit drizzle in a warm crêpe.', 'فراولة حلوة مع رذاذ فاكهة الباشن فروت في كريب دافئ.', 45, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/cb05539d-e99a-4934-bc32-bc9d8bbcd5f8/conversions/compressed-create-this-image-same-good-202608051331-optimized.jpg', '{}'::text[], 210, 'apetito:249543', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Strawberry Crepe', name_ar = 'كريب الفراولة', description = 'Sweet strawberries with passion fruit drizzle in a warm crêpe.', description_ar = 'فراولة حلوة مع رذاذ فاكهة الباشن فروت في كريب دافئ.',
      price = 45, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/cb05539d-e99a-4934-bc32-bc9d8bbcd5f8/conversions/compressed-create-this-image-same-good-202608051331-optimized.jpg', tags = '{}'::text[], sort_order = 210, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92298' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'ALL DAY BREAKFAST', 'وجبة إفطار طوال اليوم', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/8b2886ed-038e-4e61-a1a8-8ececc52298d/conversions/blob-small.jpg', 20, 'kitchen', 'apetito:92298') returning id into v_cat;
  else
    update menu_categories set name = 'ALL DAY BREAKFAST', name_ar = 'وجبة إفطار طوال اليوم', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/8b2886ed-038e-4e61-a1a8-8ececc52298d/conversions/blob-small.jpg', sort_order = 20, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219658' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Big Bang', 'الانفجار العظيم', 'Scrambled eggs served with crispy hash brown, baked beans, grilled halloumi, French toast with honey jar, roasted tomatoes & fresh berries', 'بيض مخفوق يقدم مع بطاطس مقلية مقرمشة، فاصوليا مطبوخة، جبنة حلومي مشوية، خبز محمص فرنسي مع جرة عسل، طماطم مشوية وتوت طازج', 73, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c188e523-d89f-4547-ba3f-ed0c50b78f81/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:219658', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Big Bang', name_ar = 'الانفجار العظيم', description = 'Scrambled eggs served with crispy hash brown, baked beans, grilled halloumi, French toast with honey jar, roasted tomatoes & fresh berries', description_ar = 'بيض مخفوق يقدم مع بطاطس مقلية مقرمشة، فاصوليا مطبوخة، جبنة حلومي مشوية، خبز محمص فرنسي مع جرة عسل، طماطم مشوية وتوت طازج',
      price = 73, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c188e523-d89f-4547-ba3f-ed0c50b78f81/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219659' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Classic English Breakfast', 'فطور إنجليزي كلاسيكي', 'Traditional English spread of eggs, sausages, bacon, baked beans, crispy hash brown, grilled vine tomatoes, mushrooms and green leaves', 'طبق إنجليزي تقليدي من البيض والنقانق ولحم الخنزير المقدد والفاصوليا المخبوزة والبطاطس المقلية المقرمشة والطماطم المشوية والفطر والأوراق الخضراء', 69, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/656fb97c-5b7a-40c7-b3dc-3c5781208b99/conversions/blob-optimized.jpg', array['Bestseller']::text[], 20, 'apetito:219659', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Classic English Breakfast', name_ar = 'فطور إنجليزي كلاسيكي', description = 'Traditional English spread of eggs, sausages, bacon, baked beans, crispy hash brown, grilled vine tomatoes, mushrooms and green leaves', description_ar = 'طبق إنجليزي تقليدي من البيض والنقانق ولحم الخنزير المقدد والفاصوليا المخبوزة والبطاطس المقلية المقرمشة والطماطم المشوية والفطر والأوراق الخضراء',
      price = 69, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/656fb97c-5b7a-40c7-b3dc-3c5781208b99/conversions/blob-optimized.jpg', tags = array['Bestseller']::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219660' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'The Mediterranean', 'البحر الأبيض المتوسط', 'A vibrant platter of soft scrambled eggs, avocado wedges, crispy falafel, feta, hummus, flyover yogurt, olives, cucumber, fresh orange slices & warm pita bread', 'طبق نابض بالحياة من البيض المخفوق الناعم، وشرائح الأفوكادو، والفلافل المقرمشة، والجبن الفيتا، والحمص، والزبادي، والزيتون، والخيار، وشرائح البرتقال الطازجة، وخبز البيتا الدافئ.', 67, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/06a515ef-53b5-4a45-a47b-0dbcf755171b/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:219660', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'The Mediterranean', name_ar = 'البحر الأبيض المتوسط', description = 'A vibrant platter of soft scrambled eggs, avocado wedges, crispy falafel, feta, hummus, flyover yogurt, olives, cucumber, fresh orange slices & warm pita bread', description_ar = 'طبق نابض بالحياة من البيض المخفوق الناعم، وشرائح الأفوكادو، والفلافل المقرمشة، والجبن الفيتا، والحمص، والزبادي، والزيتون، والخيار، وشرائح البرتقال الطازجة، وخبز البيتا الدافئ.',
      price = 67, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/06a515ef-53b5-4a45-a47b-0dbcf755171b/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219661' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Shakshuka - Green', 'شكشوكة - خضراء', 'A flavourful skillet of green spinach sauce, topped with perfectly poached eggs, crumbled feta, avocado wedges, a hint of sweet chili, served with a warm breadbasket.', 'مقلاة لذيذة من صلصة السبانخ الخضراء، مغطاة بالبيض المسلوق تمامًا، والجبن الفيتا المفتت، وشرائح الأفوكادو، وقليل من الفلفل الحلو، وتقدم مع سلة خبز دافئة.', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/dc1ce41d-b805-430c-ba17-8510366e5705/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:219661', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Shakshuka - Green', name_ar = 'شكشوكة - خضراء', description = 'A flavourful skillet of green spinach sauce, topped with perfectly poached eggs, crumbled feta, avocado wedges, a hint of sweet chili, served with a warm breadbasket.', description_ar = 'مقلاة لذيذة من صلصة السبانخ الخضراء، مغطاة بالبيض المسلوق تمامًا، والجبن الفيتا المفتت، وشرائح الأفوكادو، وقليل من الفلفل الحلو، وتقدم مع سلة خبز دافئة.',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/dc1ce41d-b805-430c-ba17-8510366e5705/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219662' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Shakshuka', 'شكشوكة', 'A flavourful skillet of spicy tomato sauce topped with perfectly poached eggs, marinated feta, a hint of sweet chili, served with a warm breadbasket.', 'مقلاة لذيذة من صلصة الطماطم الحارة مغطاة بالبيض المسلوق بشكل مثالي، والجبن الفيتا المتبل، وقليل من الفلفل الحلو، وتقدم مع سلة خبز دافئة.', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/7e43a4ca-649e-4ae5-8c1f-2538ffb52640/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:219662', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Shakshuka', name_ar = 'شكشوكة', description = 'A flavourful skillet of spicy tomato sauce topped with perfectly poached eggs, marinated feta, a hint of sweet chili, served with a warm breadbasket.', description_ar = 'مقلاة لذيذة من صلصة الطماطم الحارة مغطاة بالبيض المسلوق بشكل مثالي، والجبن الفيتا المتبل، وقليل من الفلفل الحلو، وتقدم مع سلة خبز دافئة.',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/7e43a4ca-649e-4ae5-8c1f-2538ffb52640/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219663' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Egg Menemen', 'بيض مينيمن', 'A Turkish classic of scrambled eggs cooked in spicy tomato sauce with bell peppers, crumble feta cheese & a touch of sweet chili, served with a warm breadbasket.', 'طبق تركي كلاسيكي من البيض المخفوق المطبوخ في صلصة الطماطم الحارة مع الفلفل الحلو وجبن الفيتا المفتت ولمسة من الفلفل الحلو، ويقدم مع سلة خبز دافئة.', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3dc55d14-33b5-4216-b690-a4483ff2827b/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:219663', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Egg Menemen', name_ar = 'بيض مينيمن', description = 'A Turkish classic of scrambled eggs cooked in spicy tomato sauce with bell peppers, crumble feta cheese & a touch of sweet chili, served with a warm breadbasket.', description_ar = 'طبق تركي كلاسيكي من البيض المخفوق المطبوخ في صلصة الطماطم الحارة مع الفلفل الحلو وجبن الفيتا المفتت ولمسة من الفلفل الحلو، ويقدم مع سلة خبز دافئة.',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3dc55d14-33b5-4216-b690-a4483ff2827b/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219665' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'French Omelette', 'أومليت فرنسي', 'Soft and fluffy folded French omelette served with a fresh mixed green tomato salad and a warm bread basket.', 'عجة فرنسية مطوية ناعمة ورقيقة تقدم مع سلطة طماطم خضراء مشكلة طازجة وسلة خبز دافئة.', 53, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/22aaa255-bba0-46a7-8747-68cfadc7502a/conversions/blob-optimized.jpg', '{}'::text[], 70, 'apetito:219665', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'French Omelette', name_ar = 'أومليت فرنسي', description = 'Soft and fluffy folded French omelette served with a fresh mixed green tomato salad and a warm bread basket.', description_ar = 'عجة فرنسية مطوية ناعمة ورقيقة تقدم مع سلطة طماطم خضراء مشكلة طازجة وسلة خبز دافئة.',
      price = 53, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/22aaa255-bba0-46a7-8747-68cfadc7502a/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 70, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219667' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Classic Scrambled Egg', 'البيض المخفوق الكلاسيكي', 'Three farm-fresh eggs, softly scrambled to perfection, served with a fresh mixed green & tomato salad and warm bread basket.', 'ثلاث بيضات طازجة مخفوقة بشكل ناعم حتى تصل إلى درجة الكمال، تقدم مع سلطة خضراء طازجة وطماطم وسلة خبز دافئة.', 55, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c6effbcb-7f8b-4d40-bd55-2c9170ce484f/conversions/blob-optimized.jpg', '{}'::text[], 80, 'apetito:219667', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Classic Scrambled Egg', name_ar = 'البيض المخفوق الكلاسيكي', description = 'Three farm-fresh eggs, softly scrambled to perfection, served with a fresh mixed green & tomato salad and warm bread basket.', description_ar = 'ثلاث بيضات طازجة مخفوقة بشكل ناعم حتى تصل إلى درجة الكمال، تقدم مع سلطة خضراء طازجة وطماطم وسلة خبز دافئة.',
      price = 55, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c6effbcb-7f8b-4d40-bd55-2c9170ce484f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 80, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219668' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Eggs Benedict', 'بيض بنديكت', 'Two perfectly poached eggs on toasted English muffins with turkey bacon, topped with silky hollandaise sauce, served with grilled asparagus', 'بيضتان مسلوقتان بشكل مثالي على خبز إنجليزي محمص مع لحم ديك رومي مقدد، ومغطاة بصلصة هولنديز حريرية، وتقدم مع الهليون المشوي', 69, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/bc2a1d7f-8af4-4e01-bcc9-c75cab1e8471/conversions/blob-optimized.jpg', '{}'::text[], 90, 'apetito:219668', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Eggs Benedict', name_ar = 'بيض بنديكت', description = 'Two perfectly poached eggs on toasted English muffins with turkey bacon, topped with silky hollandaise sauce, served with grilled asparagus', description_ar = 'بيضتان مسلوقتان بشكل مثالي على خبز إنجليزي محمص مع لحم ديك رومي مقدد، ومغطاة بصلصة هولنديز حريرية، وتقدم مع الهليون المشوي',
      price = 69, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/bc2a1d7f-8af4-4e01-bcc9-c75cab1e8471/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 90, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219669' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Eggs Royale', 'بيض رويال', 'Two perfectly poached eggs on toasted English muffins with smoked salmon, topped with silky hollandaise sauce, served with grilled asparagus, and roasted vine tomatoes', 'بيضتان مسلوقتان بشكل مثالي على خبز إنجليزي محمص مع سمك السلمون المدخن، ومغطاة بصلصة هولنديز حريرية، وتقدم مع الهليون المشوي والطماطم المشوية', 73, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9d07d36e-206c-481f-84fd-d84ee1e7dfd8/conversions/blob-optimized.jpg', '{}'::text[], 100, 'apetito:219669', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Eggs Royale', name_ar = 'بيض رويال', description = 'Two perfectly poached eggs on toasted English muffins with smoked salmon, topped with silky hollandaise sauce, served with grilled asparagus, and roasted vine tomatoes', description_ar = 'بيضتان مسلوقتان بشكل مثالي على خبز إنجليزي محمص مع سمك السلمون المدخن، ومغطاة بصلصة هولنديز حريرية، وتقدم مع الهليون المشوي والطماطم المشوية',
      price = 73, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9d07d36e-206c-481f-84fd-d84ee1e7dfd8/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 100, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219670' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Egg Avocado Croissant', 'كرواسون البيض والأفوكادو', 'Flaky butter croissant filled with soft scrambled eggs, topped with fresh avocado slices and a sprinkle of chives.', 'كرواسون زبدة متقشرة محشوة بالبيض المخفوق الناعم، ومغطاة بشرائح الأفوكادو الطازجة ورشة من الثوم المعمر.', 55, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/497cd618-4b57-4116-bf37-3d1fb223bf50/conversions/blob-optimized.jpg', array['Bestseller']::text[], 110, 'apetito:219670', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Egg Avocado Croissant', name_ar = 'كرواسون البيض والأفوكادو', description = 'Flaky butter croissant filled with soft scrambled eggs, topped with fresh avocado slices and a sprinkle of chives.', description_ar = 'كرواسون زبدة متقشرة محشوة بالبيض المخفوق الناعم، ومغطاة بشرائح الأفوكادو الطازجة ورشة من الثوم المعمر.',
      price = 55, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/497cd618-4b57-4116-bf37-3d1fb223bf50/conversions/blob-optimized.jpg', tags = array['Bestseller']::text[], sort_order = 110, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219672' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Smoked Salmon Croissant Benedict', 'كرواسون بنديكت بالسلمون المدخن', 'Flaky croissant topped with smoked salmon, poached eggs, Arugula Leaves & homemade hollandaise sauce.', 'كرواسون متقشر مغطى بالسلمون المدخن والبيض المسلوق وأوراق الجرجير وصلصة هولنديز محلية الصنع.', 65, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ae4748b0-b344-434c-ac86-96177b03cb1b/conversions/blob-optimized.jpg', '{}'::text[], 120, 'apetito:219672', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Smoked Salmon Croissant Benedict', name_ar = 'كرواسون بنديكت بالسلمون المدخن', description = 'Flaky croissant topped with smoked salmon, poached eggs, Arugula Leaves & homemade hollandaise sauce.', description_ar = 'كرواسون متقشر مغطى بالسلمون المدخن والبيض المسلوق وأوراق الجرجير وصلصة هولنديز محلية الصنع.',
      price = 65, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ae4748b0-b344-434c-ac86-96177b03cb1b/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 120, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219673' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Cilbir - Turkish Eggs', 'سيلبير - بيض تركي', 'Silky poached eggs over flavored Greek yogurt, finished with paprika chili butter, grilled chillies & fresh dill', 'بيض مسلوق ناعم على زبادي يوناني بنكهة مميزة، مع زبدة الفلفل الحار والبابريكا والفلفل الحار المشوي والشبت الطازج', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b107ed9f-b2a9-4207-83aa-f7355a01c810/conversions/blob-optimized.jpg', '{}'::text[], 130, 'apetito:219673', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Cilbir - Turkish Eggs', name_ar = 'سيلبير - بيض تركي', description = 'Silky poached eggs over flavored Greek yogurt, finished with paprika chili butter, grilled chillies & fresh dill', description_ar = 'بيض مسلوق ناعم على زبادي يوناني بنكهة مميزة، مع زبدة الفلفل الحار والبابريكا والفلفل الحار المشوي والشبت الطازج',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b107ed9f-b2a9-4207-83aa-f7355a01c810/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 130, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219674' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Melty Egg Muffin', 'كعكة البيض الذائبة', 'Toasted English muffin stacked with fried eggs, crispy hash brown, melted cheese, creamy avocado & fresh greens.', 'كعكة إنجليزية محمصة محشوة بالبيض المقلي، وبطاطس مقلية مقرمشة، وجبن ذائب، وأفوكادو كريمي، وخضراوات طازجة.', 57, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/aef79498-1de5-4012-a603-d2530ca103ff/conversions/blob-optimized.jpg', '{}'::text[], 140, 'apetito:219674', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Melty Egg Muffin', name_ar = 'كعكة البيض الذائبة', description = 'Toasted English muffin stacked with fried eggs, crispy hash brown, melted cheese, creamy avocado & fresh greens.', description_ar = 'كعكة إنجليزية محمصة محشوة بالبيض المقلي، وبطاطس مقلية مقرمشة، وجبن ذائب، وأفوكادو كريمي، وخضراوات طازجة.',
      price = 57, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/aef79498-1de5-4012-a603-d2530ca103ff/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 140, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219675' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Breakfast Bowl', 'وعاء الإفطار', 'Potato tots with mixed vegetables, Grilled halloumi, boiled eggs, salad leaves,, olives & grilled cherry tomatoes', 'بطاطس توتس مع خضار مشكلة، حلومي مشوي، بيض مسلوق، أوراق سلطة، زيتون وطماطم كرزية مشوية', 69, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d3b2e47e-1317-4972-835e-ccd9f7880032/conversions/blob-optimized.jpg', '{}'::text[], 150, 'apetito:219675', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Breakfast Bowl', name_ar = 'وعاء الإفطار', description = 'Potato tots with mixed vegetables, Grilled halloumi, boiled eggs, salad leaves,, olives & grilled cherry tomatoes', description_ar = 'بطاطس توتس مع خضار مشكلة، حلومي مشوي، بيض مسلوق، أوراق سلطة، زيتون وطماطم كرزية مشوية',
      price = 69, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d3b2e47e-1317-4972-835e-ccd9f7880032/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 150, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219679' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Burrata and Avocado Tartine', 'تارتين البوراتا والأفوكادو', 'Rustic sourdough topped with creamy burrata, smashed avocado, pomegranate seed , & extra virgin olive oil.', 'خبز العجين المخمر الريفي المغطى بالبراتا الكريمية والأفوكادو المهروس وبذور الرمان وزيت الزيتون البكر الممتاز.', 65, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/33602bfd-add4-495f-9846-24d11c1fb8a7/conversions/blob-optimized.jpg', '{}'::text[], 160, 'apetito:219679', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Burrata and Avocado Tartine', name_ar = 'تارتين البوراتا والأفوكادو', description = 'Rustic sourdough topped with creamy burrata, smashed avocado, pomegranate seed , & extra virgin olive oil.', description_ar = 'خبز العجين المخمر الريفي المغطى بالبراتا الكريمية والأفوكادو المهروس وبذور الرمان وزيت الزيتون البكر الممتاز.',
      price = 65, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/33602bfd-add4-495f-9846-24d11c1fb8a7/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 160, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219680' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Creamy Truffle Wild Mushroom Toast', 'خبز محمص بالفطر البري مع الكمأة الكريمية', 'Toasted sourdough with garlic butter, topped with truffle cream cheese, mixed mushrooms & a drizzle of white truffle oil. & fresh black truffle saving', 'خبز العجين المخمر المحمص مع زبدة الثوم، ومغطى بجبنة كريمة الكمأة، وفطر مشكل، ورشة من زيت الكمأة البيضاء، وزيت الكمأة السوداء الطازج', 67, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/63a583ed-91e7-4a49-b74e-5fbc43f1c088/conversions/blob-optimized.jpg', '{}'::text[], 170, 'apetito:219680', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Creamy Truffle Wild Mushroom Toast', name_ar = 'خبز محمص بالفطر البري مع الكمأة الكريمية', description = 'Toasted sourdough with garlic butter, topped with truffle cream cheese, mixed mushrooms & a drizzle of white truffle oil. & fresh black truffle saving', description_ar = 'خبز العجين المخمر المحمص مع زبدة الثوم، ومغطى بجبنة كريمة الكمأة، وفطر مشكل، ورشة من زيت الكمأة البيضاء، وزيت الكمأة السوداء الطازج',
      price = 67, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/63a583ed-91e7-4a49-b74e-5fbc43f1c088/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 170, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219681' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Avocado Mushroom Toast', 'خبز محمص بالأفوكادو والفطر', 'Toasted sourdough with garlic butter, topped with sauteed mushrooms, and micro green', 'خبز العجين المخمر المحمص مع زبدة الثوم، ومغطى بالفطر المقلي والخضراوات الصغيرة', 67, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/31b50b5e-141d-46a3-be22-a352ce34be87/conversions/blob-optimized.jpg', '{}'::text[], 180, 'apetito:219681', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Avocado Mushroom Toast', name_ar = 'خبز محمص بالأفوكادو والفطر', description = 'Toasted sourdough with garlic butter, topped with sauteed mushrooms, and micro green', description_ar = 'خبز العجين المخمر المحمص مع زبدة الثوم، ومغطى بالفطر المقلي والخضراوات الصغيرة',
      price = 67, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/31b50b5e-141d-46a3-be22-a352ce34be87/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 180, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219683' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Smashed Avocado On Toast', 'أفوكادو مهروس على الخبز المحمص', 'Toasted sourdough topped with lightly smashed seasoned avocado, juicy heirloom tomatoes, crumbled feta & a drizzle of balsamic glaze.', 'خبز العجين المخمر المحمص مغطى بالأفوكادو المهروس قليلاً والطماطم الموروثة اللذيذة والجبن الفيتا المفتت ورشة من صلصة البلسميك.', 53, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/bdf26981-0a12-455f-9e27-f50b4d74e4a8/conversions/blob-optimized.jpg', '{}'::text[], 190, 'apetito:219683', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Smashed Avocado On Toast', name_ar = 'أفوكادو مهروس على الخبز المحمص', description = 'Toasted sourdough topped with lightly smashed seasoned avocado, juicy heirloom tomatoes, crumbled feta & a drizzle of balsamic glaze.', description_ar = 'خبز العجين المخمر المحمص مغطى بالأفوكادو المهروس قليلاً والطماطم الموروثة اللذيذة والجبن الفيتا المفتت ورشة من صلصة البلسميك.',
      price = 53, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/bdf26981-0a12-455f-9e27-f50b4d74e4a8/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 190, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219684' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Cheese On Toast', 'الجبن على الخبز المحمص', 'Sourdough topped with mixed cheese, bell peppers, onions, olives, confit tomatoes & fresh herbs.', 'خبز العجين المخمر مغطى بالجبن المختلط والفلفل الحلو والبصل والزيتون والطماطم المحفوظة والأعشاب الطازجة.', 55, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/85ad2773-9275-4f65-8ab3-4f128278ed77/conversions/blob-optimized.jpg', '{}'::text[], 200, 'apetito:219684', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Cheese On Toast', name_ar = 'الجبن على الخبز المحمص', description = 'Sourdough topped with mixed cheese, bell peppers, onions, olives, confit tomatoes & fresh herbs.', description_ar = 'خبز العجين المخمر مغطى بالجبن المختلط والفلفل الحلو والبصل والزيتون والطماطم المحفوظة والأعشاب الطازجة.',
      price = 55, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/85ad2773-9275-4f65-8ab3-4f128278ed77/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 200, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219685' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Oatmeal Porridge with Raspberry sauce & mix berries', 'عصيدة الشوفان مع صلصة التوت ومزيج التوت', 'flat roll oats cooked with organic coconut milk serve with mix berries & raspberry sauce', 'لفائف الشوفان المسطحة المطبوخة بحليب جوز الهند العضوي تقدم مع مزيج من التوت وصلصة التوت', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/2ccec30c-7cf1-4973-84bc-dc9688e7850c/conversions/blob-optimized.jpg', '{}'::text[], 210, 'apetito:219685', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Oatmeal Porridge with Raspberry sauce & mix berries', name_ar = 'عصيدة الشوفان مع صلصة التوت ومزيج التوت', description = 'flat roll oats cooked with organic coconut milk serve with mix berries & raspberry sauce', description_ar = 'لفائف الشوفان المسطحة المطبوخة بحليب جوز الهند العضوي تقدم مع مزيج من التوت وصلصة التوت',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/2ccec30c-7cf1-4973-84bc-dc9688e7850c/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 210, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219686' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Acai Power Bowl', 'أساي باور بول', 'Smooth organic açaí blend topped with fresh strawberries, blackberries, raspberries, red currants, banana slices & a sprinkle of chia seeds.', 'مزيج أساي عضوي ناعم مغطى بالفراولة الطازجة، والتوت الأسود، والتوت الأحمر، والكشمش الأحمر، وشرائح الموز، ورشة من بذور الشيا.', 65, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/20429083-e341-4b44-b1a5-0b8e3f73a294/conversions/blob-optimized.jpg', '{}'::text[], 220, 'apetito:219686', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Acai Power Bowl', name_ar = 'أساي باور بول', description = 'Smooth organic açaí blend topped with fresh strawberries, blackberries, raspberries, red currants, banana slices & a sprinkle of chia seeds.', description_ar = 'مزيج أساي عضوي ناعم مغطى بالفراولة الطازجة، والتوت الأسود، والتوت الأحمر، والكشمش الأحمر، وشرائح الموز، ورشة من بذور الشيا.',
      price = 65, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/20429083-e341-4b44-b1a5-0b8e3f73a294/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 220, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219689' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Granola Bowl With Mixed Berries', 'وعاء جرانولا مع التوت المختلط', 'Homemade crunchy granola served on a bowl of organic honey-whipped yogurt infused, topped with fresh mixed berries and honey.', 'جرانولا مقرمشة محلية الصنع تقدم في وعاء من الزبادي المخفوق العضوي الممزوج بالعسل، ومغطاة بالتوت الطازج والعسل.', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/44b514a2-1013-4249-8b44-df7af155269f/conversions/blob-optimized.jpg', '{}'::text[], 230, 'apetito:219689', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Granola Bowl With Mixed Berries', name_ar = 'وعاء جرانولا مع التوت المختلط', description = 'Homemade crunchy granola served on a bowl of organic honey-whipped yogurt infused, topped with fresh mixed berries and honey.', description_ar = 'جرانولا مقرمشة محلية الصنع تقدم في وعاء من الزبادي المخفوق العضوي الممزوج بالعسل، ومغطاة بالتوت الطازج والعسل.',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/44b514a2-1013-4249-8b44-df7af155269f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 230, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219691' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Hot Fudge Nutella French Toast', 'خبز محمص فرنسي بالنوتيلا والفادج الساخن', 'Brioche Bread, Creme Anglaise, Butter, Nutella, Brownie', 'خبز بريوش، كريمة انجليزية، زبدة، نوتيلا، براوني', 55, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3b8ca71f-836d-4d55-af01-1059222e557c/conversions/blob-optimized.jpg', '{}'::text[], 240, 'apetito:219691', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Hot Fudge Nutella French Toast', name_ar = 'خبز محمص فرنسي بالنوتيلا والفادج الساخن', description = 'Brioche Bread, Creme Anglaise, Butter, Nutella, Brownie', description_ar = 'خبز بريوش، كريمة انجليزية، زبدة، نوتيلا، براوني',
      price = 55, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3b8ca71f-836d-4d55-af01-1059222e557c/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 240, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219693' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chocoberry Speical Pancakes', 'فطائر شوكوبيري الخاصة', 'A fluffy stack of four golden pancakes topped with fresh mixed berries and a dusting of powdered sugar.', 'كومة رقيقة من أربع فطائر ذهبية اللون مغطاة بالتوت الطازج المختلط ورشة من السكر البودرة.', 65, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/7f5a4239-1917-4468-be11-2a6a050e609a/conversions/compressed-untitled-43-optimized.jpg', '{}'::text[], 250, 'apetito:219693', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chocoberry Speical Pancakes', name_ar = 'فطائر شوكوبيري الخاصة', description = 'A fluffy stack of four golden pancakes topped with fresh mixed berries and a dusting of powdered sugar.', description_ar = 'كومة رقيقة من أربع فطائر ذهبية اللون مغطاة بالتوت الطازج المختلط ورشة من السكر البودرة.',
      price = 65, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/7f5a4239-1917-4468-be11-2a6a050e609a/conversions/compressed-untitled-43-optimized.jpg', tags = '{}'::text[], sort_order = 250, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92299' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'SANDWICHES', 'السندويشات', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/be9158f6-2974-4cfa-a8dc-ece9664e4881/conversions/blob-small.jpg', 30, 'kitchen', 'apetito:92299') returning id into v_cat;
  else
    update menu_categories set name = 'SANDWICHES', name_ar = 'السندويشات', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/be9158f6-2974-4cfa-a8dc-ece9664e4881/conversions/blob-small.jpg', sort_order = 30, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219695' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Grilled Chicken & Pesto Sandwich', 'ساندويتش دجاج مشوي مع بيستو', 'Grilled Chicken Breast with sundried tomatoes, fresh greens & basil pesto on toasted panini bread. Served with fries.', 'صدر دجاج مشوي مع طماطم مجففة، خضراوات طازجة، وبيستو الريحان، على خبز بانيني محمص. يُقدم مع بطاطس مقلية.', 53, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/11f8e3e2-99e3-4216-97a5-513c408de5c0/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:219695', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Grilled Chicken & Pesto Sandwich', name_ar = 'ساندويتش دجاج مشوي مع بيستو', description = 'Grilled Chicken Breast with sundried tomatoes, fresh greens & basil pesto on toasted panini bread. Served with fries.', description_ar = 'صدر دجاج مشوي مع طماطم مجففة، خضراوات طازجة، وبيستو الريحان، على خبز بانيني محمص. يُقدم مع بطاطس مقلية.',
      price = 53, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/11f8e3e2-99e3-4216-97a5-513c408de5c0/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219696' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Pesto Halloumi Sandwich', 'ساندويتش بيستو حلومي', 'Grilled halloumi with sundried tomatoes, fresh greens & basil pesto on toasted panini bread. Served with fries.', 'حلوم مشوي مع طماطم مجففة، خضراوات طازجة، وبيستو الريحان، على خبز بانيني محمص. يُقدم مع بطاطا مقلية.', 53, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f20148d4-ec42-46d5-88f0-f33ee476200b/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:219696', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Pesto Halloumi Sandwich', name_ar = 'ساندويتش بيستو حلومي', description = 'Grilled halloumi with sundried tomatoes, fresh greens & basil pesto on toasted panini bread. Served with fries.', description_ar = 'حلوم مشوي مع طماطم مجففة، خضراوات طازجة، وبيستو الريحان، على خبز بانيني محمص. يُقدم مع بطاطا مقلية.',
      price = 53, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f20148d4-ec42-46d5-88f0-f33ee476200b/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219697' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chicken Sando Melt', 'ساندويتش دجاج ميلت', 'Brioche Bread, Spicy Chicken Breast, Cheese Sauce, Comeback Sauce, Side Salad, Potato Strips.', 'خبز بريوش، صدور دجاج حارة، صلصة الجبن، صلصة العودة، سلطة جانبية، شرائح البطاطس.', 69, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ec8bbb58-4c68-4c40-b83d-f0660d76b28f/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:219697', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chicken Sando Melt', name_ar = 'ساندويتش دجاج ميلت', description = 'Brioche Bread, Spicy Chicken Breast, Cheese Sauce, Comeback Sauce, Side Salad, Potato Strips.', description_ar = 'خبز بريوش، صدور دجاج حارة، صلصة الجبن، صلصة العودة، سلطة جانبية، شرائح البطاطس.',
      price = 69, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ec8bbb58-4c68-4c40-b83d-f0660d76b28f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219699' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chicken Club', 'نادي الدجاج', 'Brioche Slice Bread, Grilled Chicken Breast, Cheese, Fried Egg, Avocado, Tomato, Chipotle Mayo, Side Salad.', 'شريحة خبز بريوش، صدر دجاج مشوي، جبن، بيض مقلي، أفوكادو، طماطم، مايونيز شيبولتي، سلطة جانبية.', 69, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/96e7cc91-66a9-47d5-9704-b95c6b484215/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:219699', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chicken Club', name_ar = 'نادي الدجاج', description = 'Brioche Slice Bread, Grilled Chicken Breast, Cheese, Fried Egg, Avocado, Tomato, Chipotle Mayo, Side Salad.', description_ar = 'شريحة خبز بريوش، صدر دجاج مشوي، جبن، بيض مقلي، أفوكادو، طماطم، مايونيز شيبولتي، سلطة جانبية.',
      price = 69, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/96e7cc91-66a9-47d5-9704-b95c6b484215/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219700' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Buttermilk Chicken Burger', 'برجر دجاج باللبن الرائب', 'Crispy Nashville-style buttermilk chicken with lettuce, tomato, melted cheese, sweet relish & comeback–sriracha sauce in a soft potato bun. Served with salad or fries.', 'دجاج مقرمش على طريقة ناشفيل، مُغطى باللبن الرائب، مع خس، طماطم، جبن ذائب، مخلل حلو، وصلصة سريراتشا، في خبز بطاطس طري. يُقدم مع سلطة أو بطاطس مقلية.', 69, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/2f4fe63b-d65d-4166-a8aa-9951b8843ddf/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:219700', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Buttermilk Chicken Burger', name_ar = 'برجر دجاج باللبن الرائب', description = 'Crispy Nashville-style buttermilk chicken with lettuce, tomato, melted cheese, sweet relish & comeback–sriracha sauce in a soft potato bun. Served with salad or fries.', description_ar = 'دجاج مقرمش على طريقة ناشفيل، مُغطى باللبن الرائب، مع خس، طماطم، جبن ذائب، مخلل حلو، وصلصة سريراتشا، في خبز بطاطس طري. يُقدم مع سلطة أو بطاطس مقلية.',
      price = 69, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/2f4fe63b-d65d-4166-a8aa-9951b8843ddf/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219701' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Old Fashioned BBQ Wagyu Beef Burger', 'برجر لحم واغيو المشوي على الطريقة القديمة', 'Potato Bun, B.B.Q Wagyu Beef Patties, Lettuce, Comeback Sauce, Melted Cheese, Pickle Relish, & Caramelized Onion Serve with Side Salad Or French Fries', 'خبز البطاطس، فطائر لحم واغيو المشوية، خس، صلصة كام باك، جبن ذائب، مخلل، وبصل مكرمل، تقدم مع سلطة جانبية أو بطاطس مقلية', 79, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c586d9d0-8ef9-4b1f-9099-ba397e3009dc/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:219701', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Old Fashioned BBQ Wagyu Beef Burger', name_ar = 'برجر لحم واغيو المشوي على الطريقة القديمة', description = 'Potato Bun, B.B.Q Wagyu Beef Patties, Lettuce, Comeback Sauce, Melted Cheese, Pickle Relish, & Caramelized Onion Serve with Side Salad Or French Fries', description_ar = 'خبز البطاطس، فطائر لحم واغيو المشوية، خس، صلصة كام باك، جبن ذائب، مخلل، وبصل مكرمل، تقدم مع سلطة جانبية أو بطاطس مقلية',
      price = 79, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c586d9d0-8ef9-4b1f-9099-ba397e3009dc/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92300' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'APPETIZERS', 'المقبلات', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5a22659a-75e4-4485-8c96-5e496dac157a/conversions/blob-small.jpg', 40, 'kitchen', 'apetito:92300') returning id into v_cat;
  else
    update menu_categories set name = 'APPETIZERS', name_ar = 'المقبلات', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5a22659a-75e4-4485-8c96-5e496dac157a/conversions/blob-small.jpg', sort_order = 40, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219704' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'K-Pops', 'الكيبوب', 'Korean chicken pops tossed in spicy Korean BBQ sauce & sesame seeds. Served with ranch sauce.', 'قطع دجاج كورية مقرمشة مغموسة في صلصة الباربكيو الكورية الحارة وبذور السمسم. تقدم مع صلصة الرانش.', 49, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/30cbada1-88bb-40a4-916c-448a147a28fe/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:219704', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'K-Pops', name_ar = 'الكيبوب', description = 'Korean chicken pops tossed in spicy Korean BBQ sauce & sesame seeds. Served with ranch sauce.', description_ar = 'قطع دجاج كورية مقرمشة مغموسة في صلصة الباربكيو الكورية الحارة وبذور السمسم. تقدم مع صلصة الرانش.',
      price = 49, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/30cbada1-88bb-40a4-916c-448a147a28fe/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219706' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Roasted Corn Cobs', 'كيزان الذرة المشوية', 'Cornfed Tender Corn, Paprika Butter, Coriander, Chipotle Dip.', 'ذرة طرية من ذرة تتغذى على الذرة، زبدة البابريكا، الكزبرة، صلصة شيبوتلي.', 63, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3e2f0531-b2cc-4cfb-954a-537327260872/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:219706', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Roasted Corn Cobs', name_ar = 'كيزان الذرة المشوية', description = 'Cornfed Tender Corn, Paprika Butter, Coriander, Chipotle Dip.', description_ar = 'ذرة طرية من ذرة تتغذى على الذرة، زبدة البابريكا، الكزبرة، صلصة شيبوتلي.',
      price = 63, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3e2f0531-b2cc-4cfb-954a-537327260872/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219707' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Quesadilla', 'الكيساديلا', 'Tortilla Bread, Chicken Quesadilla Mix, Cheese, Sourcream, Guacamole, Salsa, Lemon.', 'خبز التورتيلا، مزيج كاساديا الدجاج، الجبن، الكريمة الحامضة، الجواكامولي، الصلصة، الليمون.', 49, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9c582502-7374-4e9e-b182-460efdc499ed/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:219707', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Quesadilla', name_ar = 'الكيساديلا', description = 'Tortilla Bread, Chicken Quesadilla Mix, Cheese, Sourcream, Guacamole, Salsa, Lemon.', description_ar = 'خبز التورتيلا، مزيج كاساديا الدجاج، الجبن، الكريمة الحامضة، الجواكامولي، الصلصة، الليمون.',
      price = 49, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9c582502-7374-4e9e-b182-460efdc499ed/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219709' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chicken Slider', 'شطيرة دجاج سلايدر', 'Brioche Bun, Crispy Chicken, Cheese Sauce, Iceburg, Sriracha Mayo, Pickle, French Fries, Ranch Sauce.', 'كعكة بريوش، دجاج مقرمش، صلصة الجبن، آيسبرغ، مايونيز سريراتشا، مخلل، بطاطس مقلية، صلصة رانش.', 63, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ac7c1e2b-2372-4f53-96b8-8351bf905403/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:219709', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chicken Slider', name_ar = 'شطيرة دجاج سلايدر', description = 'Brioche Bun, Crispy Chicken, Cheese Sauce, Iceburg, Sriracha Mayo, Pickle, French Fries, Ranch Sauce.', description_ar = 'كعكة بريوش، دجاج مقرمش، صلصة الجبن، آيسبرغ، مايونيز سريراتشا، مخلل، بطاطس مقلية، صلصة رانش.',
      price = 63, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ac7c1e2b-2372-4f53-96b8-8351bf905403/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219710' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Wagyu Beef Slider', 'شريحة لحم واغيو', 'Brioche Bun, Wagyu Beef Patty, Cheese Slice, baby jam lettuce, come back sauce, relish, & caramelize onion serve with French fries', 'خبز بريوش، فطيرة لحم واغيو، شريحة جبن، خس مربى صغير، صلصة باك، مخلل، وبصل مكرمل، يقدم مع بطاطس مقلية', 75, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c771ab6f-a0b8-4710-98f2-ad40564ed04f/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:219710', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Wagyu Beef Slider', name_ar = 'شريحة لحم واغيو', description = 'Brioche Bun, Wagyu Beef Patty, Cheese Slice, baby jam lettuce, come back sauce, relish, & caramelize onion serve with French fries', description_ar = 'خبز بريوش، فطيرة لحم واغيو، شريحة جبن، خس مربى صغير، صلصة باك، مخلل، وبصل مكرمل، يقدم مع بطاطس مقلية',
      price = 75, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c771ab6f-a0b8-4710-98f2-ad40564ed04f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219711' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Patatas Bravas', 'باتاتاس برافاس', 'Fried Potatoes, Bravas Sauce, Cheese, Salsa, Sour Cream', 'بطاطس مقلية، صلصة برافاس، جبن، صلصة، كريمة حامضة', 45, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/016be40e-08d1-4d87-9c66-02952de440fc/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:219711', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Patatas Bravas', name_ar = 'باتاتاس برافاس', description = 'Fried Potatoes, Bravas Sauce, Cheese, Salsa, Sour Cream', description_ar = 'بطاطس مقلية، صلصة برافاس، جبن، صلصة، كريمة حامضة',
      price = 45, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/016be40e-08d1-4d87-9c66-02952de440fc/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219712' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Dynamite Shrimp', 'روبيان ديناميت', 'Crispy tempura shrimp tossed in creamy dynamite sauce, topped with chives, black sesame & sakura.', 'روبيان تمبورا مقرمش ممزوج بصلصة الديناميت الكريمية، ومغطى بالثوم المعمر والسمسم الأسود والساكورا.', 63, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/60f93261-5732-452b-86f8-c41280f6dd80/conversions/blob-optimized.jpg', '{}'::text[], 70, 'apetito:219712', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Dynamite Shrimp', name_ar = 'روبيان ديناميت', description = 'Crispy tempura shrimp tossed in creamy dynamite sauce, topped with chives, black sesame & sakura.', description_ar = 'روبيان تمبورا مقرمش ممزوج بصلصة الديناميت الكريمية، ومغطى بالثوم المعمر والسمسم الأسود والساكورا.',
      price = 63, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/60f93261-5732-452b-86f8-c41280f6dd80/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 70, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92301' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'SOUPS', 'الشوربات', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f8985e3d-e8cf-436f-90c7-08ed1a4cfa9e/conversions/blob-small.jpg', 50, 'kitchen', 'apetito:92301') returning id into v_cat;
  else
    update menu_categories set name = 'SOUPS', name_ar = 'الشوربات', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f8985e3d-e8cf-436f-90c7-08ed1a4cfa9e/conversions/blob-small.jpg', sort_order = 50, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219713' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Wild Mushroom Soup', 'حساء الفطر البري', 'Wild Mushrooms, Dry Mushrooms, Leeks, Cream, Veg Broth, Toasted Bread', 'فطر بري، فطر جاف، كراث، كريمة، مرق خضار، خبز محمص', 37, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b4977296-a781-4bb3-aa5d-397685397bb6/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:219713', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Wild Mushroom Soup', name_ar = 'حساء الفطر البري', description = 'Wild Mushrooms, Dry Mushrooms, Leeks, Cream, Veg Broth, Toasted Bread', description_ar = 'فطر بري، فطر جاف، كراث، كريمة، مرق خضار، خبز محمص',
      price = 37, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b4977296-a781-4bb3-aa5d-397685397bb6/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219714' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Lentil Soup', 'شوربة العدس', 'Red Lentils, Veg Broth, Roasted Cumin Seed, Sweet Paprika, Paprika Oil & Toasted bread', 'عدس أحمر، مرق خضار، بذور كمون محمصة، بابريكا حلوة، زيت بابريكا وخبز محمص', 37, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/714ba7f9-cb0f-44ca-b4cb-24808c491dfb/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:219714', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Lentil Soup', name_ar = 'شوربة العدس', description = 'Red Lentils, Veg Broth, Roasted Cumin Seed, Sweet Paprika, Paprika Oil & Toasted bread', description_ar = 'عدس أحمر، مرق خضار، بذور كمون محمصة، بابريكا حلوة، زيت بابريكا وخبز محمص',
      price = 37, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/714ba7f9-cb0f-44ca-b4cb-24808c491dfb/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219715' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Roasted Tomato', 'طماطم مشوية', 'Roasted tomato soup made with butte, fresh basil, onion, carrot, garlic, fresh thyme serve with basil oil, toasted garlic bread', 'شوربة الطماطم المحمصة المصنوعة من الزبدة والريحان الطازج والبصل والجزر والثوم والزعتر الطازج تقدم مع زيت الريحان وخبز الثوم المحمص', 37, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d8d118f3-1af3-4a7a-ab45-3e1e67e355a0/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:219715', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Roasted Tomato', name_ar = 'طماطم مشوية', description = 'Roasted tomato soup made with butte, fresh basil, onion, carrot, garlic, fresh thyme serve with basil oil, toasted garlic bread', description_ar = 'شوربة الطماطم المحمصة المصنوعة من الزبدة والريحان الطازج والبصل والجزر والثوم والزعتر الطازج تقدم مع زيت الريحان وخبز الثوم المحمص',
      price = 37, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d8d118f3-1af3-4a7a-ab45-3e1e67e355a0/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92302' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'SALADS', 'السلطات', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/37134937-4443-4fd3-af34-2558722f2d7d/conversions/blob-small.jpg', 60, 'kitchen', 'apetito:92302') returning id into v_cat;
  else
    update menu_categories set name = 'SALADS', name_ar = 'السلطات', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/37134937-4443-4fd3-af34-2558722f2d7d/conversions/blob-small.jpg', sort_order = 60, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219716' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Baby Arugula Salad', 'سلطة الجرجير الصغير', 'Freshness In Every Leaf Baby Arugula, Fresh Berries, Orange Segment, Feta Cheese, Radish, Balsamic Glaze Dressing, & Olive Oil', 'نضارة في كل ورقة جرجير صغير، توت طازج، شريحة برتقال، جبنة فيتا، فجل، صلصة بلسميك، وزيت زيتون', 53, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e8eb19b0-8272-4d20-8a54-54bfa300fb9b/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:219716', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Baby Arugula Salad', name_ar = 'سلطة الجرجير الصغير', description = 'Freshness In Every Leaf Baby Arugula, Fresh Berries, Orange Segment, Feta Cheese, Radish, Balsamic Glaze Dressing, & Olive Oil', description_ar = 'نضارة في كل ورقة جرجير صغير، توت طازج، شريحة برتقال، جبنة فيتا، فجل، صلصة بلسميك، وزيت زيتون',
      price = 53, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e8eb19b0-8272-4d20-8a54-54bfa300fb9b/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219717' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Quinoa Salad', 'سلطة الكينوا', 'Quinoa Mix, Lettuce, Avocado, Roasted Bell Pepper, Heirloom Tomato, Lemon Herb Dressing', 'مزيج الكينوا، خس، أفوكادو، فلفل رومي مشوي، طماطم قديمة، صلصة ليمون وأعشاب', 53, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ccfb298f-df07-419b-9f5c-7a336c4d7042/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:219717', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Quinoa Salad', name_ar = 'سلطة الكينوا', description = 'Quinoa Mix, Lettuce, Avocado, Roasted Bell Pepper, Heirloom Tomato, Lemon Herb Dressing', description_ar = 'مزيج الكينوا، خس، أفوكادو، فلفل رومي مشوي، طماطم قديمة، صلصة ليمون وأعشاب',
      price = 53, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ccfb298f-df07-419b-9f5c-7a336c4d7042/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219718' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Avocado Ceasar Salad', 'سلطة سيزر بالأفوكادو', 'Baby Gem, Creamy Caesar Dressing, Avocado Cubes, Heirloom Tomato, Parmesan Cheese, Bread Crisp.', 'بيبي جيم، صلصة سيزر الكريمية، مكعبات الأفوكادو، الطماطم التراثية، جبن البارميزان، خبز مقرمش.', 63, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/63bd0f76-942d-43b0-a559-81b72e55f7b1/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:219718', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Avocado Ceasar Salad', name_ar = 'سلطة سيزر بالأفوكادو', description = 'Baby Gem, Creamy Caesar Dressing, Avocado Cubes, Heirloom Tomato, Parmesan Cheese, Bread Crisp.', description_ar = 'بيبي جيم، صلصة سيزر الكريمية، مكعبات الأفوكادو، الطماطم التراثية، جبن البارميزان، خبز مقرمش.',
      price = 63, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/63bd0f76-942d-43b0-a559-81b72e55f7b1/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219719' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Burrata Salad', 'سلطة بوراتا', 'Baby Arugula, Burrata, Mix Fresh Berry, Homemade Fruit Caviar, Cucumber,& Balsamic Dressing', 'جرجير صغير، بوراتا، مزيج من التوت الطازج، كافيار الفاكهة محلي الصنع، خيار، وصلصة بلسميك', 73, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/4a6801b3-3047-498c-8191-d2caa10f2eee/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:219719', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Burrata Salad', name_ar = 'سلطة بوراتا', description = 'Baby Arugula, Burrata, Mix Fresh Berry, Homemade Fruit Caviar, Cucumber,& Balsamic Dressing', description_ar = 'جرجير صغير، بوراتا، مزيج من التوت الطازج، كافيار الفاكهة محلي الصنع، خيار، وصلصة بلسميك',
      price = 73, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/4a6801b3-3047-498c-8191-d2caa10f2eee/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92303' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'BOWLS', 'أوعية', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/8f6f0c82-7756-4a54-b4ad-f0bc16a31f45/conversions/blob-small.jpg', 70, 'kitchen', 'apetito:92303') returning id into v_cat;
  else
    update menu_categories set name = 'BOWLS', name_ar = 'أوعية', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/8f6f0c82-7756-4a54-b4ad-f0bc16a31f45/conversions/blob-small.jpg', sort_order = 70, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219720' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Salmon Bowl', 'طبق السلمون', 'Norwegian Salmon, Gochujang Sauce, Quinoa Mix, Avocado, Mix Salad, Confit Tomatoes, Torched Corn, Mix Salad', 'سمك السلمون النرويجي، صلصة غوتشوجانغ، مزيج الكينوا، الأفوكادو، سلطة مشكلة، طماطم كونفي، ذرة مشوية، سلطة مشكلة', 75, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3edc4fe3-bcf8-49fe-a232-becce2f96b7d/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:219720', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Salmon Bowl', name_ar = 'طبق السلمون', description = 'Norwegian Salmon, Gochujang Sauce, Quinoa Mix, Avocado, Mix Salad, Confit Tomatoes, Torched Corn, Mix Salad', description_ar = 'سمك السلمون النرويجي، صلصة غوتشوجانغ، مزيج الكينوا، الأفوكادو، سلطة مشكلة، طماطم كونفي، ذرة مشوية، سلطة مشكلة',
      price = 75, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3edc4fe3-bcf8-49fe-a232-becce2f96b7d/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219721' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chicken Shawarma', 'شاورما دجاج', 'Loaded With Flavour, Rice Chicken Shawarma, Mediterranean Salad, Hummus, Tahini, Tomato Salsa And Green Salad ..', 'محملة بالنكهة، أرز شاورما دجاج، سلطة البحر الأبيض المتوسط، حمص، طحينة، صلصة الطماطم والسلطة الخضراء.', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3d177e42-560a-426a-a819-239f94f08e22/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:219721', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chicken Shawarma', name_ar = 'شاورما دجاج', description = 'Loaded With Flavour, Rice Chicken Shawarma, Mediterranean Salad, Hummus, Tahini, Tomato Salsa And Green Salad ..', description_ar = 'محملة بالنكهة، أرز شاورما دجاج، سلطة البحر الأبيض المتوسط، حمص، طحينة، صلصة الطماطم والسلطة الخضراء.',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3d177e42-560a-426a-a819-239f94f08e22/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219722' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Fire Cracker Chicken`', 'دجاج فاير كراكر', 'Fire Cracker Chicken Is A Tasty And Satisfying Stir Fry Bowl Made With Succulent Fired Chicken Tossed In A Tangy And Spicy Sauce. This Dish feature a medley of fresh Vegetable . Complimented With fluffy white Steamed Rice .This flery creation will make your taste buds dance and leave you pleasantly full .', 'دجاج فاير كراكر طبق مقلي شهي ومُرضٍ، مصنوع من دجاج مشوي شهي، ممزوج بصلصة لاذعة وحارة. يتميز هذا الطبق بمزيج من الخضراوات الطازجة، ويُقدم مع أرز أبيض مطهو على البخار. هذا الطبق اللذيذ سيُبهج براعم التذوق لديك ويمنحك شعورًا بالشبع.', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/93bfc0cd-ce53-4ab2-8341-eaa15e52562f/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:219722', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Fire Cracker Chicken`', name_ar = 'دجاج فاير كراكر', description = 'Fire Cracker Chicken Is A Tasty And Satisfying Stir Fry Bowl Made With Succulent Fired Chicken Tossed In A Tangy And Spicy Sauce. This Dish feature a medley of fresh Vegetable . Complimented With fluffy white Steamed Rice .This flery creation will make your taste buds dance and leave you pleasantly full .', description_ar = 'دجاج فاير كراكر طبق مقلي شهي ومُرضٍ، مصنوع من دجاج مشوي شهي، ممزوج بصلصة لاذعة وحارة. يتميز هذا الطبق بمزيج من الخضراوات الطازجة، ويُقدم مع أرز أبيض مطهو على البخار. هذا الطبق اللذيذ سيُبهج براعم التذوق لديك ويمنحك شعورًا بالشبع.',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/93bfc0cd-ce53-4ab2-8341-eaa15e52562f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219723' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Beef Sesame Noodles', 'نودلز لحم البقر بالسمسم', 'Stir Fry Noodles With Beef Strips, Vegetables, And Korean Spices.', 'المعكرونة المقلية مع شرائح اللحم البقري والخضروات والتوابل الكورية.', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ff9dd648-48bf-4985-b712-95713c8e70e5/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:219723', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Beef Sesame Noodles', name_ar = 'نودلز لحم البقر بالسمسم', description = 'Stir Fry Noodles With Beef Strips, Vegetables, And Korean Spices.', description_ar = 'المعكرونة المقلية مع شرائح اللحم البقري والخضروات والتوابل الكورية.',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ff9dd648-48bf-4985-b712-95713c8e70e5/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219724' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chicken Sesame Noodles', 'نودلز الدجاج بالسمسم', 'Stir Fry Noodles With Chicken Strips, Vegetables, And Korean Spices.', 'المعكرونة المقلية مع شرائح الدجاج والخضروات والتوابل الكورية.', 55, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/29ef6f3c-711d-4fb7-86e3-79158c37b82a/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:219724', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chicken Sesame Noodles', name_ar = 'نودلز الدجاج بالسمسم', description = 'Stir Fry Noodles With Chicken Strips, Vegetables, And Korean Spices.', description_ar = 'المعكرونة المقلية مع شرائح الدجاج والخضروات والتوابل الكورية.',
      price = 55, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/29ef6f3c-711d-4fb7-86e3-79158c37b82a/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219725' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chicken Santa Fe Bowl', 'وعاء دجاج سانتا في', 'Spicy Grilled Chicken, Quinoa Mix, Baby Mix Greens , Heirloom Tomatoes, Jalapenos, Avocado, Black Beans, & Tomato Salsa', 'دجاج مشوي حار، مزيج الكينوا، خضراوات مشكلة صغيرة، طماطم قديمة، فلفل هالبينو، أفوكادو، فاصوليا سوداء، وصلصة طماطم', 63, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/6a846cb3-4958-424b-8c8f-a28c72679cac/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:219725', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chicken Santa Fe Bowl', name_ar = 'وعاء دجاج سانتا في', description = 'Spicy Grilled Chicken, Quinoa Mix, Baby Mix Greens , Heirloom Tomatoes, Jalapenos, Avocado, Black Beans, & Tomato Salsa', description_ar = 'دجاج مشوي حار، مزيج الكينوا، خضراوات مشكلة صغيرة، طماطم قديمة، فلفل هالبينو، أفوكادو، فاصوليا سوداء، وصلصة طماطم',
      price = 63, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/6a846cb3-4958-424b-8c8f-a28c72679cac/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92304' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'MAINS', 'التيار الكهربائي', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/67d7bafc-db6f-4371-afab-c329460d6a51/conversions/blob-small.jpg', 80, 'kitchen', 'apetito:92304') returning id into v_cat;
  else
    update menu_categories set name = 'MAINS', name_ar = 'التيار الكهربائي', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/67d7bafc-db6f-4371-afab-c329460d6a51/conversions/blob-small.jpg', sort_order = 80, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219726' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Truffle Rigtoni Alfredo', 'ريجتوني ألفريدو بالكمأة', 'Creamy Truffle Sauce, Rigatoni Pasta, Grana Padano, Fresh Black Truffle & Truffle Oil.', 'صلصة الكمأة الكريمية، معكرونة ريجاتوني، جرانا بادانو، الكمأة السوداء الطازجة وزيت الكمأة.', 85, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5d2b458e-a9d9-4730-ae79-2c63eefebc03/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:219726', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Truffle Rigtoni Alfredo', name_ar = 'ريجتوني ألفريدو بالكمأة', description = 'Creamy Truffle Sauce, Rigatoni Pasta, Grana Padano, Fresh Black Truffle & Truffle Oil.', description_ar = 'صلصة الكمأة الكريمية، معكرونة ريجاتوني، جرانا بادانو، الكمأة السوداء الطازجة وزيت الكمأة.',
      price = 85, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5d2b458e-a9d9-4730-ae79-2c63eefebc03/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219729' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Wild Mushroom Risotto', 'ريزوتو الفطر البري', 'Mix Mushrooms, Mushroom Broth, Italian Rice, Grana Padano, Cheese Shavings, White Truffle Oil, Fresh Black Truffle, Parsley .', 'مزيج الفطر، مرق الفطر، الأرز الإيطالي، جرانا بادانو، رقائق الجبن، زيت الكمأة البيضاء، الكمأة السوداء الطازجة، البقدونس.', 79, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/540db591-5556-4fbe-bea8-875b78c58f0c/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:219729', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Wild Mushroom Risotto', name_ar = 'ريزوتو الفطر البري', description = 'Mix Mushrooms, Mushroom Broth, Italian Rice, Grana Padano, Cheese Shavings, White Truffle Oil, Fresh Black Truffle, Parsley .', description_ar = 'مزيج الفطر، مرق الفطر، الأرز الإيطالي، جرانا بادانو، رقائق الجبن، زيت الكمأة البيضاء، الكمأة السوداء الطازجة، البقدونس.',
      price = 79, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/540db591-5556-4fbe-bea8-875b78c58f0c/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219732' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Creamy Arrabbiata  Chicken Pasta', 'معكرونة دجاج أرابياتا بالكريمة', 'Penne pasta in creamy arrabbiata sauce, topped with herbed-crust chicken, grana padano & fresh basil.', 'معكرونة بيني في صلصة أرابياتا الكريمية، مغطاة بالدجاج المغطى بقشرة الأعشاب، وجبنة غرانابادانو، والريحان الطازج.', 69, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/20199865-1d23-45d0-ba88-eafb6c6b5f96/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:219732', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Creamy Arrabbiata  Chicken Pasta', name_ar = 'معكرونة دجاج أرابياتا بالكريمة', description = 'Penne pasta in creamy arrabbiata sauce, topped with herbed-crust chicken, grana padano & fresh basil.', description_ar = 'معكرونة بيني في صلصة أرابياتا الكريمية، مغطاة بالدجاج المغطى بقشرة الأعشاب، وجبنة غرانابادانو، والريحان الطازج.',
      price = 69, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/20199865-1d23-45d0-ba88-eafb6c6b5f96/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219734' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Grilled Chicken with Creamy Mushroom Sauce', 'دجاج مشوي مع صلصة الفطر الكريمية', 'Juicy grilled chicken breast served with creamy wild mushroom sauce & fresh herbs.', 'صدر دجاج مشوي شهي يقدم مع صلصة الفطر البري الكريمية والأعشاب الطازجة.', 71, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/678ced2f-0111-4cc1-accf-5157a04b6f75/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:219734', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Grilled Chicken with Creamy Mushroom Sauce', name_ar = 'دجاج مشوي مع صلصة الفطر الكريمية', description = 'Juicy grilled chicken breast served with creamy wild mushroom sauce & fresh herbs.', description_ar = 'صدر دجاج مشوي شهي يقدم مع صلصة الفطر البري الكريمية والأعشاب الطازجة.',
      price = 71, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/678ced2f-0111-4cc1-accf-5157a04b6f75/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219737' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Beef Tenderloin Steak with Creamy Mushroom Sauce', 'شريحة لحم تندرلوين مع صلصة الفطر الكريمية', 'Grilled Wagyu Tenderloin Served with Creamy Mushroom Sauce, Sauteed Exotic Vegetables.', 'لحم واغيو مشوي يقدم مع صلصة الفطر الكريمية، وخضراوات غريبة مقلية.', 149, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/23a42d49-e771-45e8-b8cc-eb70e8528719/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:219737', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Beef Tenderloin Steak with Creamy Mushroom Sauce', name_ar = 'شريحة لحم تندرلوين مع صلصة الفطر الكريمية', description = 'Grilled Wagyu Tenderloin Served with Creamy Mushroom Sauce, Sauteed Exotic Vegetables.', description_ar = 'لحم واغيو مشوي يقدم مع صلصة الفطر الكريمية، وخضراوات غريبة مقلية.',
      price = 149, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/23a42d49-e771-45e8-b8cc-eb70e8528719/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219735' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Grilled Salmon with Sweet Potato Puree', 'سمك السلمون المشوي مع هريس البطاطا الحلوة', 'Butter Grill Salmon, with Exotic Vegetables, & Sweet Potato Puree', 'سمك السلمون المشوي بالزبدة، مع خضراوات غريبة، وهريس البطاطا الحلوة', 75, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/da88d8ff-b10c-42df-8b8a-510a7a7a9bbe/conversions/blob-optimized.jpg', array['New']::text[], 60, 'apetito:219735', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Grilled Salmon with Sweet Potato Puree', name_ar = 'سمك السلمون المشوي مع هريس البطاطا الحلوة', description = 'Butter Grill Salmon, with Exotic Vegetables, & Sweet Potato Puree', description_ar = 'سمك السلمون المشوي بالزبدة، مع خضراوات غريبة، وهريس البطاطا الحلوة',
      price = 75, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/da88d8ff-b10c-42df-8b8a-510a7a7a9bbe/conversions/blob-optimized.jpg', tags = array['New']::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92308' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'KIDS MENU', 'قائمة طعام الأطفال', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/1691c3ed-9eca-4565-9a94-2cfb1dfd240e/conversions/blob-small.jpg', 90, 'kitchen', 'apetito:92308') returning id into v_cat;
  else
    update menu_categories set name = 'KIDS MENU', name_ar = 'قائمة طعام الأطفال', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/1691c3ed-9eca-4565-9a94-2cfb1dfd240e/conversions/blob-small.jpg', sort_order = 90, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219757' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Alfredo Penne Pasta Kids', 'معكرونة بيني ألفريدو للأطفال', 'Penne pasta tossed in creamy Alfredo sauce with parmesan cheese.', 'معكرونة بيني مغموسة في صلصة ألفريدو الكريمية مع جبن البارميزان.', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/16a0955d-daf5-4c3f-8334-c80a9aa63751/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:219757', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Alfredo Penne Pasta Kids', name_ar = 'معكرونة بيني ألفريدو للأطفال', description = 'Penne pasta tossed in creamy Alfredo sauce with parmesan cheese.', description_ar = 'معكرونة بيني مغموسة في صلصة ألفريدو الكريمية مع جبن البارميزان.',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/16a0955d-daf5-4c3f-8334-c80a9aa63751/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219758' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Classic Beef Slider Kids', 'برجر لحم بقري كلاسيكي للأطفال', 'One beef slider with melted cheese, served with fries & ketchup.', 'شطيرة لحم بقري صغيرة مع جبن ذائب، تقدم مع بطاطس مقلية وكاتشب.', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3f66b4d7-359b-41a2-9ac6-0c369b607051/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:219758', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Classic Beef Slider Kids', name_ar = 'برجر لحم بقري كلاسيكي للأطفال', description = 'One beef slider with melted cheese, served with fries & ketchup.', description_ar = 'شطيرة لحم بقري صغيرة مع جبن ذائب، تقدم مع بطاطس مقلية وكاتشب.',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3f66b4d7-359b-41a2-9ac6-0c369b607051/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219759' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Classic Chicken Slider Kids', 'ساندوتش دجاج كلاسيكي للأطفال', 'One crispy chicken slider with melted cheese, served with fries & ketchup.', 'شطيرة دجاج مقرمشة واحدة مع جبن ذائب، تقدم مع البطاطس المقلية والكاتشب.', 26, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f20576e6-1786-4cda-8081-e379af770d10/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:219759', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Classic Chicken Slider Kids', name_ar = 'ساندوتش دجاج كلاسيكي للأطفال', description = 'One crispy chicken slider with melted cheese, served with fries & ketchup.', description_ar = 'شطيرة دجاج مقرمشة واحدة مع جبن ذائب، تقدم مع البطاطس المقلية والكاتشب.',
      price = 26, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f20576e6-1786-4cda-8081-e379af770d10/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219760' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Crispy Chicken Tenders and Fries Kids', 'قطع دجاج مقرمشة وبطاطس مقلية للأطفال', 'Crispy chicken tenders served with fries & ketchup.', 'قطع دجاج مقرمشة تقدم مع البطاطس المقلية والكاتشب.', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d57039a8-f4f1-4c5e-b549-97afb5c3746f/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:219760', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Crispy Chicken Tenders and Fries Kids', name_ar = 'قطع دجاج مقرمشة وبطاطس مقلية للأطفال', description = 'Crispy chicken tenders served with fries & ketchup.', description_ar = 'قطع دجاج مقرمشة تقدم مع البطاطس المقلية والكاتشب.',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d57039a8-f4f1-4c5e-b549-97afb5c3746f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219761' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Toasted Cheese Melt Kids', 'ساندوتش الجبن المحمص للأطفال', 'Toasted sandwich with melted cheese, served with fries & ketchup.', 'ساندوتش محمص مع جبن ذائب، يقدم مع بطاطس مقلية وكاتشب.', 24, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/da9eb91a-a410-4ac6-8e63-50ee3260ce9c/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:219761', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Toasted Cheese Melt Kids', name_ar = 'ساندوتش الجبن المحمص للأطفال', description = 'Toasted sandwich with melted cheese, served with fries & ketchup.', description_ar = 'ساندوتش محمص مع جبن ذائب، يقدم مع بطاطس مقلية وكاتشب.',
      price = 24, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/da9eb91a-a410-4ac6-8e63-50ee3260ce9c/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219762' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Mac and Cheese', 'معكرونة بالجبن', 'Creamy macaroni pasta baked with melted cheese.', 'معكرونة بالكريمة مخبوزة مع الجبن الذائب.', 25, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/a0baf295-0ff3-4cb2-9c84-0406f09b0a2f/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:219762', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Mac and Cheese', name_ar = 'معكرونة بالجبن', description = 'Creamy macaroni pasta baked with melted cheese.', description_ar = 'معكرونة بالكريمة مخبوزة مع الجبن الذائب.',
      price = 25, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/a0baf295-0ff3-4cb2-9c84-0406f09b0a2f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92309' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'BAKERY', 'مخبز', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ea71bc1f-f13d-48b2-8b1e-3ab5bc059251/conversions/blob-small.jpg', 100, 'kitchen', 'apetito:92309') returning id into v_cat;
  else
    update menu_categories set name = 'BAKERY', name_ar = 'مخبز', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ea71bc1f-f13d-48b2-8b1e-3ab5bc059251/conversions/blob-small.jpg', sort_order = 100, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219763' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Bread Basket', 'سلة الخبز', 'Slices of multigrain and turmeric sourdough, cut and served warm.', 'شرائح من الخبز المخمر متعدد الحبوب والكركم، مقطعة ومقدمة دافئة.', 25, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/08c8e500-a4e7-4ded-93a0-550130e0a8d6/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:219763', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Bread Basket', name_ar = 'سلة الخبز', description = 'Slices of multigrain and turmeric sourdough, cut and served warm.', description_ar = 'شرائح من الخبز المخمر متعدد الحبوب والكركم، مقطعة ومقدمة دافئة.',
      price = 25, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/08c8e500-a4e7-4ded-93a0-550130e0a8d6/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219764' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Almond Croissant', 'كرواسون اللوز', 'Buttery croissant filled with almond cream and topped with toasted almond flakes.', 'كرواسون زبداني محشو بكريمة اللوز ومغطى برقائق اللوز المحمصة.', 17, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c4e6967c-cada-491a-b541-59635b40cbb3/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:219764', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Almond Croissant', name_ar = 'كرواسون اللوز', description = 'Buttery croissant filled with almond cream and topped with toasted almond flakes.', description_ar = 'كرواسون زبداني محشو بكريمة اللوز ومغطى برقائق اللوز المحمصة.',
      price = 17, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c4e6967c-cada-491a-b541-59635b40cbb3/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219765' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Cheese Croissant', 'كرواسون الجبن', 'Buttery croissant filled with a blend of three cheeses.', 'كرواسون زبداني محشو بمزيج من ثلاثة أنواع من الجبن.', 17, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/039170fb-4059-4d29-87ba-917dde1ef962/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:219765', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Cheese Croissant', name_ar = 'كرواسون الجبن', description = 'Buttery croissant filled with a blend of three cheeses.', description_ar = 'كرواسون زبداني محشو بمزيج من ثلاثة أنواع من الجبن.',
      price = 17, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/039170fb-4059-4d29-87ba-917dde1ef962/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219766' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Butter Croissant', 'كرواسون الزبدة', 'Freshly baked, classic French butter croissant.', 'كرواسون الزبدة الفرنسي الكلاسيكي الطازج.', 13, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d3d36ada-6c7c-4afd-99b7-3701f32caa32/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:219766', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Butter Croissant', name_ar = 'كرواسون الزبدة', description = 'Freshly baked, classic French butter croissant.', description_ar = 'كرواسون الزبدة الفرنسي الكلاسيكي الطازج.',
      price = 13, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d3d36ada-6c7c-4afd-99b7-3701f32caa32/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219767' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Pain Au Chocolate', 'خبز الشوكولاتة', 'Flaky French pastry filled with rich chocolate.', 'معجنات فرنسية متقشرة محشوة بالشوكولاتة الغنية.', 17, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b5f9f495-fbea-468c-86d6-23e8c2a472d6/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:219767', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Pain Au Chocolate', name_ar = 'خبز الشوكولاتة', description = 'Flaky French pastry filled with rich chocolate.', description_ar = 'معجنات فرنسية متقشرة محشوة بالشوكولاتة الغنية.',
      price = 17, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b5f9f495-fbea-468c-86d6-23e8c2a472d6/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92311' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'CHOCOBERRY TREATS', 'حلوى الشوكولاتة والتوت', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/218ce8c3-6297-4ea0-a050-8603ff6193b6/conversions/1bce941a132252916b0e4ba3a915afd1-thumbnail.jpg', 110, 'kitchen', 'apetito:92311') returning id into v_cat;
  else
    update menu_categories set name = 'CHOCOBERRY TREATS', name_ar = 'حلوى الشوكولاتة والتوت', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/218ce8c3-6297-4ea0-a050-8603ff6193b6/conversions/1bce941a132252916b0e4ba3a915afd1-thumbnail.jpg', sort_order = 110, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219793' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chocolate Chip Cookie Dough', 'عجينة كوكيز رقائق الشوكولاتة', 'Choco Chip WhoaCookie Dough, Chocolate Chips, Melted Milk Chocolate', 'عجينة كوكيز رقائق الشوكولاتة، رقائق الشوكولاتة، شوكولاتة الحليب المذابة', 50, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9b98b2c6-f37a-4fcc-8c3a-feab08de315a/conversions/cd3826899042ea901e48d228e0c739a4-optimized.jpg', '{}'::text[], 10, 'apetito:219793', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chocolate Chip Cookie Dough', name_ar = 'عجينة كوكيز رقائق الشوكولاتة', description = 'Choco Chip WhoaCookie Dough, Chocolate Chips, Melted Milk Chocolate', description_ar = 'عجينة كوكيز رقائق الشوكولاتة، رقائق الشوكولاتة، شوكولاتة الحليب المذابة',
      price = 50, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9b98b2c6-f37a-4fcc-8c3a-feab08de315a/conversions/cd3826899042ea901e48d228e0c739a4-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219794' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'White Chocolate Chip Cookie Dough', 'عجينة كوكيز رقائق الشوكولاتة البيضاء', 'Cookie Dough, White Chocolate Chips, Melted White Chocolate', 'عجينة الكوكيز، رقائق الشوكولاتة البيضاء، شوكولاتة بيضاء مذابة', 50, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e6f14389-0df4-44d9-995e-dcf9eea374bf/conversions/0c437ba298c01bfc49e4a4cea5f483e0-optimized.jpg', '{}'::text[], 20, 'apetito:219794', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'White Chocolate Chip Cookie Dough', name_ar = 'عجينة كوكيز رقائق الشوكولاتة البيضاء', description = 'Cookie Dough, White Chocolate Chips, Melted White Chocolate', description_ar = 'عجينة الكوكيز، رقائق الشوكولاتة البيضاء، شوكولاتة بيضاء مذابة',
      price = 50, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e6f14389-0df4-44d9-995e-dcf9eea374bf/conversions/0c437ba298c01bfc49e4a4cea5f483e0-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219799' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Berrylicious Choco-Cup', 'كوب شوكولاتة بالتوت اللذيذ', null, null, 75, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/64173459-dd4d-4587-99b8-18e39a4344cd/conversions/compressed-chatgpt-image-feb-27-2026-10-42-47-am-optimized.jpg', '{}'::text[], 30, 'apetito:219799', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Berrylicious Choco-Cup', name_ar = 'كوب شوكولاتة بالتوت اللذيذ', description = null, description_ar = null,
      price = 75, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/64173459-dd4d-4587-99b8-18e39a4344cd/conversions/compressed-chatgpt-image-feb-27-2026-10-42-47-am-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219800' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chocolate Covered Strawberries Selection', 'تشكيلة من الفراولة المغطاة بالشوكولاتة', 'Selection Of Fresh Strawberries Dipped Finest Chocolate Dark, Milk, White, Rose', 'تشكيلة من الفراولة الطازجة المغطسة بأفخر أنواع الشوكولاتة: الداكنة، والحليب، والبيضاء، والوردية', 59, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b2923b0b-4f95-45bc-bb14-c36e1dcdd695/conversions/a9cfd89a17f20662eb702b567b5c0dc7-optimized.jpg', '{}'::text[], 40, 'apetito:219800', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chocolate Covered Strawberries Selection', name_ar = 'تشكيلة من الفراولة المغطاة بالشوكولاتة', description = 'Selection Of Fresh Strawberries Dipped Finest Chocolate Dark, Milk, White, Rose', description_ar = 'تشكيلة من الفراولة الطازجة المغطسة بأفخر أنواع الشوكولاتة: الداكنة، والحليب، والبيضاء، والوردية',
      price = 59, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b2923b0b-4f95-45bc-bb14-c36e1dcdd695/conversions/a9cfd89a17f20662eb702b567b5c0dc7-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:95906' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'SIGNATURE MATCHAS', 'أعواد الثقاب المميزة', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b792201f-cc5b-4995-89c1-5ab8cc25ae68/conversions/blob-small.jpg', 120, 'kitchen', 'apetito:95906') returning id into v_cat;
  else
    update menu_categories set name = 'SIGNATURE MATCHAS', name_ar = 'أعواد الثقاب المميزة', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b792201f-cc5b-4995-89c1-5ab8cc25ae68/conversions/blob-small.jpg', sort_order = 120, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:240559' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced Blueberry Marble Matcha', 'ماتشا بنكهة التوت الأزرق المثلجة', null, null, 35, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/cc3c6c69-f115-4b45-8344-965528f751f3/conversions/compressed-blueberry-matcha-optimized.jpg', '{}'::text[], 10, 'apetito:240559', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced Blueberry Marble Matcha', name_ar = 'ماتشا بنكهة التوت الأزرق المثلجة', description = null, description_ar = null,
      price = 35, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/cc3c6c69-f115-4b45-8344-965528f751f3/conversions/compressed-blueberry-matcha-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:240560' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced Strawberry Matcha', 'ماتشا الفراولة المثلجة', 'Ice Matcha latte with strawberry foam', 'لاتيه ماتشا مثلج مع رغوة الفراولة', 35, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/166d75b5-c267-4d33-82b7-be4a252ebdff/conversions/compressed-strawberry-matcha-optimized.jpg', '{}'::text[], 20, 'apetito:240560', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced Strawberry Matcha', name_ar = 'ماتشا الفراولة المثلجة', description = 'Ice Matcha latte with strawberry foam', description_ar = 'لاتيه ماتشا مثلج مع رغوة الفراولة',
      price = 35, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/166d75b5-c267-4d33-82b7-be4a252ebdff/conversions/compressed-strawberry-matcha-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:240561' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced Mango Matcha', 'مانجو ماتشا مثلجة', 'Mango Matcha', 'مانجو ماتشا', 35, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/93c13a2d-8e01-42ec-966a-7ebf8ba1ad2d/conversions/compressed-mango-matcha-optimized.jpg', '{}'::text[], 30, 'apetito:240561', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced Mango Matcha', name_ar = 'مانجو ماتشا مثلجة', description = 'Mango Matcha', description_ar = 'مانجو ماتشا',
      price = 35, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/93c13a2d-8e01-42ec-966a-7ebf8ba1ad2d/conversions/compressed-mango-matcha-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:240562' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Matcha Latte', 'ماتشا لاتيه', 'Matcha Latte', 'ماتشا لاتيه', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ccc3e596-6dc6-45fc-9f75-e9502e4f150d/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:240562', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Matcha Latte', name_ar = 'ماتشا لاتيه', description = 'Matcha Latte', description_ar = 'ماتشا لاتيه',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ccc3e596-6dc6-45fc-9f75-e9502e4f150d/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:240563' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced Matcha Latte', 'لاتيه ماتشا مثلج', 'Refreshing chilled matcha with milk.', 'الماتشا المثلج المنعش مع الحليب.', 30, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/733cb45b-73f5-4576-b0b9-5ff7e4107827/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:240563', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced Matcha Latte', name_ar = 'لاتيه ماتشا مثلج', description = 'Refreshing chilled matcha with milk.', description_ar = 'الماتشا المثلج المنعش مع الحليب.',
      price = 30, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/733cb45b-73f5-4576-b0b9-5ff7e4107827/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:240564' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Ice Matcha Latte With Salted Vanila', 'لاتيه ماتشا مثلج مع فانيليا مملحة', 'Indulge In The Perfect Harmony Of Sweet And Salty: Salted Caramel Mocha Bliss Double Espresso, Steamed Milk, Salted Caramel Sauce, Fresh Cream', 'استمتع بتناغم مثالي بين الحلاوة والملوحة: موكا الكراميل المملح، قهوة إسبريسو مزدوجة، حليب مبخر، صلصة الكراميل المملح، كريمة طازجة', 33, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ca99636f-190c-4a4a-81a7-b7cee87fd5dc/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:240564', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Ice Matcha Latte With Salted Vanila', name_ar = 'لاتيه ماتشا مثلج مع فانيليا مملحة', description = 'Indulge In The Perfect Harmony Of Sweet And Salty: Salted Caramel Mocha Bliss Double Espresso, Steamed Milk, Salted Caramel Sauce, Fresh Cream', description_ar = 'استمتع بتناغم مثالي بين الحلاوة والملوحة: موكا الكراميل المملح، قهوة إسبريسو مزدوجة، حليب مبخر، صلصة الكراميل المملح، كريمة طازجة',
      price = 33, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ca99636f-190c-4a4a-81a7-b7cee87fd5dc/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92313' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'SIGNATURE COFFEE', 'قهوة مميزة', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/1d06fe69-0bf7-4134-94c5-6cdc711f88e0/conversions/blob-small.jpg', 130, 'kitchen', 'apetito:92313') returning id into v_cat;
  else
    update menu_categories set name = 'SIGNATURE COFFEE', name_ar = 'قهوة مميزة', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/1d06fe69-0bf7-4134-94c5-6cdc711f88e0/conversions/blob-small.jpg', sort_order = 130, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219811' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Spanish Latte', 'لاتيه إسباني', 'Double Espresso, Steamed Milk, Condensed Milk', 'إسبريسو مزدوج، حليب مبخر، حليب مكثف', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/6b8be8cc-1bdc-4f8b-8f8b-414c0e0ddf85/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:219811', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Spanish Latte', name_ar = 'لاتيه إسباني', description = 'Double Espresso, Steamed Milk, Condensed Milk', description_ar = 'إسبريسو مزدوج، حليب مبخر، حليب مكثف',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/6b8be8cc-1bdc-4f8b-8f8b-414c0e0ddf85/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219812' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Mocha', 'موكا', 'Indulge in the Rich Harmony of Chocolate of Double Espresso, Steamed Milk, Dark Chocolate Sauce, Fresh Cream', 'استمتع بالتناغم الغني بين شوكولاتة الإسبريسو المزدوج والحليب المبخر وصلصة الشوكولاتة الداكنة والكريمة الطازجة', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/44af2a45-c15c-45bd-a1a2-e4fb568659da/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:219812', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Mocha', name_ar = 'موكا', description = 'Indulge in the Rich Harmony of Chocolate of Double Espresso, Steamed Milk, Dark Chocolate Sauce, Fresh Cream', description_ar = 'استمتع بالتناغم الغني بين شوكولاتة الإسبريسو المزدوج والحليب المبخر وصلصة الشوكولاتة الداكنة والكريمة الطازجة',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/44af2a45-c15c-45bd-a1a2-e4fb568659da/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219813' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Salted Caramel Latte', 'لاتيه الكراميل المملح', 'Latte infused with caramel and a touch of sea salt.', 'لاتيه مع الكراميل مع لمسة من ملح البحر.', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b061d44b-4f84-4f27-8598-c678d33c4241/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:219813', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Salted Caramel Latte', name_ar = 'لاتيه الكراميل المملح', description = 'Latte infused with caramel and a touch of sea salt.', description_ar = 'لاتيه مع الكراميل مع لمسة من ملح البحر.',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/b061d44b-4f84-4f27-8598-c678d33c4241/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219814' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'White Mocha', 'موكا بيضاء', 'Espresso with white chocolate and silky steamed milk.', 'إسبرسو مع الشوكولاتة البيضاء والحليب المبخر الحريري.', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/10ebbcdf-2111-40ec-89c1-bffca870309e/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:219814', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'White Mocha', name_ar = 'موكا بيضاء', description = 'Espresso with white chocolate and silky steamed milk.', description_ar = 'إسبرسو مع الشوكولاتة البيضاء والحليب المبخر الحريري.',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/10ebbcdf-2111-40ec-89c1-bffca870309e/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219815' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Qahwa', 'قهوة', 'Traditional Arabic coffee with cardamom & spices.', 'القهوة العربية التقليدية مع الهيل والتوابل.', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/54bcf41b-156f-4b8c-aee1-f651cb21b5a2/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:219815', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Qahwa', name_ar = 'قهوة', description = 'Traditional Arabic coffee with cardamom & spices.', description_ar = 'القهوة العربية التقليدية مع الهيل والتوابل.',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/54bcf41b-156f-4b8c-aee1-f651cb21b5a2/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:231725' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Saudi Qahwa', 'القهوة السعودية', null, null, 28, null, '{}'::text[], 60, 'apetito:231725', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Saudi Qahwa', name_ar = 'القهوة السعودية', description = null, description_ar = null,
      price = 28, image_url = null, tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219816' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Turkish Coffee', 'القهوة التركية', 'Strong, aromatic coffee brewed the authentic way.', 'قهوة قوية وعطرية تم تحضيرها بالطريقة الأصيلة.', 26, null, '{}'::text[], 70, 'apetito:219816', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Turkish Coffee', name_ar = 'القهوة التركية', description = 'Strong, aromatic coffee brewed the authentic way.', description_ar = 'قهوة قوية وعطرية تم تحضيرها بالطريقة الأصيلة.',
      price = 26, image_url = null, tags = '{}'::text[], sort_order = 70, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219817' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'V60', 'V60', 'Chilled, slow-brewed pour-over served over ice.', 'مشروب بارد يتم تحضيره ببطء ويتم تقديمه مع الثلج.', 34, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/78c54c51-8519-4ffb-986c-19f416697926/conversions/blob-optimized.jpg', '{}'::text[], 80, 'apetito:219817', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'V60', name_ar = 'V60', description = 'Chilled, slow-brewed pour-over served over ice.', description_ar = 'مشروب بارد يتم تحضيره ببطء ويتم تقديمه مع الثلج.',
      price = 34, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/78c54c51-8519-4ffb-986c-19f416697926/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 80, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92312' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'COFFEE', 'قهوة', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/6d7235d2-a63b-4d06-bec0-b1c0b3047b79/conversions/blob-small.jpg', 140, 'kitchen', 'apetito:92312') returning id into v_cat;
  else
    update menu_categories set name = 'COFFEE', name_ar = 'قهوة', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/6d7235d2-a63b-4d06-bec0-b1c0b3047b79/conversions/blob-small.jpg', sort_order = 140, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219802' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Espresso', 'إسبريسو', 'Single Origin Arabica Beans', 'حبوب أرابيكا من مصدر واحد', 18, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/36b8f725-5989-4466-b3e5-4083e2f7aed3/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:219802', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Espresso', name_ar = 'إسبريسو', description = 'Single Origin Arabica Beans', description_ar = 'حبوب أرابيكا من مصدر واحد',
      price = 18, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/36b8f725-5989-4466-b3e5-4083e2f7aed3/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219803' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Espresso Macchiato', 'إسبرسو ماكياتو', 'A Perfect Dance of Bold and Smooth -- Espresso Macchiato Magic in Every single sip Origin Arabica Beans, Milk Foam', 'رقصة مثالية من الجرأة والنعومة - سحر الإسبريسو ماكياتو في كل رشفة حبوب أرابيكا الأصلية، رغوة الحليب', 23, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/39eab791-eed2-4f76-b12e-e1a58f8330f4/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:219803', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Espresso Macchiato', name_ar = 'إسبرسو ماكياتو', description = 'A Perfect Dance of Bold and Smooth -- Espresso Macchiato Magic in Every single sip Origin Arabica Beans, Milk Foam', description_ar = 'رقصة مثالية من الجرأة والنعومة - سحر الإسبريسو ماكياتو في كل رشفة حبوب أرابيكا الأصلية، رغوة الحليب',
      price = 23, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/39eab791-eed2-4f76-b12e-e1a58f8330f4/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219832' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Hot Chocolate', 'شكولاته ساخنة', null, null, 34, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e1bf7386-e956-4c21-a32a-08273bfb6f35/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:219832', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Hot Chocolate', name_ar = 'شكولاته ساخنة', description = null, description_ar = null,
      price = 34, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e1bf7386-e956-4c21-a32a-08273bfb6f35/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219804' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Americano', 'أمريكانو', null, null, 24, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/97e5738a-2200-4c95-916d-9b717196c021/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:219804', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Americano', name_ar = 'أمريكانو', description = null, description_ar = null,
      price = 24, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/97e5738a-2200-4c95-916d-9b717196c021/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219805' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Caffe Latte', 'كافيه لاتيه', 'Embrace The Creamy Bliss Of Every Caffe Latte Single Espresso, Steamed Milk', 'استمتع بالنكهة الكريمية لكل قهوة لاتيه مع إسبريسو واحد وحليب مبخر', 24, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/4935b9cc-e469-4a81-ba03-a3fefc431d1f/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:219805', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Caffe Latte', name_ar = 'كافيه لاتيه', description = 'Embrace The Creamy Bliss Of Every Caffe Latte Single Espresso, Steamed Milk', description_ar = 'استمتع بالنكهة الكريمية لكل قهوة لاتيه مع إسبريسو واحد وحليب مبخر',
      price = 24, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/4935b9cc-e469-4a81-ba03-a3fefc431d1f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219806' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Cappuccino', 'كابتشينو', 'ingle Espresso, Foamed Steamed Milk', 'إنجل إسبريسو، حليب مبخر رغوي', 24, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/15bc23d9-f0d1-4de4-9846-1bbecaa05ae7/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:219806', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Cappuccino', name_ar = 'كابتشينو', description = 'ingle Espresso, Foamed Steamed Milk', description_ar = 'إنجل إسبريسو، حليب مبخر رغوي',
      price = 24, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/15bc23d9-f0d1-4de4-9846-1bbecaa05ae7/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219807' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Flat White', 'فلات وايت', 'Elegance In Every Sip -- Flat White Coffee PerfectiontteDouble Espresso, Steamed Milk', 'أناقة في كل رشفة - قهوة فلات وايت المثالية، إسبرسو مزدوج، حليب مبخر', 24, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/cd10656a-de33-4789-9519-a7bb78c9cf1f/conversions/blob-optimized.jpg', '{}'::text[], 70, 'apetito:219807', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Flat White', name_ar = 'فلات وايت', description = 'Elegance In Every Sip -- Flat White Coffee PerfectiontteDouble Espresso, Steamed Milk', description_ar = 'أناقة في كل رشفة - قهوة فلات وايت المثالية، إسبرسو مزدوج، حليب مبخر',
      price = 24, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/cd10656a-de33-4789-9519-a7bb78c9cf1f/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 70, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219808' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Piccolo Latte', 'بيكولو لاتيه', 'Single Espresso, Steamed Milk', 'إسبرسو فردي، حليب مبخر', 23, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/2a6e4b36-253d-48c2-b896-3790171381a8/conversions/blob-optimized.jpg', '{}'::text[], 80, 'apetito:219808', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Piccolo Latte', name_ar = 'بيكولو لاتيه', description = 'Single Espresso, Steamed Milk', description_ar = 'إسبرسو فردي، حليب مبخر',
      price = 23, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/2a6e4b36-253d-48c2-b896-3790171381a8/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 80, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219809' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Cortado latte', 'كورتادو لاتيه', 'A Perfect Harmony of espresso and foam -- The Cortado Late BlissDouble Espresso, Steamed Milk', 'تناغم مثالي بين الإسبريسو والرغوة - كورتادو ليت بليس، إسبريسو مزدوج، حليب مبخر', 24, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d596bb8d-23b4-4f91-a6bf-1fa037e08485/conversions/blob-optimized.jpg', '{}'::text[], 90, 'apetito:219809', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Cortado latte', name_ar = 'كورتادو لاتيه', description = 'A Perfect Harmony of espresso and foam -- The Cortado Late BlissDouble Espresso, Steamed Milk', description_ar = 'تناغم مثالي بين الإسبريسو والرغوة - كورتادو ليت بليس، إسبريسو مزدوج، حليب مبخر',
      price = 24, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d596bb8d-23b4-4f91-a6bf-1fa037e08485/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 90, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92315' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'COLD COFFEE', 'قهوة باردة', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/36b89d97-827c-43cc-b835-da8c31942191/conversions/blob-small.jpg', 150, 'kitchen', 'apetito:92315') returning id into v_cat;
  else
    update menu_categories set name = 'COLD COFFEE', name_ar = 'قهوة باردة', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/36b89d97-827c-43cc-b835-da8c31942191/conversions/blob-small.jpg', sort_order = 150, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219824' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced Latte', 'لاتيه مثلج', 'Chill with Every Sip: The Perfect Iced Latte Double Expresso, Cold Foamed Milk', 'استرخِ مع كل رشفة: لاتيه مثلج مثالي، دبل إكسبرسو، حليب رغوي بارد', 24, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d08a3b98-1080-4711-a52f-9232ec9d35be/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:219824', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced Latte', name_ar = 'لاتيه مثلج', description = 'Chill with Every Sip: The Perfect Iced Latte Double Expresso, Cold Foamed Milk', description_ar = 'استرخِ مع كل رشفة: لاتيه مثلج مثالي، دبل إكسبرسو، حليب رغوي بارد',
      price = 24, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d08a3b98-1080-4711-a52f-9232ec9d35be/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219825' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced Spanish Latte', 'لاتيه إسباني مثلج', 'Double Espresso, Cold Foamed Milk, Condense Milk', 'إسبريسو مزدوج، حليب رغوي بارد، حليب مكثف', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/45582350-923a-4651-a599-6a58725af2d0/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:219825', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced Spanish Latte', name_ar = 'لاتيه إسباني مثلج', description = 'Double Espresso, Cold Foamed Milk, Condense Milk', description_ar = 'إسبريسو مزدوج، حليب رغوي بارد، حليب مكثف',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/45582350-923a-4651-a599-6a58725af2d0/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219826' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced Mocha', 'موكا مثلجة', 'Chill Out With A Dreamy Iced Mocha Double Espresso, Cold Foamed Milk, Dark Chocolate Sauce, Cream', 'استرخِ مع موكا مثلج حالم مع إسبريسو مزدوج، حليب رغوي بارد، صلصة شوكولاتة داكنة، كريمة', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3f64c202-2628-4817-8361-d7f2d9ea0cbe/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:219826', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced Mocha', name_ar = 'موكا مثلجة', description = 'Chill Out With A Dreamy Iced Mocha Double Espresso, Cold Foamed Milk, Dark Chocolate Sauce, Cream', description_ar = 'استرخِ مع موكا مثلج حالم مع إسبريسو مزدوج، حليب رغوي بارد، صلصة شوكولاتة داكنة، كريمة',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/3f64c202-2628-4817-8361-d7f2d9ea0cbe/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219827' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced American', 'مثلج أمريكي', 'Chill Out With Our Refreshing Iced American Delight Double Espresso, Iced Water', 'استمتع بالاسترخاء مع قهوتنا الأمريكية المثلجة المنعشة دبل إسبريسو، مع الماء المثلج', 24, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/31fa10b4-6562-4dac-8b02-257cf895af82/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:219827', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced American', name_ar = 'مثلج أمريكي', description = 'Chill Out With Our Refreshing Iced American Delight Double Espresso, Iced Water', description_ar = 'استمتع بالاسترخاء مع قهوتنا الأمريكية المثلجة المنعشة دبل إسبريسو، مع الماء المثلج',
      price = 24, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/31fa10b4-6562-4dac-8b02-257cf895af82/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92317' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'TEAS', 'الشاي', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c965e92a-96ea-434b-bafc-cbd67d679be4/conversions/compressed-chatgpt-image-apr-22-2026-03-31-36-pm-small.jpg', 160, 'kitchen', 'apetito:92317') returning id into v_cat;
  else
    update menu_categories set name = 'TEAS', name_ar = 'الشاي', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/c965e92a-96ea-434b-bafc-cbd67d679be4/conversions/compressed-chatgpt-image-apr-22-2026-03-31-36-pm-small.jpg', sort_order = 160, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219833' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Organic English Breakfast', 'إفطار إنجليزي عضوي', 'Full-bodied, traditional black tea.', 'شاي أسود تقليدي كامل القوام.', 25, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/bbb3c561-9084-4f1b-a070-c105d1b7f924/conversions/compressed-chatgpt-image-apr-22-2026-03-26-29-pm-optimized.jpg', '{}'::text[], 10, 'apetito:219833', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Organic English Breakfast', name_ar = 'إفطار إنجليزي عضوي', description = 'Full-bodied, traditional black tea.', description_ar = 'شاي أسود تقليدي كامل القوام.',
      price = 25, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/bbb3c561-9084-4f1b-a070-c105d1b7f924/conversions/compressed-chatgpt-image-apr-22-2026-03-26-29-pm-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219834' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Organic Green Tea', 'شاي أخضر عضوي', 'Smooth, light & refreshing green tea.', 'شاي أخضر ناعم وخفيف ومنعش.', 27, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/49a15346-47b8-4b6d-9c11-d18b7ed324aa/conversions/compressed-chatgpt-image-apr-22-2026-03-22-03-pm-optimized.jpg', '{}'::text[], 20, 'apetito:219834', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Organic Green Tea', name_ar = 'شاي أخضر عضوي', description = 'Smooth, light & refreshing green tea.', description_ar = 'شاي أخضر ناعم وخفيف ومنعش.',
      price = 27, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/49a15346-47b8-4b6d-9c11-d18b7ed324aa/conversions/compressed-chatgpt-image-apr-22-2026-03-22-03-pm-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219835' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Moroccan Tea', 'الشاي المغربي', 'Refreshing green tea with fresh mint & sweetness.', 'شاي أخضر منعش بنكهة النعناع الطازج والحلاوة.', 27, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e8764bfc-6f89-4ab6-9576-9385d95aabb5/conversions/compressed-chatgpt-image-apr-22-2026-03-33-12-pm-optimized.jpg', '{}'::text[], 30, 'apetito:219835', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Moroccan Tea', name_ar = 'الشاي المغربي', description = 'Refreshing green tea with fresh mint & sweetness.', description_ar = 'شاي أخضر منعش بنكهة النعناع الطازج والحلاوة.',
      price = 27, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e8764bfc-6f89-4ab6-9576-9385d95aabb5/conversions/compressed-chatgpt-image-apr-22-2026-03-33-12-pm-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219836' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Organic Chamomile', 'البابونج العضوي', 'Gentle, calming herbal tea.', 'شاي أعشاب لطيف ومهدئ.', 27, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/67ece08a-2d65-4003-8615-d4a14628b347/conversions/compressed-chatgpt-image-apr-22-2026-03-43-59-pm-optimized.jpg', '{}'::text[], 40, 'apetito:219836', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Organic Chamomile', name_ar = 'البابونج العضوي', description = 'Gentle, calming herbal tea.', description_ar = 'شاي أعشاب لطيف ومهدئ.',
      price = 27, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/67ece08a-2d65-4003-8615-d4a14628b347/conversions/compressed-chatgpt-image-apr-22-2026-03-43-59-pm-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219837' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Organic Earl Grey', 'شاي إيرل جراي عضوي', 'Fragrant saffron tea with a touch of rose honey.', 'شاي الزعفران العطري مع لمسة من عسل الورد.', 27, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/12712609-4dad-498b-bffe-d96afa0436a9/conversions/compressed-chatgpt-image-apr-22-2026-03-23-57-pm-optimized.jpg', '{}'::text[], 50, 'apetito:219837', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Organic Earl Grey', name_ar = 'شاي إيرل جراي عضوي', description = 'Fragrant saffron tea with a touch of rose honey.', description_ar = 'شاي الزعفران العطري مع لمسة من عسل الورد.',
      price = 27, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/12712609-4dad-498b-bffe-d96afa0436a9/conversions/compressed-chatgpt-image-apr-22-2026-03-23-57-pm-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:233825' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Almond Coconut Tea', 'شاي اللوز وجوز الهند', null, null, 27, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e9ecb128-a0ca-4359-817d-ddf084777846/conversions/compressed-chatgpt-image-apr-22-2026-03-29-41-pm-optimized.jpg', '{}'::text[], 60, 'apetito:233825', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Almond Coconut Tea', name_ar = 'شاي اللوز وجوز الهند', description = null, description_ar = null,
      price = 27, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/e9ecb128-a0ca-4359-817d-ddf084777846/conversions/compressed-chatgpt-image-apr-22-2026-03-29-41-pm-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:233826' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Hibiscus Tea', 'شاي الكركديه', null, null, 29, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/da19da52-dff8-4bc8-af2d-1be368c7f4e3/conversions/compressed-chatgpt-image-apr-22-2026-03-31-36-pm-optimized.jpg', '{}'::text[], 70, 'apetito:233826', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Hibiscus Tea', name_ar = 'شاي الكركديه', description = null, description_ar = null,
      price = 29, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/da19da52-dff8-4bc8-af2d-1be368c7f4e3/conversions/compressed-chatgpt-image-apr-22-2026-03-31-36-pm-optimized.jpg', tags = '{}'::text[], sort_order = 70, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92318' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'MOCKTAILS', 'الكوكتيلات غير الكحولية', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/1333024d-7018-4f9f-a45c-8cc54981a8d5/conversions/blob-thumbnail.jpg', 170, 'kitchen', 'apetito:92318') returning id into v_cat;
  else
    update menu_categories set name = 'MOCKTAILS', name_ar = 'الكوكتيلات غير الكحولية', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/1333024d-7018-4f9f-a45c-8cc54981a8d5/conversions/blob-thumbnail.jpg', sort_order = 170, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219839' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Blue Tropical Mojito', 'موخيتو استوائي أزرق', 'Escape to Paradise with Every Sip of Our Blue Tropical Mojito. Lime Juice, Blue Curacao, Soda Water, Smoked Lemon Syrup', 'انطلق إلى عالمٍ من النعيم مع كل رشفة من موهيتو بلو تروبيكال. عصير ليمون، بلو كوراساو، مياه غازية، وشراب ليمون مدخن.', 35, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/1333024d-7018-4f9f-a45c-8cc54981a8d5/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:219839', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Blue Tropical Mojito', name_ar = 'موخيتو استوائي أزرق', description = 'Escape to Paradise with Every Sip of Our Blue Tropical Mojito. Lime Juice, Blue Curacao, Soda Water, Smoked Lemon Syrup', description_ar = 'انطلق إلى عالمٍ من النعيم مع كل رشفة من موهيتو بلو تروبيكال. عصير ليمون، بلو كوراساو، مياه غازية، وشراب ليمون مدخن.',
      price = 35, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/1333024d-7018-4f9f-a45c-8cc54981a8d5/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219840' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Lemon & Peach Mojito', 'موهيتو الليمون والخوخ', 'Refreshing Delight: Lemon & Peach MojitoLemon Juice, Peach Puree, Peach Fruit, Soda Water, Sugar, Ice', 'متعة منعشة: موهيتو الليمون والخوخ، عصير ليمون، هريس خوخ، فاكهة خوخ، ماء صودا، سكر، ثلج', 28, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/66d7019f-e6a0-4be8-b8b5-6900ae5f2505/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:219840', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Lemon & Peach Mojito', name_ar = 'موهيتو الليمون والخوخ', description = 'Refreshing Delight: Lemon & Peach MojitoLemon Juice, Peach Puree, Peach Fruit, Soda Water, Sugar, Ice', description_ar = 'متعة منعشة: موهيتو الليمون والخوخ، عصير ليمون، هريس خوخ، فاكهة خوخ، ماء صودا، سكر، ثلج',
      price = 28, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/66d7019f-e6a0-4be8-b8b5-6900ae5f2505/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219841' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Mango Passion Mojito', 'موهيتو مانجو باشن', 'Mango Passion Mojito, featuring a tropical blend of mango and passion fruit sauce, fresh mint, and soda water, garnished beautifully with fresh mint leaves, passion fruit, and dried lemon slices over crushed ice.', 'موهيتو مانجو باشن، يتميز بمزيج استوائي من صلصة المانجو والباشن فروت، والنعناع الطازج، والمياه الغازية، ومزين بشكل جميل بأوراق النعناع الطازجة، والباشن فروت، وشرائح الليمون المجففة على الثلج المجروش.', 35, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/eeb1da56-d6b1-4fbb-8afa-5fdcaa19182c/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:219841', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Mango Passion Mojito', name_ar = 'موهيتو مانجو باشن', description = 'Mango Passion Mojito, featuring a tropical blend of mango and passion fruit sauce, fresh mint, and soda water, garnished beautifully with fresh mint leaves, passion fruit, and dried lemon slices over crushed ice.', description_ar = 'موهيتو مانجو باشن، يتميز بمزيج استوائي من صلصة المانجو والباشن فروت، والنعناع الطازج، والمياه الغازية، ومزين بشكل جميل بأوراق النعناع الطازجة، والباشن فروت، وشرائح الليمون المجففة على الثلج المجروش.',
      price = 35, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/eeb1da56-d6b1-4fbb-8afa-5fdcaa19182c/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219842' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Mixed Berry', 'التوت المختلط', 'Mixed Berry Mojito, featuring a vibrant combination of raspberry and mixed berry sauce, refreshing mint syrup, and zesty lemon juice, topped with soda water and garnished beautifully with fresh berries, mint leaves, and a dried lemon slice.', 'موخيتو التوت المختلط، يتميز بمزيج نابض بالحياة من صلصة التوت البري والتوت المختلط، وشراب النعناع المنعش، وعصير الليمون المنعش، ومغطى بمياه الصودا ومزين بشكل جميل بالتوت الطازج وأوراق النعناع وشريحة الليمون المجففة.', 35, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/2d50879a-09ef-4fb2-8970-c6476f2934be/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:219842', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Mixed Berry', name_ar = 'التوت المختلط', description = 'Mixed Berry Mojito, featuring a vibrant combination of raspberry and mixed berry sauce, refreshing mint syrup, and zesty lemon juice, topped with soda water and garnished beautifully with fresh berries, mint leaves, and a dried lemon slice.', description_ar = 'موخيتو التوت المختلط، يتميز بمزيج نابض بالحياة من صلصة التوت البري والتوت المختلط، وشراب النعناع المنعش، وعصير الليمون المنعش، ومغطى بمياه الصودا ومزين بشكل جميل بالتوت الطازج وأوراق النعناع وشريحة الليمون المجففة.',
      price = 35, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/2d50879a-09ef-4fb2-8970-c6476f2934be/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219843' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Passion  Orange Mojito', 'موهيتو البرتقال العاطفي', 'Orange Juice, Passion Fruit Purry, Lemon Juice, Soda Water, Sugar, Ice', 'عصير برتقال، هريس فاكهة العاطفة، عصير ليمون، ماء صودا، سكر، ثلج', 33, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/94407a36-aef2-4658-bcbc-550083bf6a07/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:219843', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Passion  Orange Mojito', name_ar = 'موهيتو البرتقال العاطفي', description = 'Orange Juice, Passion Fruit Purry, Lemon Juice, Soda Water, Sugar, Ice', description_ar = 'عصير برتقال، هريس فاكهة العاطفة، عصير ليمون، ماء صودا، سكر، ثلج',
      price = 33, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/94407a36-aef2-4658-bcbc-550083bf6a07/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219844' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Strawberry Mojito', 'موهيتو الفراولة', 'Refreshing Sweet with a strawberry Twist Lemon Juice, Strawberry Puree, Fresh Strawberries, Soda Water, Sugar, Ice', 'حلوى منعشة مع لمسة من الفراولة عصير ليمون، هريس الفراولة، فراولة طازجة، ماء صودا، سكر، ثلج', 33, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/206aea89-c438-4d36-b757-a34ee4923821/conversions/blob-optimized.jpg', '{}'::text[], 60, 'apetito:219844', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Strawberry Mojito', name_ar = 'موهيتو الفراولة', description = 'Refreshing Sweet with a strawberry Twist Lemon Juice, Strawberry Puree, Fresh Strawberries, Soda Water, Sugar, Ice', description_ar = 'حلوى منعشة مع لمسة من الفراولة عصير ليمون، هريس الفراولة، فراولة طازجة، ماء صودا، سكر، ثلج',
      price = 33, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/206aea89-c438-4d36-b757-a34ee4923821/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 60, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219845' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Peach Tea', 'شاي الخوخ', null, null, 32, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/a026d61f-08c9-4f2e-b5dd-387afdadbf06/conversions/blob-optimized.jpg', '{}'::text[], 70, 'apetito:219845', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Peach Tea', name_ar = 'شاي الخوخ', description = null, description_ar = null,
      price = 32, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/a026d61f-08c9-4f2e-b5dd-387afdadbf06/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 70, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:234317' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Iced Hibiscus Tea', 'شاي الكركديه المثلج', null, null, 32, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d4307410-c7b5-44b1-ab37-49bd3ecde52b/conversions/compressed-chatgpt-image-apr-25-2026-04-10-18-pm-optimized.jpg', array['Bestseller','New']::text[], 80, 'apetito:234317', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Iced Hibiscus Tea', name_ar = 'شاي الكركديه المثلج', description = null, description_ar = null,
      price = 32, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d4307410-c7b5-44b1-ab37-49bd3ecde52b/conversions/compressed-chatgpt-image-apr-25-2026-04-10-18-pm-optimized.jpg', tags = array['Bestseller','New']::text[], sort_order = 80, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92319' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'SMOOTHIES', 'العصائر', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9f67f7e3-c947-4165-95d4-0d60b1686f32/conversions/blob-small.jpg', 180, 'kitchen', 'apetito:92319') returning id into v_cat;
  else
    update menu_categories set name = 'SMOOTHIES', name_ar = 'العصائر', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/9f67f7e3-c947-4165-95d4-0d60b1686f32/conversions/blob-small.jpg', sort_order = 180, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219846' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Acai & Wild Berry', 'أساي والتوت البري', 'Refresh Your Day With A Burst Of Acai & Wild Berry BlissAcai Berry, Wild Berry Sauce, Ice, Almond Milk', 'أنعش يومك بنكهة فاكهة الآساي والتوت البري، صلصة التوت البري، الثلج، حليب اللوز', 38, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/96384729-05d5-4b2b-940b-d6bea9054a61/conversions/blob-optimized.jpg', '{}'::text[], 10, 'apetito:219846', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Acai & Wild Berry', name_ar = 'أساي والتوت البري', description = 'Refresh Your Day With A Burst Of Acai & Wild Berry BlissAcai Berry, Wild Berry Sauce, Ice, Almond Milk', description_ar = 'أنعش يومك بنكهة فاكهة الآساي والتوت البري، صلصة التوت البري، الثلج، حليب اللوز',
      price = 38, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/96384729-05d5-4b2b-940b-d6bea9054a61/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219847' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Mango Smoothie', 'عصير المانجو', 'Mango, Passion Fruit, Pineapple, Ice, Apple Juice', 'مانجو، باشن فروت، أناناس، ثلج، عصير تفاح', 38, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/fdf8e0a7-9731-4a53-9159-ea0112c966be/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:219847', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Mango Smoothie', name_ar = 'عصير المانجو', description = 'Mango, Passion Fruit, Pineapple, Ice, Apple Juice', description_ar = 'مانجو، باشن فروت، أناناس، ثلج، عصير تفاح',
      price = 38, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/fdf8e0a7-9731-4a53-9159-ea0112c966be/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219848' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Green Energizer', 'المنشط الأخضر', 'Spinach, Celeray, Broccoli, Mango, Banana, Pineapple, Ice', 'السبانخ، الكرفس، البروكلي، المانجو، الموز، الأناناس، الثلج', 38, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ae941fac-c815-4b71-a460-0635c7b070d8/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:219848', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Green Energizer', name_ar = 'المنشط الأخضر', description = 'Spinach, Celeray, Broccoli, Mango, Banana, Pineapple, Ice', description_ar = 'السبانخ، الكرفس، البروكلي، المانجو، الموز، الأناناس، الثلج',
      price = 38, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/ae941fac-c815-4b71-a460-0635c7b070d8/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219849' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Pink Berry Smoothie', 'عصير التوت الوردي', 'Strawberry, Pink Dragon Fruit, Ice', 'الفراولة، فاكهة التنين الوردية، الثلج', 38, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/67e39e01-5089-4346-a654-fb4b884c0f8b/conversions/blob-optimized.jpg', '{}'::text[], 40, 'apetito:219849', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Pink Berry Smoothie', name_ar = 'عصير التوت الوردي', description = 'Strawberry, Pink Dragon Fruit, Ice', description_ar = 'الفراولة، فاكهة التنين الوردية، الثلج',
      price = 38, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/67e39e01-5089-4346-a654-fb4b884c0f8b/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219850' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Cookie Shake', 'ميلك شيك الكوكيز', 'Indulge In A Dreamy Cookie Shake -- Sweet Bliss In Evert SipOreo Cookie, Gelato, Ice, Milk', 'استمتع بكوكيز شيك حالمة - نعيم حلو في كل مشروب أوريو كوكيز، جيلاتو، ثلج، حليب', 38, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5b605765-4419-463c-a8a0-41f0fd5ae36b/conversions/blob-optimized.jpg', '{}'::text[], 50, 'apetito:219850', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Cookie Shake', name_ar = 'ميلك شيك الكوكيز', description = 'Indulge In A Dreamy Cookie Shake -- Sweet Bliss In Evert SipOreo Cookie, Gelato, Ice, Milk', description_ar = 'استمتع بكوكيز شيك حالمة - نعيم حلو في كل مشروب أوريو كوكيز، جيلاتو، ثلج، حليب',
      price = 38, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5b605765-4419-463c-a8a0-41f0fd5ae36b/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92320' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'FRESH JUICES', 'عصائر طازجة', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/509becfd-d80d-4caf-a067-38c14539b724/conversions/e0e28279850fc99a32a31f032ac7a078-thumbnail.jpg', 190, 'kitchen', 'apetito:92320') returning id into v_cat;
  else
    update menu_categories set name = 'FRESH JUICES', name_ar = 'عصائر طازجة', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/509becfd-d80d-4caf-a067-38c14539b724/conversions/e0e28279850fc99a32a31f032ac7a078-thumbnail.jpg', sort_order = 190, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219851' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Watermelon Juice', 'عصير البطيخ', null, null, 25, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/509becfd-d80d-4caf-a067-38c14539b724/conversions/e0e28279850fc99a32a31f032ac7a078-optimized.jpg', '{}'::text[], 10, 'apetito:219851', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Watermelon Juice', name_ar = 'عصير البطيخ', description = null, description_ar = null,
      price = 25, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/509becfd-d80d-4caf-a067-38c14539b724/conversions/e0e28279850fc99a32a31f032ac7a078-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219852' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Fresh Orange Juice', 'عصير برتقال طازج', 'Freshly Squeezed Juice', 'عصير طازج', 25, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/feb1574c-fff4-444b-9710-7738ad9ff75d/conversions/a6a590d9a1d8dda3ed8b53d5bcabad3d-optimized.jpg', '{}'::text[], 20, 'apetito:219852', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Fresh Orange Juice', name_ar = 'عصير برتقال طازج', description = 'Freshly Squeezed Juice', description_ar = 'عصير طازج',
      price = 25, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/feb1574c-fff4-444b-9710-7738ad9ff75d/conversions/a6a590d9a1d8dda3ed8b53d5bcabad3d-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219853' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Apple Juice', 'عصير التفاح', 'Crisp & naturally sweet Freshly-pressed apple juice.', 'عصير تفاح طازج ومنعش وحلو بشكل طبيعي.', 25, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/cb51111d-b205-4cf3-b363-fa99b51c319d/conversions/blob-optimized.jpg', '{}'::text[], 30, 'apetito:219853', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Apple Juice', name_ar = 'عصير التفاح', description = 'Crisp & naturally sweet Freshly-pressed apple juice.', description_ar = 'عصير تفاح طازج ومنعش وحلو بشكل طبيعي.',
      price = 25, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/cb51111d-b205-4cf3-b363-fa99b51c319d/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:92324' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'LIMITED TIME OFFERS', 'عروض لفترة محدودة', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/802f7153-029e-4608-9d35-acfe925ad5b7/conversions/blob-thumbnail.jpg', 200, 'kitchen', 'apetito:92324') returning id into v_cat;
  else
    update menu_categories set name = 'LIMITED TIME OFFERS', name_ar = 'عروض لفترة محدودة', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/802f7153-029e-4608-9d35-acfe925ad5b7/conversions/blob-thumbnail.jpg', sort_order = 200, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219871' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Coffee & Cake(2PM to 6PM only)', 'القهوة والكعك (من الساعة 2 ظهراً إلى الساعة 6 مساءً فقط)', 'Dessert: Carrot Cake , Moka Cake, Amalfi Lemon, Calamansi Tart, Pistachio & Rose, Vanilla Meringue, Coconut Rice PuddingDrink: Latte, Cappuccino, Flat White, Americano, English Breakfast Tea', 'الحلويات: كيكة الجزر، كيكة الموكا، ليمون أمالفي، تارت كالامانسي، فستق وورد، مرنغ الفانيليا، بودنغ أرز جوز الهند المشروبات: لاتيه، كابتشينو، فلات وايت، أمريكانو، شاي الإفطار الإنجليزي', 49, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/62cf5bc9-24ab-4463-8847-cc9f63bc266d/conversions/compressed-chocoberry-021-optimized.jpg', '{}'::text[], 10, 'apetito:219871', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Coffee & Cake(2PM to 6PM only)', name_ar = 'القهوة والكعك (من الساعة 2 ظهراً إلى الساعة 6 مساءً فقط)', description = 'Dessert: Carrot Cake , Moka Cake, Amalfi Lemon, Calamansi Tart, Pistachio & Rose, Vanilla Meringue, Coconut Rice PuddingDrink: Latte, Cappuccino, Flat White, Americano, English Breakfast Tea', description_ar = 'الحلويات: كيكة الجزر، كيكة الموكا، ليمون أمالفي، تارت كالامانسي، فستق وورد، مرنغ الفانيليا، بودنغ أرز جوز الهند المشروبات: لاتيه، كابتشينو، فلات وايت، أمريكانو، شاي الإفطار الإنجليزي',
      price = 49, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/62cf5bc9-24ab-4463-8847-cc9f63bc266d/conversions/compressed-chocoberry-021-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219872' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Coffee & Croissant', 'قهوة وكرواسون', null, null, 29, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/8d35d5cf-957d-4598-85f8-c7ef3351a873/conversions/blob-optimized.jpg', '{}'::text[], 20, 'apetito:219872', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Coffee & Croissant', name_ar = 'قهوة وكرواسون', description = null, description_ar = null,
      price = 29, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/8d35d5cf-957d-4598-85f8-c7ef3351a873/conversions/blob-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:219875' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Breakfast Combo', 'وجبة إفطار متكاملة', 'Main: Classic English, The Mediterranean, Classic French Omelette, Cheese OmeletteToast: Cheese on toast, Avocado On Toast, Mushroom on Toast.Dessert: Chocoberry Pancakes, Strawberry Crepe, Banoffee CrepeDrink: Latte, Cappuccino, Flat White, Americano, English Breakfast Tea, Orange Juice', 'الأطباق الرئيسية: أومليت إنجليزي كلاسيكي، أومليت متوسطي، أومليت فرنسي كلاسيكي، أومليت بالجبن خبز محمص: جبن على خبز محمص، أفوكادو على خبز محمص، فطر على خبز محمص. الحلويات: فطائر الشوكولاتة والتوت، كريب الفراولة، كريب الموز والتوفي المشروبات: لاتيه، كابتشينو، فلات وايت، أمريكانو، شاي الإفطار الإنجليزي، عصير البرتقال', 69, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/631e50b9-13d9-4499-bfbc-71a67b83ee9f/conversions/compressed-dsc4979-edit-optimized.jpg', '{}'::text[], 30, 'apetito:219875', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Breakfast Combo', name_ar = 'وجبة إفطار متكاملة', description = 'Main: Classic English, The Mediterranean, Classic French Omelette, Cheese OmeletteToast: Cheese on toast, Avocado On Toast, Mushroom on Toast.Dessert: Chocoberry Pancakes, Strawberry Crepe, Banoffee CrepeDrink: Latte, Cappuccino, Flat White, Americano, English Breakfast Tea, Orange Juice', description_ar = 'الأطباق الرئيسية: أومليت إنجليزي كلاسيكي، أومليت متوسطي، أومليت فرنسي كلاسيكي، أومليت بالجبن خبز محمص: جبن على خبز محمص، أفوكادو على خبز محمص، فطر على خبز محمص. الحلويات: فطائر الشوكولاتة والتوت، كريب الفراولة، كريب الموز والتوفي المشروبات: لاتيه، كابتشينو، فلات وايت، أمريكانو، شاي الإفطار الإنجليزي، عصير البرتقال',
      price = 69, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/631e50b9-13d9-4499-bfbc-71a67b83ee9f/conversions/compressed-dsc4979-edit-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:97526' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'PREORDER CAKE', 'كعكة للطلب المسبق', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/63f72233-211c-4e32-aa03-a3f4aaebdf98/conversions/compressed-dsc4965-small.jpg', 210, 'kitchen', 'apetito:97526') returning id into v_cat;
  else
    update menu_categories set name = 'PREORDER CAKE', name_ar = 'كعكة للطلب المسبق', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/63f72233-211c-4e32-aa03-a3f4aaebdf98/conversions/compressed-dsc4965-small.jpg', sort_order = 210, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:251094' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Moka Cake', 'كعكة موكا', null, null, 245, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/839ba7a5-baa5-4b47-8a40-c7c7b7a02d9d/conversions/compressed-dsc4999-optimized.jpg', '{}'::text[], 10, 'apetito:251094', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Moka Cake', name_ar = 'كعكة موكا', description = null, description_ar = null,
      price = 245, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/839ba7a5-baa5-4b47-8a40-c7c7b7a02d9d/conversions/compressed-dsc4999-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:251095' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Vanilla maringue', 'مرنغ الفانيليا', null, null, 250, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/139bdc89-65bc-4193-ac97-f5c27d6aad17/conversions/compressed-dsc4941-optimized.jpg', '{}'::text[], 20, 'apetito:251095', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Vanilla maringue', name_ar = 'مرنغ الفانيليا', description = null, description_ar = null,
      price = 250, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/139bdc89-65bc-4193-ac97-f5c27d6aad17/conversions/compressed-dsc4941-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:251096' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Carrot Cake', 'كعكة الجزر', null, null, 245, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d10f6728-a916-444e-af99-b091cf1ee333/conversions/compressed-dsc4926-optimized.jpg', '{}'::text[], 30, 'apetito:251096', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Carrot Cake', name_ar = 'كعكة الجزر', description = null, description_ar = null,
      price = 245, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d10f6728-a916-444e-af99-b091cf1ee333/conversions/compressed-dsc4926-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:251097' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chocolate Fudge Cake', 'كعكة فادج الشوكولاتة', null, null, 350, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/954a63d9-0af7-4ea2-a1f7-a9f1f792fbeb/conversions/compressed-dsc4959-optimized.jpg', '{}'::text[], 40, 'apetito:251097', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chocolate Fudge Cake', name_ar = 'كعكة فادج الشوكولاتة', description = null, description_ar = null,
      price = 350, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/954a63d9-0af7-4ea2-a1f7-a9f1f792fbeb/conversions/compressed-dsc4959-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:254922' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'San Sebastian', 'سان سيباستيان', null, null, 499, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f1b3f1cb-d23a-476f-8ac3-54913fbf7b9a/conversions/compressed-dsc4944-optimized.jpg', '{}'::text[], 50, 'apetito:254922', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'San Sebastian', name_ar = 'سان سيباستيان', description = null, description_ar = null,
      price = 499, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f1b3f1cb-d23a-476f-8ac3-54913fbf7b9a/conversions/compressed-dsc4944-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;

  -- ===== Cake Collection =====
  select id into v_menu from menu_menus where brand_id = v_brand and pos_menu_id = 'apetito:77640' limit 1;
  if v_menu is null then
    insert into menu_menus (brand_id, name, pos_menu_id, sort_order) values (v_brand, 'Cake Collection', 'apetito:77640', 30) returning id into v_menu;
  else
    update menu_menus set name = 'Cake Collection', sort_order = 30 where id = v_menu;
  end if;

  select id into v_cat from menu_categories where menu_id = v_menu and pos_name = 'apetito:98025' limit 1;
  if v_cat is null then
    insert into menu_categories (brand_id, menu_id, name, name_ar, img, sort_order, station, pos_name)
    values (v_brand, v_menu, 'PREORDER CAKE', 'كعكة للطلب المسبق', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/63f72233-211c-4e32-aa03-a3f4aaebdf98/conversions/compressed-dsc4965-small.jpg', 10, 'kitchen', 'apetito:98025') returning id into v_cat;
  else
    update menu_categories set name = 'PREORDER CAKE', name_ar = 'كعكة للطلب المسبق', img = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/63f72233-211c-4e32-aa03-a3f4aaebdf98/conversions/compressed-dsc4965-small.jpg', sort_order = 10, station = 'kitchen' where id = v_cat;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:254998' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Moka Cake', 'كعكة موكا', null, null, 245, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/839ba7a5-baa5-4b47-8a40-c7c7b7a02d9d/conversions/compressed-dsc4999-optimized.jpg', '{}'::text[], 10, 'apetito:254998', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Moka Cake', name_ar = 'كعكة موكا', description = null, description_ar = null,
      price = 245, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/839ba7a5-baa5-4b47-8a40-c7c7b7a02d9d/conversions/compressed-dsc4999-optimized.jpg', tags = '{}'::text[], sort_order = 10, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:254999' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Vanilla maringue', 'مرنغ الفانيليا', null, null, 250, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/139bdc89-65bc-4193-ac97-f5c27d6aad17/conversions/compressed-dsc4941-optimized.jpg', '{}'::text[], 20, 'apetito:254999', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Vanilla maringue', name_ar = 'مرنغ الفانيليا', description = null, description_ar = null,
      price = 250, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/139bdc89-65bc-4193-ac97-f5c27d6aad17/conversions/compressed-dsc4941-optimized.jpg', tags = '{}'::text[], sort_order = 20, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:255000' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Carrot Cake', 'كعكة الجزر', null, null, 245, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d10f6728-a916-444e-af99-b091cf1ee333/conversions/compressed-dsc4926-optimized.jpg', '{}'::text[], 30, 'apetito:255000', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Carrot Cake', name_ar = 'كعكة الجزر', description = null, description_ar = null,
      price = 245, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d10f6728-a916-444e-af99-b091cf1ee333/conversions/compressed-dsc4926-optimized.jpg', tags = '{}'::text[], sort_order = 30, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:255001' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'Chocolate Fudge Cake', 'كعكة فادج الشوكولاتة', null, null, 350, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/de359b4a-d7ba-4e62-9a0c-a8761fcf5a17/conversions/compressed-dsc4959-optimized.jpg', '{}'::text[], 40, 'apetito:255001', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'Chocolate Fudge Cake', name_ar = 'كعكة فادج الشوكولاتة', description = null, description_ar = null,
      price = 350, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/de359b4a-d7ba-4e62-9a0c-a8761fcf5a17/conversions/compressed-dsc4959-optimized.jpg', tags = '{}'::text[], sort_order = 40, station = 'kitchen' where id = v_item;
  end if;
  select id into v_item from menu_items where pos_id = 'apetito:255002' limit 1;
  if v_item is null then
    insert into menu_items (category_id, name, name_ar, description, description_ar, price, image_url, tags, sort_order, pos_id, station)
    values (v_cat, 'San Sebastian', 'سان سيباستيان', null, null, 499, 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f1b3f1cb-d23a-476f-8ac3-54913fbf7b9a/conversions/compressed-dsc4944-optimized.jpg', '{}'::text[], 50, 'apetito:255002', 'kitchen');
  else
    update menu_items set category_id = v_cat, name = 'San Sebastian', name_ar = 'سان سيباستيان', description = null, description_ar = null,
      price = 499, image_url = 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f1b3f1cb-d23a-476f-8ac3-54913fbf7b9a/conversions/compressed-dsc4944-optimized.jpg', tags = '{}'::text[], sort_order = 50, station = 'kitchen' where id = v_item;
  end if;

  raise notice 'Dubai menus seeded.';
end $$;

-- ---------- check ----------
select m.name as menu, count(distinct c.id) as categories, count(i.id) as items,
       min(i.price) as min_price, max(i.price) as max_price
from menu_menus m
join menu_brands b on b.id = m.brand_id and lower(b.name) = 'chocoberry uae'
left join menu_categories c on c.menu_id = m.id
left join menu_items i on i.category_id = c.id
group by m.name order by m.name;

-- Items with more than one size, seeded at the first variant's price.
-- These want a size modifier group, the same way Tove does Regular/Large:
--   Dubai Menu / ALL DAY BREAKFAST / French Omelette: Classic=53, Cheese=60
--   Dubai Menu / ALL DAY BREAKFAST / Acai Power Bowl: Classic=65, Peanut Butter=70, Mango=70
--   Dubai Menu / APPETIZERS / Quesadilla: Chicken=49, Beef=59
--   Dubai Menu / CHOCOBERRY TREATS / Chocolate Covered Strawberries Selection: Milk Chocolate=59, White Chocolate=59, Mix=59
--   Dubai Menu / SIGNATURE COFFEE / V60: Normal=34, Iced V60=34
--   Dubai Menu / COFFEE / Espresso: Single=18, Double=20, Decafe=25
--   Dubai Menu / COFFEE / Americano: Normal=24, Decafe=32
--   Sharjah Menu / ALL DAY BREAKFAST / French Omelette: Classic=53, Cheese=60
--   Sharjah Menu / ALL DAY BREAKFAST / Acai Power Bowl: Classic=65, Peanut Butter=70, Mango=70
--   Sharjah Menu / APPETIZERS / Quesadilla: Chicken=49, Beef=59
--   Sharjah Menu / CHOCOBERRY TREATS / Chocolate Covered Strawberries Selection: Milk Chocolate=59, White Chocolate=59, Mix=59
--   Sharjah Menu / SIGNATURE COFFEE / V60: Normal=34, Iced V60=34
--   Sharjah Menu / COFFEE / Espresso: Single=18, Double=20, Decafe=22
--   Sharjah Menu / COFFEE / Americano: Normal=24, Decafe=29
