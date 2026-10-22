-- UAE regional access for the menu admin (/admin) — REGION 2026-10-22a
--
-- Adds a third kind of admin login alongside the master PIN and the per-store
-- PINs: a REGIONAL PIN. It has full admin rights — menus, sections, items,
-- modifiers, bands, prices, stores, store PINs, tablets, tables, KDS/POS
-- devices, printers, per-store branding, till close — but only over the
-- brands it lists. For the UAE that is "Chocoberry UAE", which owns both UAE
-- stores (Dubai Downtown, Al Zahia) and every UAE menu. Nothing on a UK brand
-- is sent to it or can be changed by it; admin-api enforces that server-side.
--
-- The same PIN also works as the manager PIN on UAE KDS/POS screens (screen
-- setup, refunds, big discounts) — at UAE stores only.
--
-- Not available to a regional login: Appearance / Welcome / Hero / Settings
-- (those write chain-wide keys shared with the UK). UAE branding is done per
-- store instead: Stores → <store> → Branding.
--
-- Safe to re-run. Run the whole file in the Supabase SQL editor.

-- ---------- 1. The table ----------
create table if not exists region_pins (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,                 -- shown in the admin sidebar
  pin        text not null unique,
  brand_ids  uuid[] not null,               -- menu_brands this login controls
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
-- Service role only (admin-api). No anon policies: PINs must never be readable
-- from the browser.
alter table region_pins enable row level security;

-- ---------- 2. The UAE login ----------
-- CHANGE THE PIN below before running if you want a different one. It must not
-- match the master PIN or any store PIN (store PINs are checked first, so a
-- clash would log the UAE team into a single store instead).
do $$
declare
  v_pin    text := '587880';
  v_brand  uuid;
  v_bad    int;
begin
  select id into v_brand from menu_brands where lower(name) = 'chocoberry uae' limit 1;
  if v_brand is null then
    raise exception 'Brand "Chocoberry UAE" not found — run db/dubai_menu_seed.sql first';
  end if;

  -- Safety: the fence is the brand. If any non-UAE store sits on this brand,
  -- the UAE team would see it. Refuse rather than leak.
  select count(*) into v_bad from menu_locations
   where brand_id = v_brand and coalesce(timezone, '') <> 'Asia/Dubai';
  if v_bad > 0 then
    raise exception '% store(s) on Chocoberry UAE are not on Asia/Dubai time — check them before granting regional access', v_bad;
  end if;

  if exists (select 1 from store_pins where pin = v_pin) then
    raise exception 'PIN % is already a store PIN — choose another', v_pin;
  end if;

  insert into region_pins (label, pin, brand_ids, active)
  values ('UAE team', v_pin, array[v_brand], true)
  on conflict (pin) do update set brand_ids = excluded.brand_ids, label = excluded.label, active = true;

  raise notice 'UAE regional login ready: PIN %, brand %', v_pin, v_brand;
end $$;

-- ---------- 3. Check: what the UAE login will see ----------
select rp.label, rp.active,
       b.name                                                     as brand,
       (select string_agg(l.name, ', ' order by l.name)
          from menu_locations l where l.brand_id = b.id)          as stores,
       (select count(*) from menu_menus m where m.brand_id = b.id) as menus,
       (select count(*) from menu_modifier_groups g where g.brand_id = b.id) as modifier_groups,
       (select count(*) from menu_price_bands pb where pb.brand_id = b.id)  as bands
from region_pins rp
cross join lateral unnest(rp.brand_ids) as bid
join menu_brands b on b.id = bid
order by rp.label;

-- ---------- 4. Check: any UAE store pointing at a band the UAE login can't see ----------
-- Should return no rows. A row here means that store's band belongs to another
-- brand (e.g. the UK Master band) — the UAE team could not edit it.
select l.name as store, pb.name as band, pb.band_kind, ob.name as band_brand
from menu_locations l
join menu_brands b on b.id = l.brand_id and lower(b.name) = 'chocoberry uae'
join menu_price_bands pb on pb.id in (l.price_band_id, l.menu_band_id)
left join menu_brands ob on ob.id = pb.brand_id
where pb.brand_id is distinct from l.brand_id;

-- To revoke later:   update region_pins set active = false where label = 'UAE team';
-- To change the PIN: update region_pins set pin = '<new>' where label = 'UAE team';
