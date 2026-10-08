-- Till discounts and refunds
alter table menu_orders add column if not exists discount_amount numeric;
alter table menu_orders add column if not exists discount_reason text;
alter table menu_orders add column if not exists discount_by text;
alter table menu_orders add column if not exists refund_total numeric default 0;
alter table menu_orders add column if not exists refund_reason text;
alter table menu_orders add column if not exists refunded_at timestamptz;
alter table menu_orders add column if not exists refunded_by text;
alter table order_payments add column if not exists kind text default 'payment';
notify pgrst, 'reload schema';
