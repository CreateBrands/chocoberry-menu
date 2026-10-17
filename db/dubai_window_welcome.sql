-- Turn the window landing page on for the two Dubai stores.
--
-- welcome_style=window is opt-in per store: every other store keeps the
-- welcome it has, so this changes nothing in the UK.
--
-- The landing page builds itself from what the store already carries -- the
-- index from its menus, the feature from hero_slides, the locality from the
-- last line of welcome_subtitle -- so the only new settings are the opening
-- hours, which it cannot infer, and they are optional: leave them out and
-- the hours line simply does not appear.
--
-- welcome_night=on dresses the screen in espresso and gold after five. Left
-- off here: that is a brand decision rather than a technical one, so switch
-- it on once somebody has seen it in an actual store in the evening.
--
-- Safe to re-run: each key is updated if present, inserted if not.

do $$
declare
  r record;
begin
  for r in
    select l.id as loc, t.k, t.v
    from menu_locations l
    cross join (values
      ('welcome_style',      'window'),
      ('welcome_open_hour',  '7'),
      ('welcome_close_hour', '23')
    ) as t(k, v)
    where l.timezone = 'Asia/Dubai'
  loop
    update menu_app_settings set value = r.v where key = r.k || ':' || r.loc::text;
    if not found then
      insert into menu_app_settings (key, value) values (r.k || ':' || r.loc::text, r.v);
    end if;
  end loop;
end $$;

select l.name as store, split_part(s.key, ':', 1) as setting, s.value
from menu_app_settings s
join menu_locations l on s.key like '%:' || l.id::text
where l.timezone = 'Asia/Dubai'
  and split_part(s.key, ':', 1) like 'welcome_%'
order by l.name, 2;
