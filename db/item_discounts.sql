-- Item-level discounts.
--
-- The money model, which the rest of the system already half-assumes:
--   subtotal              full menu price of every line, before anything
--   items_discount_total  sum of the per-line discounts below
--   total                 subtotal - app_discount - items_discount_total
--   discount_amount       the order-level till discount, taken off total at
--                         payment time (unchanged)
--
-- Keeping subtotal at full price is what lets the day summary report item
-- discounts as discounts rather than as a smaller day.
alter table menu_order_items add column if not exists discount_amount numeric;
alter table menu_order_items add column if not exists discount_type text;    -- percent | amount
alter table menu_order_items add column if not exists discount_value numeric;
alter table menu_order_items add column if not exists discount_scope text;   -- line | unit
alter table menu_order_items add column if not exists discount_reason text;
alter table menu_order_items add column if not exists discount_by text;

alter table menu_orders add column if not exists items_discount_total numeric default 0;

-- Orders written before this existed have no line discounts, so zero is right.
update menu_orders set items_discount_total = 0 where items_discount_total is null;

notify pgrst, 'reload schema';
