-- Close till from the POS: cash count + variance on the closure record.
alter table till_closures add column if not exists cash_counted numeric(10,2);
alter table till_closures add column if not exists float_amount numeric(10,2);
alter table till_closures add column if not exists cash_expected numeric(10,2);
alter table till_closures add column if not exists cash_variance numeric(10,2);
alter table till_closures add column if not exists closed_by text;
alter table till_closures add column if not exists note text;
alter table till_closures add column if not exists other_total numeric(10,2);
alter table till_closures add column if not exists cancelled_count int;

-- Added 10 Oct: close_day writes these but the table never had them, so the
-- insert failed with "Could not find the 'refund_count' column of
-- 'till_closures' in the schema cache" — after the cash had been counted.
alter table till_closures add column if not exists refund_total numeric(10,2);
alter table till_closures add column if not exists refund_count int;
alter table till_closures add column if not exists discount_total numeric(10,2);
alter table till_closures add column if not exists order_count int;
alter table till_closures add column if not exists paid_count int;
alter table till_closures add column if not exists unpaid_total numeric(10,2);
alter table till_closures add column if not exists unpaid_count int;
alter table till_closures add column if not exists period_end timestamptz;
alter table till_closures add column if not exists report jsonb;
alter table till_closures add column if not exists closed_by_member_id text;

notify pgrst, 'reload schema';
