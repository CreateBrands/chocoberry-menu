-- Kitchen performance feed for the KDS Performance tab.
-- Completion = the LAST bump among the screens that actually bumped the order
-- (kds_bumped_at only exists once every registered screen has bumped, which
-- rarely happens with idle screens around). Returns a JSON array, one element
-- per non-cancelled order in the window.
drop function if exists public.kds_ticket_times(uuid, timestamptz, timestamptz);
create or replace function public.kds_ticket_times(p_location uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id', o.id,
    'order_no', o.order_no,
    'order_type', o.order_type,
    'tablet_no', o.tablet_no,
    'external_channel', o.external_channel,
    'status', o.status,
    'created_at', o.created_at,
    'kds_started_at', o.kds_started_at,
    'completed_at', coalesce(b.last_bump, o.kds_bumped_at),
    'item_count', coalesce(i.n, 0),
    'bumps', coalesce(b.per_screen, '[]'::jsonb)
  ) order by o.created_at), '[]'::jsonb)
  from menu_orders o
  left join lateral (
    select max(bumped_at) as last_bump,
           jsonb_agg(jsonb_build_object('screen_key', screen_key, 'bumped_at', bumped_at)) as per_screen
    from kds_bumps kb where kb.order_id = o.id
  ) b on true
  left join lateral (select count(*) as n from menu_order_items mi where mi.order_id = o.id and coalesce(mi.item_status::text, '') <> 'voided') i on true
  where o.location_id = p_location
    and o.created_at >= p_from and o.created_at < p_to
    and o.status <> 'cancelled';
$$;
grant execute on function public.kds_ticket_times(uuid, timestamptz, timestamptz) to anon, authenticated;
notify pgrst, 'reload schema';
