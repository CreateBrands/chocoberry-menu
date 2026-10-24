-- CASH CONTROLS 2026-10-24 — run once in the Supabase SQL editor, BEFORE
-- deploying admin-api. Safe to run again.

-- Wrong-PIN counters for the lockout (5 wrong on a till = locked 5 minutes).
-- Only admin-api (service role) reads or writes it.
create table if not exists pin_attempts (
  key           text primary key,      -- dev:<store>:<till> | ip:<address> | loc:<store>, lk: prefix for name look-ups
  fails         int not null default 0,
  first_fail_at timestamptz,
  locked_until  timestamptz
);
alter table pin_attempts enable row level security;

-- One wrong PIN, counted atomically (parallel guesses can't slip past the limit).
create or replace function pin_fail(p_key text, p_limit int, p_window_s int, p_lock_s int)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into pin_attempts as a (key, fails, first_fail_at, locked_until)
  values (p_key, 1, now(), null)
  on conflict (key) do update set
    fails = case when a.first_fail_at is null or a.first_fail_at < now() - make_interval(secs => p_window_s) then 1 else a.fails + 1 end,
    first_fail_at = case when a.first_fail_at is null or a.first_fail_at < now() - make_interval(secs => p_window_s) then now() else a.first_fail_at end;
  update pin_attempts set fails = 0, first_fail_at = null, locked_until = now() + make_interval(secs => p_lock_s)
  where key = p_key and fails >= p_limit;
end $$;
revoke all on function pin_fail(text, int, int, int) from public, anon, authenticated;

-- Every count taken at a shift handover (a recount until it balances shows on the slip).
alter table till_shifts add column if not exists count_attempts jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';

-- Check (the editor shows this last result): any trigger on order_payments.
-- Undoing a payment now adds a NEGATIVE row with kind 'reversal'. If a trigger
-- listed here refuses negative amounts other than refunds, tell Claude before deploying.
select t.tgname as trigger_name, p.proname as function_name,
       (p.prosrc ~* 'amount\s*<\s*0|negative|refund') as mentions_negatives_or_refunds
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.order_payments'::regclass and not t.tgisinternal;
