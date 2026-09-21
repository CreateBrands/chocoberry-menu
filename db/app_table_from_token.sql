-- app_table_from_token: resolve a scanned table QR (the ?store=<token> value)
-- for the customer app. Returns one row or nothing. Anyone may call it (anon
-- or a signed-in customer) — it only exposes what the QR sticker already does.
create or replace function public.app_table_from_token(p_token text)
returns table (
  table_id uuid,
  label text,
  location_id uuid,
  location_name text,
  app_slug text,
  app_visible boolean,
  accepting_orders boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.label,
    t.location_id,
    l.name,
    l.app_slug,
    coalesce(l.app_visible, false),
    coalesce((select s.value from menu_app_settings s
              where s.key = 'accepting_orders:' || t.location_id::text), 'on') <> 'off'
  from menu_tables t
  join menu_locations l on l.id = t.location_id
  where t.qr_token = p_token
    and t.is_table = true
    and coalesce(t.active, true) = true
  limit 1;
$$;

grant execute on function public.app_table_from_token(text) to anon, authenticated;
