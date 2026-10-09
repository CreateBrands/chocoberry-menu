-- Teya Online Payments (Hosted Checkout / Pay by Link)
create table if not exists teya_checkout_stores (
  location_id uuid primary key references menu_locations(id) on delete cascade,
  store_id    text not null,                       -- Teya store UUID for this site
  updated_at  timestamptz not null default now()
);
create table if not exists teya_checkout_sessions (
  id             bigserial primary key,
  order_id       uuid references menu_orders(id) on delete cascade,
  location_id    uuid,
  session_id     text unique,
  amount_minor   integer,
  status         text,
  payment_status text,
  created_at     timestamptz not null default now()
);
create table if not exists teya_checkout_events (
  id         bigserial primary key,
  event_type text,
  reference  text,
  order_id   text,
  payload    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists teya_checkout_sessions_order on teya_checkout_sessions(order_id);
create index if not exists teya_checkout_events_ref on teya_checkout_events(reference);
-- Service-role only: nothing here is readable by the anon key.
alter table teya_checkout_stores   enable row level security;
alter table teya_checkout_sessions enable row level security;
alter table teya_checkout_events   enable row level security;
notify pgrst, 'reload schema';
