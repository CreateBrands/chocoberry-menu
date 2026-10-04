-- FOH service log: one entry per observation on an order (rating, issues,
-- compliments, recovery actions). Traceable back to the ticket.
create table if not exists service_log (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  order_id uuid not null references menu_orders(id) on delete cascade,
  order_no int,
  table_label text,
  rating smallint check (rating between 1 and 5),      -- guest mood as judged by the server
  tags text[] not null default '{}',                    -- e.g. {slow_food, wrong_item, cold_food, compliment}
  category text,                                        -- speed | accuracy | food | drink | service | cleanliness | billing | ambience | other
  severity text check (severity in ('low','medium','high')),
  note text,
  action text,                                          -- apology | remake | discount | comp | manager | none
  action_value numeric,                                 -- £ value of discount/comp if any
  resolved boolean,                                     -- did the guest leave happy?
  item_names text[] not null default '{}',              -- items the issue relates to (names, for trace-back)
  logged_by text,                                       -- staff name resolved from PIN
  logged_by_member_id text,
  source text not null default 'pos',                   -- pos | kds | app
  ticket_secs int,                                      -- kitchen ticket time at the moment of logging (snapshot)
  created_at timestamptz not null default now()
);
create index if not exists service_log_loc_time on service_log(location_id, created_at desc);
create index if not exists service_log_order on service_log(order_id);
alter table service_log enable row level security;
drop policy if exists service_log_read on service_log;
create policy service_log_read on service_log for select to anon, authenticated using (true);
-- "Served" tap from the pass screen → serve time (kitchen done → on the table).
alter table menu_orders add column if not exists served_at timestamptz;
notify pgrst, 'reload schema';
