-- Kitchen performance feed for the KDS Performance tab.
-- Completion = the LAST bump among the screens that actually bumped the order
-- (kds_bumped_at only exists once every registered screen has bumped, which
-- rarely happens with idle screens around). One row per non-cancelled order.
create or replace function public.kds_ticket_times(p_location uuid, p_from timestamptz, p_to timestamptz)
returns table (
  order_id uuid, order_no int, order_type text, tablet_no text, external_channel text, status text,
  created_at timestamptz, kds_started_at timestamptz, completed_at timestamptz,
  item_count int, bumps jsonb
)
language sql stable security definer set search_path = public as $$
  select o.id, o.order_no, o.order_type, o.tablet_no::text, o.external_channel, o.status,
         o.created_at, o.kds_started_at,
         coalesce(b.last_bump, o.kds_bumped_at) as completed_at,
         coalesce(i.n, 0)::int as item_count,
         coalesce(b.per_screen, '[]'::jsonb) as bumps
  from menu_orders o
  left join lateral (
    select max(bumped_at) as last_bump,
           jsonb_agg(jsonb_build_object('screen_key', screen_key, 'bumped_at', bumped_at)) as per_screen
    from kds_bumps kb where kb.order_id = o.id
  ) b on true
  left join lateral (select count(*) as n from menu_order_items mi where mi.order_id = o.id and coalesce(mi.item_status,'') <> 'voided') i on true
  where o.location_id = p_location
    and o.created_at >= p_from and o.created_at < p_to
    and o.status <> 'cancelled';
$$;
grant execute on function public.kds_ticket_times(uuid, timestamptz, timestamptz) to anon, authenticated;
