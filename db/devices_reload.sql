alter table kds_screens add column if not exists reload_requested_at timestamptz;
notify pgrst, 'reload schema';
