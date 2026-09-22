-- Marks when items were last appended to an order (customer "add to order").
-- place-order sets it on append; the KDS reads it to show the reopened ticket.
alter table menu_orders add column if not exists items_added_at timestamptz;
