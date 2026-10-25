-- KDS SETTLE + OFF-TODAY FIX 2026-10-25 — run once in the Supabase SQL editor.
-- Safe to run again. No edge-function deploy needed.
--
-- 1. kds_settle_order: an order is "served" once every screen that SHOWS it
--    has bumped it. It used to wait for every licensed device at the store —
--    tills, handhelds and idle screens included — which never bump, so orders
--    almost never became served. Now the screens that count are worked out
--    the same way the KDS itself decides what to show:
--      * a line goes to the screens whose routing claims its item, category
--        or menu; a line nobody claims goes to every screen
--      * only screens in use count: kitchen screens seen in the last 15
--        minutes, and KDS+POS devices that have bumped something at this
--        store in the last 3 hours (a handheld used as a till never counts)
--    If no screen in use shows the order, one bump serves it (as before).
--    Customers are not notified on "served" (the app only notifies on
--    "ready"), so this changes no customer messages.
--
-- 2. menu_item_86 ("off today"): back at 06:00 in the STORE's time zone, not
--    London's — Dubai and Sharjah items came back at 09:00 local. Matches the
--    modifier "off today" from the till.

create or replace function public.kds_settle_order(p_order_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_loc uuid;
  v_needed text[];
  v_missing integer;
begin
  select location_id into v_loc from menu_orders where id = p_order_id;
  if v_loc is null then return false; end if;

  with in_use as (
    select s.screen_key
      from kds_screens s
     where s.location_id = v_loc
       and s.active
       and coalesce(s.status, 'active') = 'active'
       and coalesce(s.kind, 'kds') in ('kds', 'kds+pos')
       and s.last_seen_at > now() - interval '15 minutes'
       and (coalesce(s.kind, 'kds') = 'kds'
            or exists (select 1 from kds_bumps b
                        where b.location_id = v_loc and b.screen_key = s.screen_key
                          and b.bumped_at > now() - interval '3 hours'))
  ),
  lines as (
    select i.item_id, mi.category_id, mc.menu_id
      from menu_order_items i
      left join menu_items mi on mi.id = i.item_id
      left join menu_categories mc on mc.id = mi.category_id
     where i.order_id = p_order_id
       and coalesce(i.item_status::text, '') <> 'voided'
  ),
  claims as (
    -- every screen at the store whose routing claims each line (in use or not,
    -- exactly like the KDS: a line claimed only by an idle screen shows nowhere else)
    select l.item_id, l.category_id, l.menu_id, s.screen_key
      from lines l
      join kds_screens s on s.location_id = v_loc and s.routing is not null
     where (l.item_id is not null and (s.routing->'items') ? l.item_id::text)
        or (l.category_id is not null and (s.routing->'categories') ? l.category_id::text)
        or (l.menu_id is not null and (s.routing->'menus') ? l.menu_id::text)
  ),
  needed as (
    -- claimed lines: the claiming screens that are in use
    select c.screen_key from claims c join in_use u on u.screen_key = c.screen_key
    union
    -- unclaimed lines: every screen in use
    select u.screen_key from in_use u
     where exists (select 1 from lines l
                    where not exists (select 1 from claims c
                                       where c.item_id is not distinct from l.item_id
                                         and c.category_id is not distinct from l.category_id
                                         and c.menu_id is not distinct from l.menu_id))
  )
  select array_agg(screen_key) into v_needed from needed;

  if v_needed is null or array_length(v_needed, 1) is null then
    -- Nobody in use shows it: a bump from anywhere serves it, as before.
    if not exists (select 1 from kds_bumps where order_id = p_order_id) then return false; end if;
  else
    select count(*) into v_missing
      from unnest(v_needed) k
     where not exists (select 1 from kds_bumps b where b.order_id = p_order_id and b.screen_key = k);
    if v_missing > 0 then return false; end if;   -- still waiting on a screen that shows it
  end if;

  update menu_orders
     set status = 'served', kds_bumped_at = coalesce(kds_bumped_at, now())
   where id = p_order_id and status <> 'served';
  return true;
end;
$function$;

create or replace function public.menu_item_86(p_location_id uuid, p_item_id uuid)
 returns timestamp with time zone
 language plpgsql
as $function$
declare
  v_tz text;
  v_until timestamptz;
begin
  select coalesce(nullif(trim(timezone), ''), 'Europe/London') into v_tz from menu_locations where id = p_location_id;
  v_tz := coalesce(v_tz, 'Europe/London');
  -- next 06:00 in the store's own time that is still in the future
  v_until := ((now() at time zone v_tz)::date + time '06:00') at time zone v_tz;
  if v_until <= now() then v_until := v_until + interval '1 day'; end if;

  insert into menu_item_overrides (location_id, item_id, unavailable_until)
  values (p_location_id, p_item_id, v_until)
  on conflict (location_id, item_id)
    do update set unavailable_until = excluded.unavailable_until;

  return v_until;
end;
$function$;

notify pgrst, 'reload schema';

-- Check: today's open orders at each store and how many would now settle.
-- (Read-only — shows the effect before any screen bumps again.)
select l.name as store,
       count(*) filter (where o.status = 'served') as served_now,
       count(*) filter (where o.status <> 'served' and exists (select 1 from kds_bumps b where b.order_id = o.id)) as bumped_somewhere_not_served
from menu_orders o join menu_locations l on l.id = o.location_id
where o.closed_at is null and o.created_at > now() - interval '20 hours' and o.status <> 'cancelled'
group by l.name order by l.name;
