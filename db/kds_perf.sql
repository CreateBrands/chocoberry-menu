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
    'table_label', t.label,
    'customer_note', o.customer_note,
    'completed_at', coalesce(b.last_bump, o.kds_bumped_at),
    'item_count', coalesce(i.n, 0),
    'items', coalesce(i.names, '[]'::jsonb),
    'bumps', coalesce(b.per_screen, '[]'::jsonb)
  ) order by o.created_at), '[]'::jsonb)
  from menu_orders o
  left join menu_tables t on t.id = o.table_id
  left join lateral (
    select max(bumped_at) as last_bump,
           jsonb_agg(jsonb_build_object('screen_key', screen_key, 'bumped_at', bumped_at)) as per_screen
    from kds_bumps kb where kb.order_id = o.id
  ) b on true
  left join lateral (
    select count(*) as n,
           jsonb_agg(jsonb_build_object('name', mi.name_snapshot, 'qty', mi.qty,
                                        'category', mc.name, 'menu', mm.name,
                                        'mods', mi.modifiers_snapshot, 'note', mi.note,
                                        'status', mi.item_status::text)) as names
    from menu_order_items mi
    left join menu_items it on it.id = mi.item_id
    left join menu_categories mc on mc.id = it.category_id
    left join menu_menus mm on mm.id = mc.menu_id
    where mi.order_id = o.id and coalesce(mi.item_status::text, '') <> 'voided'
  ) i on true
  where o.location_id = p_location
    and o.created_at >= p_from and o.created_at < p_to
    and o.status <> 'cancelled';
$$;
grant execute on function public.kds_ticket_times(uuid, timestamptz, timestamptz) to anon, authenticated;
notify pgrst, 'reload schema';

-- Staffing overlay for the Performance tab: who was clocked in at this store
-- during the window (punch_records), with the rota's shift name/role if one exists.
drop function if exists public.kds_staffing(uuid, timestamptz, timestamptz);
create or replace function public.kds_staffing(p_location uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security definer set search_path = public as $$
  with loc as (select store_id from menu_locations where id = p_location)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pr.id,
    'employee_id', pr.employee_id,
    'name', pr.employee_name,
    'punch_in', pr.punch_in,
    'punch_out', pr.punch_out,
    'break_minutes', coalesce(pr.break_minutes, 0),
    'hours_worked', pr.hours_worked,
    'shift', sc.shift,
    'role', sc.role,
    'department', sc.department,
    'scheduled_start', sc.start_time,
    'scheduled_end', sc.end_time
  ) order by pr.punch_in), '[]'::jsonb)
  from punch_records pr
  left join lateral (
    select s.shift, s.role, s.department, s.start_time, s.end_time
    from schedules s
    where s.employee_id = pr.employee_id and s.date = pr.date and (s.store_id = pr.store_id or s.store_id is null)
    order by s.published desc nulls last limit 1
  ) sc on true
  where pr.store_id = (select store_id from loc)
    and pr.punch_in is not null
    and pr.punch_in < p_to
    and coalesce(pr.punch_out, now()) > p_from;
$$;
grant execute on function public.kds_staffing(uuid, timestamptz, timestamptz) to anon, authenticated;
notify pgrst, 'reload schema';
