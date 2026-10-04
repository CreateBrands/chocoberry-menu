-- Close till from the POS: cash count + variance on the closure record.
alter table till_closures add column if not exists cash_counted numeric(10,2);
alter table till_closures add column if not exists float_amount numeric(10,2);
alter table till_closures add column if not exists cash_expected numeric(10,2);
alter table till_closures add column if not exists cash_variance numeric(10,2);
alter table till_closures add column if not exists closed_by text;
alter table till_closures add column if not exists note text;
alter table till_closures add column if not exists other_total numeric(10,2);
alter table till_closures add column if not exists cancelled_count int;
alter table till_closures add column if not exists period_end timestamptz;  -- 04:00 cutoff for trading-day closes
alter table till_closures add column if not exists report jsonb;  -- full closing report for reprint/history
alter table till_closures add column if not exists closed_by_member_id text;  -- ops_team id of the staff member who closed
