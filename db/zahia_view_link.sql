-- VIEWONLY 2026-10-24 — a shareable, browse-only menu link for Al Zahia Mall.
-- Customers open https://chocoberry-menu.vercel.app/menu/zahia-menu on their
-- own phone (or scan its QR): they see Al Zahia's menu and prices, with no
-- basket and no ordering. The /menu/ route never claims or locks the link, so
-- any number of phones can open it.
-- Don't put this link on a tablet with ?store= — that route claims a link for
-- one device. Tablets keep their own "Tablet N" links.
-- Safe to re-run: it only adds the link if it isn't there.
do $$
declare v_zm uuid;
begin
  select id into v_zm from menu_locations where lower(name) = 'al zahia mall' limit 1;
  if v_zm is null then raise exception 'Al Zahia Mall not found in menu_locations'; end if;
  insert into menu_tables (location_id, label, qr_token, active, is_table)
  select v_zm, 'Customer menu link (view only — not for tablets)', 'zahia-menu', true, false
  where not exists (select 1 from menu_tables where qr_token = 'zahia-menu');
  raise notice 'Al Zahia view-only link: /menu/zahia-menu';
end $$;
