-- SHIFTS 2026-10-24 — shift handover at the till (Phase 1).
-- Run once in the Supabase SQL editor, BEFORE deploying admin-api.
--
-- A shift is one cash-drawer session on one till: opened with a float by the
-- incoming person, ended by the outgoing person with a blind count. Sales
-- never stop for the handover: the outgoing shift's sales end at the second
-- they tap "End my shift" (ended_at); cash taken while they count belongs to
-- the next shift and is taken off their count (cash_since_end). The excess
-- over the store's fixed float is dropped to the safe; the Z report subtracts
-- drops from the cash it expects in the drawer at close.

create table if not exists till_shifts (
  id              uuid primary key default gen_random_uuid(),
  location_id     uuid not null references menu_locations(id),
  device_key      text,                     -- till licence key; null = store-level drawer
  status          text not null default 'open' check (status in ('open', 'counting', 'closed')),
  opened_at       timestamptz not null default now(),
  opened_by       text,
  opened_by_member text,
  opening_float   numeric(12,2) not null default 0,
  float_expected  numeric(12,2),            -- float handed over by the previous shift
  float_note      text,                     -- why the incoming float differed
  ended_at        timestamptz,              -- sales boundary for this shift
  ended_by        text,
  ended_by_member text,
  counted_at      timestamptz,
  counted_raw     numeric(12,2),            -- what was physically in the drawer
  cash_since_end  numeric(12,2),            -- cash taken by the next shift during the count
  counted         numeric(12,2),            -- counted_raw - cash_since_end
  expected_cash   numeric(12,2),            -- opening float + this shift's cash
  variance        numeric(12,2),
  denoms          jsonb,
  drop_amount     numeric(12,2),            -- to the safe
  float_left      numeric(12,2),            -- left in the drawer for the next shift
  note            text,
  report          jsonb,                    -- shift summary as printed
  closure_id      uuid,                     -- the end-of-day close it rolled into
  created_at      timestamptz not null default now()
);
create index if not exists till_shifts_loc_time on till_shifts (location_id, opened_at desc);
create index if not exists till_shifts_open on till_shifts (location_id, device_key) where status <> 'closed';
-- One live shift per till at a time.
create unique index if not exists till_shifts_one_live
  on till_shifts (location_id, coalesce(device_key, '')) where status in ('open', 'counting');

-- Only admin-api (service role) reads and writes shifts.
alter table till_shifts enable row level security;

-- Which till took each payment, so a two-till store balances each drawer.
-- (created_at: shifts take cash by payment time; harmless if it exists.)
alter table order_payments add column if not exists created_at timestamptz default now();
alter table order_payments add column if not exists device_key text;
create index if not exists order_payments_device_time on order_payments (device_key, created_at);

-- The Z report's cash drawer: cash dropped to the safe during the day.
alter table till_closures add column if not exists cash_dropped numeric(12,2);

notify pgrst, 'reload schema';
