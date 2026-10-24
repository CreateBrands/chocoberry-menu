-- ZREPORT 2026-10-24 — numbered Z reports with a running grand total.
-- Run the WHOLE file at once in the Supabase SQL editor (it runs as one
-- transaction). Safe to re-run: closes that already have a number keep it,
-- and any without one are numbered after the highest number at that store.
begin;

-- 1. A Z number per store that only ever goes up, and the running grand total
--    of takings before and after each Z (HMRC look for an unbroken sequence).
alter table till_closures add column if not exists z_number int;
alter table till_closures add column if not exists gt_before numeric(14,2);
alter table till_closures add column if not exists gt_after numeric(14,2);

-- 2. Number the closes that don't have a number yet, oldest first, carrying on
--    from the store's highest number. Running totals follow close order.
with tot as (
  select id,
         coalesce(sum(total_taken) over (partition by location_id order by closed_at nulls last, id
                                         rows between unbounded preceding and 1 preceding), 0) as before,
         coalesce(sum(total_taken) over (partition by location_id order by closed_at nulls last, id), 0) as after
  from till_closures
),
mx as (
  select location_id, coalesce(max(z_number), 0) as top from till_closures group by location_id
),
todo as (
  select t.id, m.top + row_number() over (partition by t.location_id order by t.closed_at nulls last, t.id) as n
  from till_closures t join mx m on m.location_id is not distinct from t.location_id
  where t.z_number is null
)
update till_closures c
   set z_number = todo.n,
       gt_before = coalesce(c.gt_before, round(tot.before::numeric, 2)),
       gt_after  = coalesce(c.gt_after,  round(tot.after::numeric, 2))
  from todo join tot on tot.id = todo.id
 where c.id = todo.id;

-- 3. One Z number per store, never two the same.
create unique index if not exists till_closures_location_z on till_closures (location_id, z_number);

commit;
notify pgrst, 'reload schema';
