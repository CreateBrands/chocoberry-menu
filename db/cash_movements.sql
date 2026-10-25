-- CASH MOVEMENTS + SAFE 2026-10-25 — run once in the Supabase SQL editor,
-- BEFORE deploying admin-api. Safe to run again.
--
-- Every bit of cash that moves outside a sale, in one ledger:
--   payout      till → out of the business (petty cash, supplier paid in cash)
--   payin       into the till (float top-up from the safe, change bought)
--   drop        till → safe   (source: manual = mid-shift, handover, close)
--   collection  safe → area manager for the bank (bag number; banked later)
-- Safe counts are their own table: two people, blind, expected vs counted.
-- Only admin-api (service role) reads or writes these.

create table if not exists cash_movements (
  id              uuid primary key default gen_random_uuid(),
  location_id     uuid not null references menu_locations(id),
  kind            text not null check (kind in ('payout', 'payin', 'drop', 'collection')),
  source          text not null default 'manual',      -- manual | handover | close
  amount          numeric(12,2) not null check (amount > 0),
  reason          text,
  note            text,
  from_safe       boolean not null default false,      -- payin: the cash came out of the safe
  shift_id        uuid,
  closure_id      uuid,
  device_key      text,
  by_name         text,
  by_member       text,
  approved_by     text,                                -- manager who approved (pay-outs over the limit)
  witness_name    text,                                -- collection: store person who handed it over
  bag_no          text,                                -- collection: bank bag number
  banked_amount   numeric(12,2),                       -- collection: what the bank credited
  banked_at       timestamptz,
  banked_by       text,
  reversed_at     timestamptz,
  reversed_by     text,
  created_at      timestamptz not null default now()
);
create index if not exists cash_movements_loc_time on cash_movements (location_id, created_at desc);
alter table cash_movements enable row level security;

create table if not exists safe_counts (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references menu_locations(id),
  counted       numeric(12,2) not null,
  expected      numeric(12,2) not null,
  variance      numeric(12,2) not null,
  denoms        jsonb,
  counted_by    text,
  counted_by_member text,
  witness       text,
  witness_member text,
  note          text,
  created_at    timestamptz not null default now()
);
-- How many times the count was checked before saving, and the first figure.
alter table safe_counts add column if not exists checks int;
alter table safe_counts add column if not exists first_count numeric(12,2);
create index if not exists safe_counts_loc_time on safe_counts (location_id, created_at desc);
alter table safe_counts enable row level security;

notify pgrst, 'reload schema';
