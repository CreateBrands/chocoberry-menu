-- Put the Sharjah store on dirhams.
--
-- This is the whole data change needed to start the till there. Everything
-- that shows money -- the customer tablets, the till, the cash-up pad, the
-- kitchen board and the printed receipt -- resolves from currency:<store_id>,
-- and a store with no row there is GBP. So setting ONE row for ONE store
-- cannot reach any UK store: they have no row before this runs and no row
-- after it. The last select proves that rather than asserting it.
--
-- It does NOT convert any price. The Sharjah menu prices are whatever is
-- already in the table, now labelled AED instead of GBP, so check them before
-- the till opens.
--
-- accepting_orders is deliberately left alone. It stays off for both UAE
-- stores, which is now exactly right: the tablets stay browse-only and the
-- till is exempt from the pause.
--
-- Safe to re-run.

do $$
declare
  v_loc  uuid;
  v_name text;
  v_n    int;
begin
  select count(*) into v_n
  from menu_locations
  where timezone = 'Asia/Dubai' and active and name ilike '%zahia%';

  if v_n <> 1 then
    raise exception 'Expected exactly one Sharjah store, found %. Run the select at the bottom first and set v_loc by hand.', v_n;
  end if;

  select id, name into v_loc, v_name
  from menu_locations
  where timezone = 'Asia/Dubai' and active and name ilike '%zahia%';

  update menu_app_settings set value = 'AED' where key = 'currency:' || v_loc::text;
  if not found then
    insert into menu_app_settings (key, value) values ('currency:' || v_loc::text, 'AED');
  end if;

  raise notice '% is now on AED', v_name;
end $$;

-- Every store that has a currency setting, next to every store that does not.
-- Anything reading GBP (inherited) is untouched and prices in pounds.
select l.name  as store,
       l.timezone,
       coalesce(s.value, 'GBP (inherited)') as currency,
       case when coalesce(a.value, 'on') = 'off' then 'customers browse only'
            else 'customers can order' end  as tablets
from menu_locations l
left join menu_app_settings s on s.key = 'currency:' || l.id::text
left join menu_app_settings a on a.key = 'accepting_orders:' || l.id::text
where l.active
order by l.timezone desc, l.name;
