-- ORDERS LOCKDOWN 2026-10-24 — run AFTER the new app version is live and the
-- KDS screens have reloaded (the KDS now starts tickets and ticks lines through
-- admin-api instead of writing to these tables directly).
--
-- Until now RLS was off on menu_orders, so anyone with the public key could
-- read, change or delete any order. After this:
--   * the tablet, POS, KDS, customer app and dashboard can still READ orders;
--   * nobody can write to them with the public key — orders are created and
--     changed only by the server functions (service role), which RLS does not
--     affect, and by the database functions below.
-- Run outside a busy period. If it times out, run it again.

-- 1. Database functions that change orders run as the caller today, so with
--    RLS on they would stop working. Make each run as its owner, as it
--    effectively did with RLS off.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and not p.prosecdef
      and p.prosrc ~* '(update|insert\s+into|delete\s+from)\s+(public\.)?"?menu_order(s|_items)("|\M)'
  loop
    execute format('alter function %s security definer set search_path = public', f.sig);
    raise notice 'security definer: %', f.sig;
  end loop;
end $$;

-- 2. Row-level security: read-only for the public key and signed-in users.
set lock_timeout = '3s';
alter table menu_orders enable row level security;
alter table menu_order_items enable row level security;
drop policy if exists orders_read on menu_orders;
create policy orders_read on menu_orders for select to anon, authenticated using (true);
drop policy if exists order_items_read on menu_order_items;
create policy order_items_read on menu_order_items for select to anon, authenticated using (true);

notify pgrst, 'reload schema';

-- 3. What changed (the editor shows this last result).
select p.oid::regprocedure as now_runs_as_owner
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and p.prosrc ~* '(update|insert\s+into|delete\s+from)\s+(public\.)?"?menu_order(s|_items)("|\M)';

-- To undo in an emergency:
--   alter table menu_orders disable row level security;
--   alter table menu_order_items disable row level security;
