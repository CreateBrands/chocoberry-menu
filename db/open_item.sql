-- Open items: a till line with a name and a price typed by a staff member,
-- for something that is not on the menu.
--
-- Such a line has no menu item behind it, so menu_order_items.item_id has to
-- accept null. Everything else about the line is ordinary — name_snapshot,
-- price_snapshot, qty, line_total — so receipts, the KDS, the day's report
-- and refunds all treat it like any other line without changes.

-- Safe to run more than once: nothing happens if the column is already
-- nullable, and nothing happens if the table does not use a NOT NULL there.
do $$
declare
  v_notnull boolean;
begin
  select a.attnotnull into v_notnull
  from pg_attribute a
  where a.attrelid = 'menu_order_items'::regclass
    and a.attname = 'item_id'
    and a.attnum > 0 and not a.attisdropped;

  if v_notnull is null then
    raise exception 'menu_order_items.item_id not found — check the table name';
  elsif v_notnull then
    alter table menu_order_items alter column item_id drop not null;
    raise notice 'item_id is now nullable; open items can be saved.';
  else
    raise notice 'item_id was already nullable; nothing to do.';
  end if;
end $$;

-- Check: should report 'YES'.
select is_nullable as item_id_nullable
from information_schema.columns
where table_name = 'menu_order_items' and column_name = 'item_id';

notify pgrst, 'reload schema';
