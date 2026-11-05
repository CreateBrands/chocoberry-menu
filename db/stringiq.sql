-- STRINGIQ 2026-11-05 — StringIQ card machines alongside Teya.
-- Run once in the Supabase SQL editor BEFORE deploying teya-pay / siq-webhook /
-- admin-api. Safe to re-run.
--
-- StringIQ's Terminal API mirrors Teya POSLink, so it shares Teya's tables:
-- every card machine, payment request and refund row says which provider it
-- belongs to, and the till code stays the same.
--
-- Keys: StringIQ issues one static API key per merchant account, and a key sees
-- only its own merchant's stores. siq_keys holds each key and the webhook
-- signing secret StringIQ shows once when the webhook is registered;
-- siq_stores says which key a StringIQ store belongs to. Service role only.

-- 1) Provider on the shared Teya tables
alter table teya_terminals         add column if not exists provider text not null default 'teya';
alter table teya_payment_requests  add column if not exists provider text not null default 'teya';
alter table teya_refunds           add column if not exists provider text not null default 'teya';

-- What StringIQ actually approved (it includes any tip added on the terminal),
-- the card details for our receipt, and when we acknowledged the booking.
alter table teya_payment_requests add column if not exists approved_amount numeric(10,2);
alter table teya_payment_requests add column if not exists tip_amount      numeric(10,2);
alter table teya_payment_requests add column if not exists card            jsonb;
alter table teya_payment_requests add column if not exists version         int;
alter table teya_payment_requests add column if not exists acknowledged_at timestamptz;
alter table teya_refunds          add column if not exists acknowledged_at timestamptz;

-- Tips taken on the card machine are not sales: kept apart from amount_paid
-- so takings, balances and refunds stay right; the Z-report shows them on
-- their own line.
alter table menu_orders add column if not exists tip_amount numeric(10,2) not null default 0;

-- 2) StringIQ keys and store mapping
create table if not exists siq_keys (
  id               uuid primary key default gen_random_uuid(),
  label            text not null,                 -- e.g. "Create Brands Ltd" — which merchant account
  api_key          text not null unique,          -- siqt_test_… / live key
  signing_secret   text,                          -- whsec_… (shown once by StringIQ)
  secret_last4     text,
  webhook_url      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz
);
alter table siq_keys enable row level security;    -- no policies: service role only

create table if not exists siq_stores (
  store_id    uuid primary key,                    -- StringIQ store id
  store_name  text,
  key_id      uuid not null references siq_keys(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table siq_stores enable row level security;  -- no policies: service role only

-- 3) Every webhook StringIQ sends, stored before we answer 2xx (their rule),
-- de-duplicated on event_id.
create table if not exists siq_webhook_events (
  event_id      text primary key,
  event_type    text not null,
  key_id        uuid,
  object_id     text,                              -- payment_request_id / refund_id / end_of_day_id / terminal_id
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text
);
create index if not exists siq_webhook_events_object on siq_webhook_events(object_id);
alter table siq_webhook_events enable row level security;  -- no policies: service role only

-- 4) End-of-day results per terminal (used by Close till later)
create table if not exists siq_end_of_days (
  end_of_day_id  text primary key,
  terminal_id    text,
  store_id       uuid,
  status         text,
  period_start   timestamptz,
  period_end     timestamptz,
  totals         jsonb,
  raw            jsonb,
  updated_at     timestamptz not null default now()
);
alter table siq_end_of_days enable row level security;     -- no policies: service role only

notify pgrst, 'reload schema';
