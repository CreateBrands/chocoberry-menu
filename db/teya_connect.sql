-- TEYA CONNECT 2026-10-29 — connect a store's Teya card machine from Admin.
-- Run once in the Supabase SQL editor, BEFORE deploying admin-api. Safe to re-run.
--
-- A sign-in is a short-lived session: Admin starts Teya's device-code sign-in,
-- the account holder approves it on Teya's page, and the user token it returns
-- is kept here ONLY until the store and terminal are saved — then the row is
-- deleted, so no Teya user token is ever kept. Service-role only.

create table if not exists teya_connect_sessions (
  id           uuid primary key default gen_random_uuid(),
  env          text not null,
  device_code  text not null,
  interval_s   int  not null default 5,
  expires_at   timestamptz not null,
  user_token   text,
  token_expires_at timestamptz,
  created_at   timestamptz not null default now()
);
alter table teya_connect_sessions enable row level security;   -- no policies: service role only

-- Who connected a terminal and when (shown in Admin).
alter table teya_terminals add column if not exists connected_at timestamptz;
alter table teya_terminals add column if not exists connected_by text;

notify pgrst, 'reload schema';
