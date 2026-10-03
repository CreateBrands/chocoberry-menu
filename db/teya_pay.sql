-- Teya POSLink integration for the tablet POS.

-- Which Teya card machine serves which store (and optionally which till).
-- One row with tablet_no NULL = the store's default terminal; add rows with a
-- tablet_no when a store has more than one machine. UUIDs come from
-- teya-pay action "terminals" (admin PIN) or the Teya Partner portal.
create table if not exists teya_terminals (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references menu_locations(id) on delete cascade,
  store_id uuid not null,          -- Teya store UUID
  terminal_id uuid not null,       -- Teya terminal UUID
  tablet_no int,                   -- null = store default
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists teya_terminals_loc on teya_terminals(location_id) where active;

-- Every payment request we push to a terminal, with Teya's status and
-- whether we've booked it into order_payments yet.
create table if not exists teya_payment_requests (
  payment_request_id text primary key,
  order_id uuid not null references menu_orders(id) on delete cascade,
  terminal_id uuid,
  tablet_no int,
  amount numeric(10,2) not null,
  status text not null default 'NEW',       -- NEW | IN_PROGRESS | SUCCESSFUL | FAILED | CANCELLING | CANCELLED
  status_reason text,
  note text,
  raw jsonb,
  recorded_at timestamptz,                  -- when order_payments row was written
  fully_paid boolean,
  remaining_after numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists teya_pr_order on teya_payment_requests(order_id, created_at desc);

alter table teya_terminals enable row level security;
alter table teya_payment_requests enable row level security;
-- The POS reads teya_terminals (anon) only to know whether to offer the card machine.
drop policy if exists teya_terminals_read on teya_terminals;
create policy teya_terminals_read on teya_terminals for select to anon, authenticated using (active);
-- teya_payment_requests is service-role only (the Edge Function).

-- Example mapping (replace the UUIDs):
-- insert into teya_terminals (location_id, store_id, terminal_id, label)
-- select id, '<teya store uuid>', '<teya terminal uuid>', 'Counter' from menu_locations where name ilike '%london road%';
