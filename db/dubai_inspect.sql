-- Read-only. Nothing here writes. Run it and send the output back.
--
-- The tablet chain is: ?store=<qr_token> -> resolve_store(token) -> location,
-- then store_menu_full(loc) -> the rows the tablet renders. Both functions
-- live only in the database, so what decides WHICH menus a store carries —
-- its brand, its menu band, or nothing at all — can't be read from the repo.
-- Everything still outstanding for Dubai depends on that answer.

-- ---------- 1. The two functions that decide what a tablet shows ----------
select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('store_menu_full', 'resolve_store', 'claim_tablet_token')
order by p.proname;

-- ---------- 2. Columns of the three tables the wiring needs ----------
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name in ('menu_tables', 'menu_price_bands', 'menu_band_menus')
order by table_name, ordinal_position;

-- ---------- 3. Where the two Dubai stores actually stand ----------
-- Expect brand_id null on both — the seed put the menus under a new
-- 'Chocoberry UAE' brand but the setup script created the stores without one.
select l.id, l.name, l.slug, l.active, l.timezone,
       l.brand_id, b.name as brand_name,
       l.menu_band_id, l.store_id
from menu_locations l
left join menu_brands b on b.id = l.brand_id
where l.timezone = 'Asia/Dubai'
order by l.name;

-- ---------- 4. What the seed actually created ----------
select b.name as brand, m.id as menu_id, m.name as menu, m.pos_menu_id, m.active, m.sort_order
from menu_menus m join menu_brands b on b.id = m.brand_id
where lower(b.name) = 'chocoberry uae'
order by m.sort_order;

-- ---------- 5. How a UK store is wired, as the working reference ----------
-- Whatever a live UK tablet store has set is the shape Dubai needs to match.
select l.name, l.brand_id, l.menu_band_id, l.price_band_id,
       (select count(*) from menu_tables t where t.location_id = l.id and coalesce(t.is_table, false) = false) as tablets,
       (select count(*) from menu_tables t where t.location_id = l.id and t.is_table) as dining_tables
from menu_locations l
where l.active and l.timezone is null
order by l.name
limit 6;

-- ---------- 6. Which menus each band carries today ----------
select pb.id as band_id, pb.name as band, pb.band_kind,
       m.name as carries_menu
from menu_price_bands pb
left join menu_band_menus bm on bm.band_id = pb.id
left join menu_menus m on m.id = bm.menu_id
where pb.band_kind in ('menu', 'both')
order by pb.name, m.name;
