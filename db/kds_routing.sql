-- KDS screen routing: which menus / categories / items each screen shows.
-- {"menus":[uuid...],"categories":[uuid...],"items":[uuid...]}. Empty/null = catch-all.
alter table kds_screens add column if not exists routing jsonb;
alter table kds_screens add column if not exists updated_at timestamptz default now();
-- The KDS reads every screen's routing for its store to decide what is "claimed".
alter table kds_screens enable row level security;
drop policy if exists kds_screens_read on kds_screens;
create policy kds_screens_read on kds_screens for select to anon, authenticated using (true);
notify pgrst, 'reload schema';
