-- ---------------------------------------------------------------------------
-- Sunmi cloud printing: run in the Supabase SQL editor (project qtjsdbasoouslcpinqhu)
-- ---------------------------------------------------------------------------

-- One row per store printer
create table if not exists public.printers (
  id         uuid primary key default gen_random_uuid(),
  store_id   text not null unique,          -- your store identifier, e.g. 'evington-road'
  sn         text not null unique,          -- printer serial, e.g. 'N439263P10499'
  shop_id    text not null,                 -- shop id used when binding via Sunmi API
  label      text,
  active     boolean not null default true,
  bound_at   timestamptz,
  created_at timestamptz not null default now()
);

-- Audit log of every print attempt (also powers idempotency:
-- an order with a 'sent' job is never printed twice)
create table if not exists public.print_jobs (
  id         uuid primary key default gen_random_uuid(),
  order_id   text,
  printer_sn text,
  status     text not null default 'pending',   -- sent | failed
  response   jsonb,
  error      text,
  created_at timestamptz not null default now()
);
create index if not exists print_jobs_order_idx on public.print_jobs (order_id, status);

-- Service-role access only (edge function uses the service key; no client access)
alter table public.printers enable row level security;
alter table public.print_jobs enable row level security;

-- Seed the proving-store printer (adjust store_id/shop_id to taste; keep them stable)
insert into public.printers (store_id, sn, shop_id, label)
values ('evington-road', 'N439263P10499', 'evington-road', 'Chocoberry Evington Road NT311')
on conflict (sn) do nothing;

-- ---------------------------------------------------------------------------
-- Auto-print trigger. Two options — use ONE:
--
-- OPTION A (recommended): Supabase Dashboard -> Database -> Webhooks
--   Create webhook: table = orders, events = INSERT, type = HTTP request
--   URL:    https://qtjsdbasoouslcpinqhu.supabase.co/functions/v1/sunmi-print
--   Method: POST
--   HTTP headers: add  x-print-secret : <your PRINT_WEBHOOK_SECRET>
--   (Dashboard webhooks send {type, table, record, ...} which the function
--   understands natively, and they retry on failure.)
--
-- OPTION B: pg_net trigger (uncomment and replace YOUR_SECRET) — same effect,
-- managed in SQL instead of the dashboard.
-- ---------------------------------------------------------------------------
-- create extension if not exists pg_net;
--
-- create or replace function public.notify_sunmi_print()
-- returns trigger language plpgsql security definer as $$
-- begin
--   perform net.http_post(
--     url     := 'https://qtjsdbasoouslcpinqhu.supabase.co/functions/v1/sunmi-print',
--     headers := jsonb_build_object(
--                  'Content-Type', 'application/json',
--                  'x-print-secret', 'YOUR_SECRET'),
--     body    := jsonb_build_object(
--                  'type', 'INSERT',
--                  'table', 'orders',
--                  'record', to_jsonb(new))
--   );
--   return new;
-- end $$;
--
-- drop trigger if exists trg_sunmi_print on public.orders;
-- create trigger trg_sunmi_print
--   after insert on public.orders
--   for each row execute function public.notify_sunmi_print();
