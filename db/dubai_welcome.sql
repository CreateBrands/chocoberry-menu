-- Welcome screen and hero banner for the two Dubai stores.
--
-- Every key is suffixed with the location id. applyStoreOverrides in the app
-- strips that suffix and lets the row win for that store only, so none of
-- this reaches a UK tablet. That also means it cannot be done from the admin
-- Welcome builder, which writes the plain key and would change every store.
--
-- Images and wording come from the live apetito menu, so the tablets match
-- what Dubai already publishes: the Tiramisu Caviar banner and the reddish
-- brown Chocoberry London logo, both from the apetito CDN.
--
-- Safe to re-run: each key is updated if present, inserted if not.

do $$
declare
  v_dt   uuid;
  v_zm   uuid;
  v_logo text := 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/f6672b1d-fca2-4c65-ac68-b9947614e23b/conversions/compressed-chocoberry-logo-reddish-brown-logo_optimized.png';
  v_ban  text := 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/aa402a1d-f0eb-4488-8141-d496771ef7f4/conversions/compressed-tiramisu-caviar-1200px-700pxjpg-banner_optimized.jpg';
  v_hero text;
  r      record;
begin
  select id into v_dt from menu_locations where lower(name) = 'dubai downtown' limit 1;
  select id into v_zm from menu_locations where lower(name) = 'al zahia mall' limit 1;
  if v_dt is null or v_zm is null then
    raise exception 'Dubai stores not found - run the store setup first';
  end if;

  -- One slide. The hero carousel rotates every 4.2s, so a single slide simply
  -- sits still, which is what one banner should do.
  v_hero := '[{"image_url":"' || v_ban || '","tag":"NEW","title":"Tiramisu Caviar","sub":"A new kind of indulgence"}]';

  for r in
    select * from (values
      -- Dubai Downtown
      ('welcome_logo_url',  v_dt, v_logo),
      ('welcome_eyebrow',   v_dt, 'DESSERTS · COFFEE · ALL DAY BREAKFAST'),
      ('welcome_subtitle',  v_dt, 'Boulevard Central Tower 1<br />Downtown Dubai'),
      ('welcome_button',    v_dt, 'View Menu'),
      ('welcome_footer',    v_dt, 'BROWSE THE MENU · ORDER AT THE COUNTER'),
      ('welcome_bg_url',    v_dt, v_ban),
      ('hero_slides',       v_dt, v_hero),
      -- Al Zahia Mall
      ('welcome_logo_url',  v_zm, v_logo),
      ('welcome_eyebrow',   v_zm, 'DESSERTS · COFFEE · ALL DAY BREAKFAST'),
      ('welcome_subtitle',  v_zm, 'City Centre, Al Zahia<br />Sharjah'),
      ('welcome_button',    v_zm, 'View Menu'),
      ('welcome_footer',    v_zm, 'BROWSE THE MENU · ORDER AT THE COUNTER'),
      ('welcome_bg_url',    v_zm, v_ban),
      ('hero_slides',       v_zm, v_hero)
    ) as t(k, loc, val)
  loop
    update menu_app_settings set value = r.val
     where key = r.k || ':' || r.loc::text;
    if not found then
      insert into menu_app_settings (key, value) values (r.k || ':' || r.loc::text, r.val);
    end if;
  end loop;

  raise notice 'Welcome and hero set for both Dubai stores';
end $$;

-- What each store now carries. 7 rows per store.
select l.name as store, split_part(s.key, ':', 1) as setting,
       left(s.value, 70) as value
from menu_app_settings s
join menu_locations l on s.key like '%:' || l.id::text
where l.timezone = 'Asia/Dubai'
order by l.name, 2;
