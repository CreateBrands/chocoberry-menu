-- Voiding a whole order. The 'cancelled' status already existed and the
-- Z-report already counts cancelled orders, but nothing could set it: only
-- individual fired items could be voided.
alter table menu_orders add column if not exists cancelled_at timestamptz;
alter table menu_orders add column if not exists cancelled_by text;
alter table menu_orders add column if not exists cancel_reason text;

-- Who voided what, kept whatever happens to the order afterwards. A void is
-- the one till action with no paper trail of its own, so it gets a table.
create table if not exists order_voids (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references menu_orders(id) on delete cascade,
  location_id uuid,
  order_no int,
  items_total numeric(10,2),        -- what the order was worth when voided
  item_count int,
  reason text not null,
  voided_by text,                   -- staff name resolved from the PIN
  voided_by_member_id text,
  screen_key text,                  -- which till did it
  created_at timestamptz not null default now()
);
create index if not exists order_voids_loc on order_voids(location_id, created_at desc);
alter table order_voids enable row level security;   -- service role only

notify pgrst, 'reload schema';
