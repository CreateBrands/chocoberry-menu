-- Close till from the POS: cash count + variance on the closure record.
alter table till_closures add column if not exists cash_counted numeric(10,2);
alter table till_closures add column if not exists float_amount numeric(10,2);
alter table till_closures add column if not exists cash_expected numeric(10,2);
alter table till_closures add column if not exists cash_variance numeric(10,2);
alter table till_closures add column if not exists closed_by text;
alter table till_closures add column if not exists note text;
alter table till_closures add column if not exists other_total numeric(10,2);
alter table till_closures add column if not exists cancelled_count int;
