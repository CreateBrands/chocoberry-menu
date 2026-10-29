-- TEYA REFUNDS 2026-10-30 — card refunds sent back through Teya from the till.
-- Run once in the Supabase SQL editor BEFORE deploying admin-api. Safe to re-run.
-- One row per refund sent to Teya. idem_key is re-sent to re-check a PENDING
-- refund, so Teya returns the same refund instead of making a second one.
create table if not exists teya_refunds (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null,
  payment_request_id  text not null,
  store_id            uuid not null,
  amount              numeric not null check (amount > 0),
  idem_key            text not null unique,
  request             jsonb not null,
  status              text not null default 'SENDING',   -- SENDING | PENDING | SUCCESS | FAILURE
  status_reason       text,
  teya_transaction_id text,
  response            jsonb,
  reason              text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz
);
create index if not exists teya_refunds_order on teya_refunds(order_id);
alter table teya_refunds enable row level security;   -- no policies: service role only

notify pgrst, 'reload schema';
