-- Dubai tablets: 10 links per store, and both stores set to browse-only.
--
-- A tablet link is a menu_tables row with is_table = false. The admin builds
-- these one at a time through create_token; this does the same thing twenty
-- times, with the same 12-character token shape, so the two routes stay
-- interchangeable.
--
-- Browse-only is the existing accepting_orders flag. Worth knowing what it
-- does: the basket still works and the customer is only turned away at the
-- submit step, with a message pointing them to the counter. That reads as a
-- fault rather than a design, so if Dubai stays browse-only it is worth
-- building a real view-only mode later that hides the basket outright.
--
-- Safe to re-run. A tablet is created only when that store has no tablet
-- with the same label, so a second run adds nothing and re-rolls no tokens.
-- Re-rolling matters: a token is claimed by a device, and changing it would
-- strand the tablet already using the old link.

do $$
declare
  v_dt uuid;
  v_zm uuid;
  v_made int;
begin
  select id into v_dt from menu_locations where lower(name) = 'dubai downtown' limit 1;
  select id into v_zm from menu_locations where lower(name) = 'al zahia mall' limit 1;
  if v_dt is null or v_zm is null then
    raise exception 'Dubai stores not found - run the store setup first';
  end if;

  insert into menu_tables (location_id, label, qr_token, active, is_table)
  select v_dt, 'Tablet ' || g,
         substring(replace(gen_random_uuid()::text, '-', ''), 1, 12),
         true, false
  from generate_series(1, 10) g
  where not exists (
    select 1 from menu_tables t
     where t.location_id = v_dt and t.label = 'Tablet ' || g
  );
  get diagnostics v_made = row_count;
  raise notice 'Dubai Downtown: % tablet links created', v_made;

  insert into menu_tables (location_id, label, qr_token, active, is_table)
  select v_zm, 'Tablet ' || g,
         substring(replace(gen_random_uuid()::text, '-', ''), 1, 12),
         true, false
  from generate_series(1, 10) g
  where not exists (
    select 1 from menu_tables t
     where t.location_id = v_zm and t.label = 'Tablet ' || g
  );
  get diagnostics v_made = row_count;
  raise notice 'Al Zahia Mall: % tablet links created', v_made;

  -- Browse-only. Only the exact string off counts as paused.
  update menu_app_settings set value = 'off' where key = 'accepting_orders:' || v_dt::text;
  if not found then
    insert into menu_app_settings (key, value) values ('accepting_orders:' || v_dt::text, 'off');
  end if;
  update menu_app_settings set value = 'off' where key = 'accepting_orders:' || v_zm::text;
  if not found then
    insert into menu_app_settings (key, value) values ('accepting_orders:' || v_zm::text, 'off');
  end if;
end $$;

-- The twenty links, ready to open on the tablets.
select l.name as store,
       t.label,
       'https://chocoberry-menu.vercel.app/?store=' || t.qr_token
         || '&tablet=' || regexp_replace(t.label, '\D', '', 'g') as link
from menu_tables t
join menu_locations l on l.id = t.location_id
where l.timezone = 'Asia/Dubai'
  and coalesce(t.is_table, false) = false
order by l.name, length(t.label), t.label;

-- Confirms both stores are browse-only and priced in AED.
select l.name as store,
       max(case when s.key like 'accepting_orders:%' then s.value end) as ordering,
       max(case when s.key like 'currency:%' then s.value end) as currency
from menu_locations l
join menu_app_settings s on s.key like '%' || l.id::text
where l.timezone = 'Asia/Dubai'
group by l.name
order by l.name;
