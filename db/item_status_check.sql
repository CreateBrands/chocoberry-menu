-- Which values the order-line status accepts. Read-only.
select t.typname as enum_name, e.enumlabel as value
from pg_attribute a
join pg_class c on c.oid = a.attrelid and c.relname = 'menu_order_items'
join pg_type t on t.oid = a.atttypid
join pg_enum e on e.enumtypid = t.oid
where a.attname = 'item_status'
order by e.enumsortorder;
