-- Specific print-failure reason shown on the KDS/POS banner.
alter table menu_orders add column if not exists print_error text;
alter table menu_orders add column if not exists print_failed_at timestamptz;
