-- RECEIPT DESIGNER 2026-10-26 — run once in the Supabase SQL editor, BEFORE
-- deploying admin-api and sunmi-print. Safe to run again.
--
-- The receipt design itself needs no table: it is saved as JSON in
-- menu_app_settings under "receipt:<location id>".
--
-- This adds the UAE tax-invoice number. A simplified tax invoice must carry a
-- unique, sequential number. Order numbers restart and carry the tablet, so
-- each store that issues tax invoices gets its own counter:
--   * receipt_invoice_seq — one row per store: on/off, prefix, next number
--   * menu_orders.invoice_no — e.g. "AZ-000418"
--   * a trigger gives an order its number the moment it is PAID (whatever
--     paid it: till cash, card machine, kiosk, app). An unpaid bill has none
--     and prints as "BILL - NOT A TAX INVOICE". The number never changes once
--     given, and a cancelled or unpaid order never takes one.
-- Admin's Receipt tab switches the counter on for a UAE store and sets its
-- prefix (admin-api receipt_save); UK stores never use it.

create table if not exists receipt_invoice_seq (
  location_id uuid primary key references menu_locations(id) on delete cascade,
  enabled     boolean not null default false,
  prefix      text    not null default '',
  next_no     bigint  not null default 1 check (next_no >= 1),
  updated_at  timestamptz not null default now()
);
alter table receipt_invoice_seq enable row level security;   -- service role only

alter table menu_orders add column if not exists invoice_no text;
create unique index if not exists menu_orders_invoice_no_uq
  on menu_orders (location_id, invoice_no) where invoice_no is not null;

create or replace function public.menu_orders_assign_invoice()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_no bigint;
  v_prefix text;
begin
  if new.invoice_no is null
     and new.paid_method is not null
     and (tg_op = 'INSERT' or old.paid_method is null)
     and new.location_id is not null then
    -- The row lock on the store's counter keeps numbers in order with no
    -- repeats, even when two tills take payment at the same moment.
    update receipt_invoice_seq
       set next_no = next_no + 1, updated_at = now()
     where location_id = new.location_id and enabled
     returning next_no - 1, prefix into v_no, v_prefix;
    if v_no is not null then
      new.invoice_no := case when coalesce(v_prefix, '') = '' then '' else v_prefix || '-' end
                        || lpad(v_no::text, 6, '0');
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists menu_orders_assign_invoice on menu_orders;
create trigger menu_orders_assign_invoice
  before insert or update of paid_method on menu_orders
  for each row execute function public.menu_orders_assign_invoice();

notify pgrst, 'reload schema';

-- Check: should show both ready.
select (select count(*) from information_schema.columns where table_name = 'menu_orders' and column_name = 'invoice_no') as invoice_column_ready,
       (select count(*) from information_schema.triggers where trigger_name = 'menu_orders_assign_invoice') as invoice_trigger_ready;
