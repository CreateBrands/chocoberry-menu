-- STRINGIQ EOD 2026-11-06 — Close till runs the card machine's end-of-day.
-- Run once in the SQL editor BEFORE deploying teya-pay. Safe to re-run.
-- Each run is tied to the close it belongs to (idem_key) and the café, so a
-- retry of the same close never starts a second end-of-day on the terminal.
alter table siq_end_of_days add column if not exists idem_key    text;
alter table siq_end_of_days add column if not exists location_id uuid;
alter table siq_end_of_days add column if not exists created_at  timestamptz not null default now();
create index if not exists siq_end_of_days_idem on siq_end_of_days(idem_key);
notify pgrst, 'reload schema';
