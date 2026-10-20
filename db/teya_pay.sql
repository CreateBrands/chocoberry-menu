-- Teya POSLink integration for the tablet POS.

-- Per-Teya-store machine credentials from POSLink "register ePOS"
-- (scripts/teya-register.mjs writes the INSERTs). Service-role only.
create table if not exists teya_credentials (
  store_id uuid primary key,         -- Teya store UUID
  store_name text,
  client_id text not null,
  client_secret text not null,
  scopes text,
  created_at timestamptz not null default now()
);
alter table teya_credentials enable row level security;   -- no policies: service role only

-- Which Teya card machine serves which store (and optionally which till).
-- One row with tablet_no NULL = the store's default terminal; add rows with a
-- tablet_no when a store has more than one machine. The ids come from
-- scripts/teya-setup.mjs (device-code sign-in) or the Teya Partner portal.
-- store_id is a Teya UUID; terminal_id is NOT — it is a short opaque string
-- such as "gzbd1TTM", so the column is text.
create table if not exists teya_terminals (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references menu_locations(id) on delete cascade,
  store_id uuid not null,          -- Teya store UUID
  terminal_id text not null,       -- Teya terminal id, e.g. "gzbd1TTM"
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
  terminal_id text,
  store_id uuid,
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
-- Safe to re-run: columns added since the first version of this file.
alter table teya_payment_requests add column if not exists store_id uuid;
alter table teya_payment_requests add column if not exists status_reason text;
alter table teya_payment_requests add column if not exists fully_paid boolean;
alter table teya_payment_requests add column if not exists remaining_after numeric(10,2);
-- Teya terminal ids are short opaque strings ("gzbd1TTM"), not UUIDs. The first
-- version of this file assumed UUID and no row was ever inserted to prove
-- otherwise, so existing deployments need the column widened.
alter table teya_terminals        alter column terminal_id type text using terminal_id::text;
alter table teya_payment_requests alter column terminal_id type text using terminal_id::text;

alter table teya_terminals enable row level security;
alter table teya_payment_requests enable row level security;
-- The POS reads teya_terminals (anon) only to know whether to offer the card machine.
drop policy if exists teya_terminals_read on teya_terminals;
create policy teya_terminals_read on teya_terminals for select to anon, authenticated using (active);
-- teya_payment_requests is service-role only (the Edge Function).

-- Example mapping (replace the ids; scripts/teya-setup.mjs prints them filled in):
-- insert into teya_terminals (location_id, store_id, terminal_id, label)
-- select id, '<teya store uuid>', '<teya terminal id>', 'Counter' from menu_locations where name ilike '%london road%';
